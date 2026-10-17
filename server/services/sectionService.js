/**
 * Section (clearance stage) administration.
 *
 * The workflow itself is data, not code: stages live in `clearance_stages` and
 * their ordering constraints in `stage_prerequisites`. This service lets an
 * admin reshape that workflow at runtime while protecting the two invariants
 * the rest of the system depends on:
 *
 *   1. Every student has a `clearance_status` row for every active stage —
 *      otherwise a new section would be invisible to students already enrolled.
 *   2. The prerequisite graph stays acyclic — a cycle would deadlock clearance,
 *      since each stage in the loop would wait on the others forever.
 */
const { query, queryOne, withTransaction } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');

function notifyStageChange() {
  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', {});
    broadcast('clearance:update', {});
  } catch (err) {
    console.warn('[realtime] sectionService emit failed:', err.message);
  }
}

/** Stages with prerequisite ids, officer counts, and how many students are mid-stage. */
async function listSections() {
  const rows = await query(
    `SELECT s.*,
            (SELECT GROUP_CONCAT(sp.prerequisite_stage_id)
               FROM stage_prerequisites sp WHERE sp.stage_id = s.id) AS prerequisite_ids,
            (SELECT COUNT(*) FROM users u
              WHERE u.role = 'officer' AND u.section_code = s.code) AS officer_count,
            (SELECT COUNT(*) FROM stage_requirements sr WHERE sr.stage_id = s.id) AS requirement_count,
            (SELECT COUNT(*) FROM clearance_status cs
              WHERE cs.stage_id = s.id AND cs.status = 'pending') AS pending_count,
            (SELECT COUNT(*) FROM clearance_status cs
              WHERE cs.stage_id = s.id AND cs.status <> 'not_started') AS activity_count
       FROM clearance_stages s
       ORDER BY s.stage_order`
  );

  return rows.map((s) => ({
    ...s,
    is_active: Boolean(s.is_active),
    requires_payment: Boolean(s.requires_payment),
    payment_amount: Number(s.payment_amount),
    officer_count: Number(s.officer_count),
    requirement_count: Number(s.requirement_count),
    pending_count: Number(s.pending_count),
    activity_count: Number(s.activity_count),
    prerequisite_ids: s.prerequisite_ids ? s.prerequisite_ids.split(',').map(Number) : [],
    // A stage students have already engaged with cannot be safely hard-deleted.
    can_delete: Number(s.activity_count) === 0,
  }));
}

/**
 * Create a section and backfill it for every existing student.
 *
 * Without the backfill, students who registered earlier would never see the
 * new stage: their clearance is materialised as rows, not computed on read.
 */
async function createSection(adminId, input) {
  const code = String(input.code).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const clash = await queryOne('SELECT id FROM clearance_stages WHERE code = ?', [code]);
  if (clash) throw new ApiError('A section with that code already exists.', 409);

  return withTransaction(async (conn) => {
    // Append to the end of the workflow unless a position was given.
    let order = Number(input.stage_order);
    if (!order) {
      const [[row]] = await conn.query('SELECT COALESCE(MAX(stage_order), 0) + 1 AS next FROM clearance_stages');
      order = row.next;
    } else {
      // Make room: shift everything at or after the requested position down.
      await conn.query('UPDATE clearance_stages SET stage_order = stage_order + 1 WHERE stage_order >= ?', [order]);
    }

    const [result] = await conn.query(
      `INSERT INTO clearance_stages
         (code, stage_name, stage_order, location, description,
          estimated_duration_days, requires_payment, payment_amount, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        code,
        input.stage_name.trim(),
        order,
        input.location?.trim() || null,
        input.description?.trim() || null,
        Number(input.estimated_duration_days) || 1,
        input.requires_payment ? 1 : 0,
        input.requires_payment ? Number(input.payment_amount) || 0 : 0,
      ]
    );

    const stageId = result.insertId;

    // Backfill: give every existing student a row for the new stage.
    const [students] = await conn.query("SELECT id FROM users WHERE role = 'student'");
    if (students.length) {
      const values = students.map((s) => [s.id, stageId, 'not_started']);
      await conn.query(
        `INSERT IGNORE INTO clearance_status (student_id, stage_id, status)
         VALUES ${values.map(() => '(?, ?, ?)').join(', ')}`,
        values.flat()
      );
    }

    await conn.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, 'create_section', 'clearance_stages', ?, ?)`,
      [adminId, stageId, JSON.stringify({ code, stage_name: input.stage_name, backfilled: students.length })]
    );

    notifyStageChange();
    return { id: stageId, code, stage_order: order, students_backfilled: students.length };
  });
}

