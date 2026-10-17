/**
 * Section Form Service
 * Allows section officers to define custom clearance form fields/questions
 * for their section, and students to fill them out when completing clearance.
 */
const { query, queryOne } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');

function parseOptions(options) {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  try {
    const parsed = JSON.parse(options);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {
    // If not JSON, split by comma
    return String(options).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Fetch all form fields configured for a clearance stage.
 * Scoped to officer's hall, department, or faculty if officer is specified.
 */
async function getStageFormFields(stageId, officerUser = null) {
  let sql = `
    SELECT id, stage_id, officer_id, hall, department, faculty, field_label, field_type, field_options, placeholder, help_text,
           is_required, order_index, created_at
      FROM section_form_fields
     WHERE stage_id = ?
  `;
  const params = [stageId];

  if (officerUser) {
    if (officerUser.section_code === 'hall' && officerUser.hall) {
      sql += ` AND (LOWER(TRIM(hall)) = LOWER(TRIM(?)) OR hall IS NULL)`;
      params.push(officerUser.hall);
    } else if (officerUser.section_code === 'department' && officerUser.department) {
      sql += ` AND (LOWER(TRIM(department)) = LOWER(TRIM(?)) OR department IS NULL)`;
      params.push(officerUser.department);
    } else if (officerUser.section_code === 'faculty' && officerUser.faculty) {
      const cleanFac = officerUser.faculty.replace(/^Faculty of\s+/i, '').trim();
      sql += ` AND (LOWER(TRIM(faculty)) = LOWER(TRIM(?)) OR LOWER(TRIM(faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))) OR faculty IS NULL)`;
      params.push(cleanFac, cleanFac);
    }
  }

  sql += ` ORDER BY order_index ASC, id ASC`;
  const fields = await query(sql, params);

  return fields.map((f) => ({
    ...f,
    is_required: Boolean(f.is_required),
    options: parseOptions(f.field_options),
  }));
}

/**
 * Create a new form field for a section stage with officer scope (hall/dept/faculty).
 */
async function createStageFormField(stageId, data, officerUser = null) {
  const {
    field_label,
    field_type = 'text',
    field_options = null,
    placeholder = null,
    help_text = null,
    is_required = true,
  } = data;

  if (!field_label || field_label.trim().length < 2) {
    throw new ApiError('Field label or question title is required.', 400);
  }

  const validTypes = ['text', 'textarea', 'number', 'date', 'select'];
  if (!validTypes.includes(field_type)) {
    throw new ApiError(`Invalid field type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  // Determine order index
  const last = await queryOne(
    `SELECT MAX(order_index) AS max_order FROM section_form_fields WHERE stage_id = ?`,
    [stageId]
  );
  const nextOrder = (last?.max_order ?? 0) + 1;

  let serializedOptions = null;
  if (field_type === 'select') {
    if (Array.isArray(field_options)) {
      serializedOptions = JSON.stringify(field_options.map((s) => String(s).trim()).filter(Boolean));
    } else if (typeof field_options === 'string') {
      const arr = field_options.split(',').map((s) => s.trim()).filter(Boolean);
      serializedOptions = JSON.stringify(arr);
    }
  }

  const officerId = officerUser?.id || null;
  const officerHall = officerUser?.section_code === 'hall' ? (officerUser.hall || null) : null;
  const officerDept = officerUser?.section_code === 'department' ? (officerUser.department || null) : null;
  const officerFac = officerUser?.section_code === 'faculty' ? (officerUser.faculty || null) : null;

  const result = await query(
    `INSERT INTO section_form_fields (stage_id, officer_id, hall, department, faculty, field_label, field_type, field_options, placeholder, help_text, is_required, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stageId,
      officerId,
      officerHall,
      officerDept,
      officerFac,
      field_label.trim(),
      field_type,
      serializedOptions,
      placeholder?.trim() || null,
      help_text?.trim() || null,
      Boolean(is_required),
      nextOrder,
    ]
  );

  const created = await queryOne(`SELECT * FROM section_form_fields WHERE id = ?`, [result.insertId]);
  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', { stageId });
    broadcast('clearance:update', { stageId });
  } catch (_) {}
  return {
    ...created,
    is_required: Boolean(created.is_required),
    options: parseOptions(created.field_options),
  };
}

/**
 * Update an existing form field.
 */
async function updateStageFormField(stageId, fieldId, data, officerUser = null) {
  const existing = await queryOne(
    `SELECT id, stage_id FROM section_form_fields WHERE id = ? AND stage_id = ?`,
    [fieldId, stageId]
  );
  if (!existing) throw new ApiError('Form field not found for this section.', 404);

  const {
    field_label,
    field_type = 'text',
    field_options = null,
    placeholder = null,
    help_text = null,
    is_required = true,
    order_index,
  } = data;

  if (!field_label || field_label.trim().length < 2) {
    throw new ApiError('Field label is required.', 400);
  }

  let serializedOptions = null;
  if (field_type === 'select') {
    if (Array.isArray(field_options)) {
      serializedOptions = JSON.stringify(field_options.map((s) => String(s).trim()).filter(Boolean));
    } else if (typeof field_options === 'string') {
      const arr = field_options.split(',').map((s) => s.trim()).filter(Boolean);
      serializedOptions = JSON.stringify(arr);
    }
  }

  await query(
    `UPDATE section_form_fields
        SET field_label = ?, field_type = ?, field_options = ?, placeholder = ?, help_text = ?,
            is_required = ?, order_index = COALESCE(?, order_index)
      WHERE id = ?`,
    [
      field_label.trim(),
      field_type,
      serializedOptions,
      placeholder?.trim() || null,
      help_text?.trim() || null,
      Boolean(is_required),
      order_index ?? null,
      fieldId,
    ]
  );

  const updated = await queryOne(`SELECT * FROM section_form_fields WHERE id = ?`, [fieldId]);
  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', { stageId });
    broadcast('clearance:update', { stageId });
  } catch (_) {}
  return {
    ...updated,
    is_required: Boolean(updated.is_required),
    options: parseOptions(updated.field_options),
  };
}

/**
 * Delete a form field from a section.
 */
async function deleteStageFormField(stageId, fieldId, officerUser = null) {
  const existing = await queryOne(
    `SELECT id FROM section_form_fields WHERE id = ? AND stage_id = ?`,
    [fieldId, stageId]
  );
  if (!existing) throw new ApiError('Form field not found for this section.', 404);

  await query(`DELETE FROM section_form_responses WHERE field_id = ?`, [fieldId]);
  await query(`DELETE FROM section_form_fields WHERE id = ?`, [fieldId]);

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('stages:update', { stageId });
    broadcast('clearance:update', { stageId });
  } catch (_) {}

  return { message: 'Form field removed successfully.' };
}

/**
 * Fetch stage form fields populated with a student's responses.
 * Scoped strictly to student's hall, department, faculty, or central stage.
 * If the officer has NOT created any form fields, returns [].
 */
async function getStudentFormWithResponses(studentId, stageId) {
  const student = await queryOne('SELECT id, department, faculty, hall FROM users WHERE id = ?', [studentId]);
  const stage = await queryOne('SELECT id, code FROM clearance_stages WHERE id = ?', [stageId]);

  if (!stage) return [];

  let sql = `
    SELECT f.id, f.stage_id, f.field_label, f.field_type, f.field_options, f.placeholder,
           f.help_text, f.is_required, f.order_index,
           r.response_value, r.updated_at AS answered_at
      FROM section_form_fields f
      LEFT JOIN section_form_responses r
             ON r.field_id = f.id AND r.student_id = ?
     WHERE f.stage_id = ?
  `;
  const params = [studentId, stageId];

  if (stage.code === 'hall') {
    if (student?.hall) {
      sql += ` AND (LOWER(TRIM(f.hall)) = LOWER(TRIM(?))
                OR LOWER(TRIM(f.hall)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
                OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(f.hall)), '%'))`;
      params.push(student.hall, student.hall, student.hall);
    } else {
      return [];
    }
  } else if (stage.code === 'department') {
    if (student?.department) {
      sql += ` AND (LOWER(TRIM(f.department)) = LOWER(TRIM(?))
                OR LOWER(TRIM(f.department)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
                OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(f.department)), '%'))`;
      params.push(student.department, student.department, student.department);
    } else {
      return [];
    }
  } else if (stage.code === 'faculty') {
    if (student?.faculty) {
      const cleanFac = student.faculty.replace(/^Faculty of\s+/i, '').trim();
      sql += ` AND (LOWER(TRIM(f.faculty)) = LOWER(TRIM(?))
                OR LOWER(TRIM(f.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?)))
                OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(f.faculty)), '%'))`;
      params.push(cleanFac, cleanFac, cleanFac);
    } else {
      return [];
    }
  }

  sql += ` ORDER BY f.order_index ASC, f.id ASC`;
  const fields = await query(sql, params);

  return fields.map((f) => ({
    ...f,
    is_required: Boolean(f.is_required),
    options: parseOptions(f.field_options),
    response_value: f.response_value || '',
  }));
}

/**
 * Save responses for a student's section form.
 */
async function saveStudentFormResponses(studentId, stageId, responses) {
  if (!responses || typeof responses !== 'object') {
    throw new ApiError('Responses must be an object of field_id to response values.', 400);
  }

  // Fetch valid fields for this stage to verify
  const stageFields = await query(
    `SELECT id, field_label, is_required FROM section_form_fields WHERE stage_id = ?`,
    [stageId]
  );
  const fieldMap = new Map(stageFields.map((f) => [f.id, f]));

  for (const [fieldIdStr, val] of Object.entries(responses)) {
    const fieldId = Number(fieldIdStr);
    if (!fieldMap.has(fieldId)) continue;

    const strVal = val != null ? String(val).trim() : '';

    await query(
      `INSERT INTO section_form_responses (student_id, stage_id, field_id, response_value)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE response_value = VALUES(response_value), updated_at = CURRENT_TIMESTAMP`,
      [studentId, stageId, fieldId, strVal]
    );
  }

  try {
    const { emitToRole } = require('./realtimeService');
    emitToRole('officer', 'queue:update', { stageId, studentId });
    emitToRole('admin', 'queue:update', { stageId, studentId });
  } catch (_) {}

  return { message: 'Section form answers saved successfully.' };
}

/**
 * Fetch a student's answered form questions for an officer review panel.
 */
async function getStudentResponsesForReview(studentId, stageId) {
  const rows = await query(
    `SELECT f.id AS field_id, f.field_label, f.field_type, r.response_value, r.updated_at
       FROM section_form_fields f
       JOIN section_form_responses r
         ON r.field_id = f.id AND r.student_id = ? AND r.stage_id = ?
      WHERE f.stage_id = ?
      ORDER BY f.order_index ASC, f.id ASC`,
    [studentId, stageId, stageId]
  );

  return rows;
}

module.exports = {
  getStageFormFields,
  createStageFormField,
  updateStageFormField,
  deleteStageFormField,
  getStudentFormWithResponses,
  saveStudentFormResponses,
  getStudentResponsesForReview,
};
