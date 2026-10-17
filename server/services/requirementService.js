/**
 * Stage requirement management.
 *
 * A section officer decides which documents their own stage asks for, so the
 * checklist a student sees is owned by the people who actually review it rather
 * than being frozen in the seed data.
 *
 * `stage_requirements` maps stages to document *types*, and a student uploads
 * each type once into their vault. That means adding a requirement here can be
 * satisfied by a file the student already uploaded for another stage.
 */
const { query, queryOne } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');

/**
 * Every document type, flagged with whether this stage currently requires it.
 * One query drives the officer's whole editing screen: checked rows are current
 * requirements, unchecked rows are what they could add.
 */
async function getStageRequirements(stageId) {
  const rows = await query(
    `SELECT dt.id AS document_type_id, dt.code, dt.label, dt.description,
            sr.stage_id IS NOT NULL AS is_required,
            COALESCE(sr.is_mandatory, TRUE) AS is_mandatory
       FROM document_types dt
       LEFT JOIN stage_requirements sr
              ON sr.document_type_id = dt.id AND sr.stage_id = ?
      ORDER BY dt.label`,
    [stageId]
  );

  // How many stages ask for each type, so the officer can see that removing a
  // shared document (e.g. school fee receipts) won't affect other sections.
  const usage = await query(
    `SELECT document_type_id, COUNT(*) AS stage_count
       FROM stage_requirements
      GROUP BY document_type_id`
  );
  const usageByType = new Map(usage.map((u) => [u.document_type_id, Number(u.stage_count)]));

  return rows.map((r) => ({
    document_type_id: r.document_type_id,
    code: r.code,
    label: r.label,
    description: r.description,
    is_required: Boolean(r.is_required),
    is_mandatory: Boolean(r.is_mandatory),
    // Only meaningful for rows this stage requires.
    used_by_other_stages: Math.max(0, (usageByType.get(r.document_type_id) || 0) - (r.is_required ? 1 : 0)),
  }));
}

/**
 * Count students who would be affected by a change to this stage's checklist.
 *
 * Officers get this before saving: adding a requirement mid-session means
 * anyone already waiting is now short a document, which is worth knowing.
 */
async function countStudentsInFlight(stageId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total
       FROM clearance_status
      WHERE stage_id = ? AND status = 'pending'`,
    [stageId]
  );
  return Number(row?.total || 0);
}

/**
 * Add a document type to a stage's checklist (or update its mandatory flag).
 */
async function addRequirement(stageId, documentTypeId, isMandatory = true) {
  const docType = await queryOne('SELECT id, label FROM document_types WHERE id = ?', [documentTypeId]);
  if (!docType) throw new ApiError('That document type does not exist.', 404);

  await query(
    `INSERT INTO stage_requirements (stage_id, document_type_id, is_mandatory)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_mandatory = VALUES(is_mandatory)`,
    [stageId, documentTypeId, isMandatory ? 1 : 0]
  );

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', { stageId });
    broadcast('clearance:update', { stageId });
  } catch (err) {
    console.warn('[realtime] addRequirement emit failed:', err.message);
  }

  return { message: `"${docType.label}" is now requested by this stage.` };
}

/**
 * Drop a document type from a stage's checklist.
 *
 * Files students already uploaded are deliberately left in their vault: the
 * upload belongs to the student, and another stage may still need it. Removing
 * a requirement only stops this stage from asking for it.
 */
async function removeRequirement(stageId, documentTypeId) {
  const existing = await queryOne(
    `SELECT dt.label
       FROM stage_requirements sr
       JOIN document_types dt ON dt.id = sr.document_type_id
      WHERE sr.stage_id = ? AND sr.document_type_id = ?`,
    [stageId, documentTypeId]
  );
  if (!existing) throw new ApiError('This stage does not request that document.', 404);

  await query('DELETE FROM stage_requirements WHERE stage_id = ? AND document_type_id = ?', [
    stageId,
    documentTypeId,
  ]);

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', { stageId });
    broadcast('clearance:update', { stageId });
  } catch (err) {
    console.warn('[realtime] removeRequirement emit failed:', err.message);
  }

  return { message: `"${existing.label}" is no longer requested by this stage.` };
}

/**
 * Create a document type this section needs but the system doesn't know yet.
 *
 * Codes are derived from the label so officers never have to invent one, and a
 * clash is reported plainly instead of surfacing a raw duplicate-key error.
 */
async function createDocumentType({ label, description }) {
  const cleanLabel = String(label || '').trim();
  if (cleanLabel.length < 3) {
    throw new ApiError('Give the document a name of at least 3 characters.', 400);
  }

  const code = cleanLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

  const clash = await queryOne('SELECT id FROM document_types WHERE code = ? OR label = ?', [
    code,
    cleanLabel,
  ]);
  if (clash) throw new ApiError('A document with that name already exists.', 409);

  const result = await query(
    'INSERT INTO document_types (code, label, description) VALUES (?, ?, ?)',
    [code, cleanLabel, description?.trim() || null]
  );

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', {});
  } catch (err) {
    console.warn('[realtime] createDocumentType emit failed:', err.message);
  }

  return { id: result.insertId, code, label: cleanLabel, description: description?.trim() || null };
}

module.exports = {
  getStageRequirements,
  countStudentsInFlight,
  addRequirement,
  removeRequirement,
  createDocumentType,
};