/** Update a section's descriptive fields. Code is immutable — officers key off it. */
async function updateSection(adminId, stageId, input) {
  const stage = await queryOne('SELECT * FROM clearance_stages WHERE id = ?', [stageId]);
  if (!stage) throw new ApiError('Section not found.', 404);

  const requiresPayment = input.requires_payment ?? Boolean(stage.requires_payment);

  await query(
    `UPDATE clearance_stages
        SET stage_name = ?, location = ?, description = ?,
            estimated_duration_days = ?, requires_payment = ?, payment_amount = ?
      WHERE id = ?`,
    [
      input.stage_name?.trim() || stage.stage_name,
      input.location?.trim() ?? stage.location,
      input.description?.trim() ?? stage.description,
      Number(input.estimated_duration_days) || stage.estimated_duration_days,
      requiresPayment ? 1 : 0,
      requiresPayment ? Number(input.payment_amount ?? stage.payment_amount) || 0 : 0,
      stageId,
    ]
  );

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'update_section', 'clearance_stages', ?, ?)`,
    [adminId, stageId, JSON.stringify({ stage_name: input.stage_name })]
  );

  notifyStageChange();
  return { message: `"${input.stage_name || stage.stage_name}" updated.` };
}

/**
 * Take a section out of the workflow.
 *
 * Deactivating is the default because it preserves history: past approvals stay
 * auditable and the stage simply stops appearing in new clearance runs. A hard
 * delete is offered only for a stage no student has touched, since the FK
 * cascade would otherwise erase real approval records.
 */
async function setSectionActive(adminId, stageId, isActive) {
  const stage = await queryOne('SELECT id, code, stage_name FROM clearance_stages WHERE id = ?', [stageId]);
  if (!stage) throw new ApiError('Section not found.', 404);

  return withTransaction(async (conn) => {
    await conn.query('UPDATE clearance_stages SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, stageId]);

    // Reactivating has to backfill too — students added while it was off have no row.
    let backfilled = 0;
    if (isActive) {
      const [students] = await conn.query("SELECT id FROM users WHERE role = 'student'");
      if (students.length) {
        const values = students.map((s) => [s.id, stageId, 'not_started']);
        const [res] = await conn.query(
          `INSERT IGNORE INTO clearance_status (student_id, stage_id, status)
           VALUES ${values.map(() => '(?, ?, ?)').join(', ')}`,
          values.flat()
        );
        backfilled = res.affectedRows;
      }
    }

    await conn.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'clearance_stages', ?, ?)`,
      [
        adminId,
        isActive ? 'activate_section' : 'deactivate_section',
        stageId,
        JSON.stringify({ code: stage.code, backfilled }),
      ]
    );

    notifyStageChange();
    return {
      message: `"${stage.stage_name}" ${isActive ? 'reactivated' : 'removed from the workflow'}.`,
      backfilled,
    };
  });
}

/** Permanently delete a section — refused once students have engaged with it. */
async function deleteSection(adminId, stageId) {
  const stage = await queryOne('SELECT id, code, stage_name FROM clearance_stages WHERE id = ?', [stageId]);
  if (!stage) throw new ApiError('Section not found.', 404);

  const [{ activity }] = await query(
    `SELECT COUNT(*) AS activity FROM clearance_status
      WHERE stage_id = ? AND status <> 'not_started'`,
    [stageId]
  );

  if (Number(activity) > 0) {
    throw new ApiError(
      `"${stage.stage_name}" already has ${activity} student submission(s) on record, so deleting it would erase approval history. Deactivate it instead — it will disappear from student clearance without losing the audit trail.`,
      409
    );
  }

  const officers = await query("SELECT id FROM users WHERE role = 'officer' AND section_code = ?", [stage.code]);
  if (officers.length) {
    throw new ApiError(
      `${officers.length} officer account(s) still belong to this section. Reassign or deactivate them first.`,
      409
    );
  }

  return withTransaction(async (conn) => {
    // FK cascades clear clearance_status, stage_requirements and prerequisite edges.
    await conn.query('DELETE FROM clearance_stages WHERE id = ?', [stageId]);

    // Close the gap left in the ordering so stage numbers stay 1..n.
    await conn.query('SET @n := 0');
    await conn.query('UPDATE clearance_stages SET stage_order = (@n := @n + 1) ORDER BY stage_order');

    await conn.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, 'delete_section', 'clearance_stages', ?, ?)`,
      [adminId, stageId, JSON.stringify({ code: stage.code, stage_name: stage.stage_name })]
    );

    notifyStageChange();
    return { message: `"${stage.stage_name}" deleted.` };
  });
}

/** Persist a new stage ordering from an array of stage ids. */
async function reorderSections(adminId, orderedIds) {
  const stages = await query('SELECT id FROM clearance_stages');
  const known = new Set(stages.map((s) => s.id));

  if (orderedIds.length !== known.size || orderedIds.some((id) => !known.has(id))) {
    throw new ApiError('The new order must list every section exactly once.', 400);
  }

  return withTransaction(async (conn) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await conn.query('UPDATE clearance_stages SET stage_order = ? WHERE id = ?', [i + 1, orderedIds[i]]);
    }

    await conn.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, details)
       VALUES (?, 'reorder_sections', 'clearance_stages', ?)`,
      [adminId, JSON.stringify({ order: orderedIds })]
    );

    notifyStageChange();
    return { message: 'Section order updated.' };
  });
}

/**
 * Replace a section's prerequisites, rejecting anything that would create a cycle.
 *
 * A cycle is checked against the graph as it would be *after* the change, not
 * before, so an edit that closes a loop through unrelated stages is still caught.
 */
async function setPrerequisites(adminId, stageId, prerequisiteIds) {
  const stage = await queryOne('SELECT id, stage_name FROM clearance_stages WHERE id = ?', [stageId]);
  if (!stage) throw new ApiError('Section not found.', 404);

  const unique = [...new Set(prerequisiteIds.map(Number))];

  if (unique.includes(stageId)) {
    throw new ApiError('A section cannot be its own prerequisite.', 400);
  }

  if (unique.length) {
    const found = await query(
      `SELECT id FROM clearance_stages WHERE id IN (${unique.map(() => '?').join(',')})`,
      unique
    );
    if (found.length !== unique.length) {
      throw new ApiError('One or more prerequisite sections do not exist.', 400);
    }
  }

  // Build the prospective graph: existing edges, minus this stage's, plus the new ones.
  const edges = await query('SELECT stage_id, prerequisite_stage_id FROM stage_prerequisites');
  const dependsOn = new Map();
  for (const e of edges) {
    if (e.stage_id === stageId) continue;
    if (!dependsOn.has(e.stage_id)) dependsOn.set(e.stage_id, []);
    dependsOn.get(e.stage_id).push(e.prerequisite_stage_id);
  }
  dependsOn.set(stageId, unique);

  // Any path from a prerequisite back to this stage means the edge closes a loop.
  const seen = new Set();
  const reaches = (from, target) => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (dependsOn.get(from) || []).some((next) => reaches(next, target));
  };

  for (const prereq of unique) {
    seen.clear();
    if (reaches(prereq, stageId)) {
      const culprit = await queryOne('SELECT stage_name FROM clearance_stages WHERE id = ?', [prereq]);
      throw new ApiError(
        `"${culprit.stage_name}" already depends on "${stage.stage_name}" (directly or through another section). Adding it here would create a loop that no student could ever complete.`,
        400
      );
    }
  }

  return withTransaction(async (conn) => {
    await conn.query('DELETE FROM stage_prerequisites WHERE stage_id = ?', [stageId]);

    if (unique.length) {
      const values = unique.map((id) => [stageId, id]);
      await conn.query(
        `INSERT INTO stage_prerequisites (stage_id, prerequisite_stage_id)
         VALUES ${values.map(() => '(?, ?)').join(', ')}`,
        values.flat()
      );
    }

    await conn.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, 'set_prerequisites', 'clearance_stages', ?, ?)`,
      [adminId, stageId, JSON.stringify({ prerequisites: unique })]
    );

    notifyStageChange();
    return {
      message: unique.length
        ? `"${stage.stage_name}" now requires ${unique.length} earlier section(s).`
        : `"${stage.stage_name}" no longer has prerequisites.`,
    };
  });
}

module.exports = {
  listSections,
  createSection,
  updateSection,
  setSectionActive,
  deleteSection,
  reorderSections,
  setPrerequisites,
};
