const { query, queryOne } = require('../config/db');
const clearanceService = require('../services/clearanceService');
const requirementService = require('../services/requirementService');
const { notifyUser } = require('../utils/sendSMS');
const { sendSuccess, asyncHandler, ApiError } = require('../utils/apiResponse');

/**
 * Resolve the stage this officer is responsible for and include scope context.
 */
async function resolveOfficerStage(user, stageIdQuery = null) {
  let stage;
  if (!user.section_code) {
    if (user.role === 'admin') {
      if (stageIdQuery) {
        stage = await queryOne('SELECT id, code, stage_name, location, description FROM clearance_stages WHERE id = ?', [stageIdQuery]);
      }
      if (!stage) {
        stage = await queryOne('SELECT id, code, stage_name, location, description FROM clearance_stages ORDER BY stage_order ASC LIMIT 1');
      }
    } else {
      throw new ApiError('Your account has no clearance section assigned. Contact the administrator.', 403);
    }
  } else {
    stage = await queryOne('SELECT id, code, stage_name, location, description FROM clearance_stages WHERE code = ?', [
      user.section_code,
    ]);
  }
  if (!stage) throw new ApiError('Your assigned section no longer exists.', 404);

  let display_name = stage.stage_name;
  if (user.section_code === 'department' && user.department) {
    display_name = `Department Clearance — ${user.department}`;
  } else if (user.section_code === 'faculty' && user.faculty) {
    const cleanFac = user.faculty.replace(/^Faculty of\s+/i, '');
    display_name = `Faculty Clearance — Faculty of ${cleanFac}`;
  } else if (user.section_code === 'hall' && user.hall) {
    display_name = `Caution & Hall Clearance — ${user.hall}`;
  }

  return {
    ...stage,
    display_name,
    officer_faculty: user.faculty || null,
    officer_department: user.department || null,
    officer_hall: user.hall || null,
  };
}

/** GET /api/officer/pending-requests */
const getPendingRequests = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user, req.query.stage_id);

  let sql = `
    SELECT cs.id AS clearance_status_id, cs.student_id, cs.status, cs.submitted_at, cs.remarks,
           u.full_name, u.matric_number, u.department, u.faculty, u.hall, u.email, u.phone_number, u.passport_url
      FROM clearance_status cs
      JOIN users u ON cs.student_id = u.id
     WHERE cs.stage_id = ? AND cs.status = 'pending'
  `;
  const params = [stage.id];

  // Scoping: Department Officers only see their department's students
  if (req.user.section_code === 'department' && req.user.department) {
    sql += ` AND (LOWER(TRIM(u.department)) = LOWER(TRIM(?))
              OR LOWER(TRIM(u.department)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
              OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(u.department)), '%'))`;
    params.push(req.user.department, req.user.department, req.user.department);
  } else if (req.user.section_code === 'faculty' && req.user.faculty) {
    // Faculty Officers only see their faculty's students
    const cleanFac = req.user.faculty.replace(/^Faculty of\s+/i, '').trim();
    sql += ` AND (LOWER(TRIM(u.faculty)) = LOWER(TRIM(?))
              OR LOWER(TRIM(u.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))))`;
    params.push(cleanFac, cleanFac);
  } else if (req.user.section_code === 'hall') {
    // Hall Officers only see their hall's students
    if (req.user.hall) {
      sql += ` AND (LOWER(TRIM(u.hall)) = LOWER(TRIM(?))
                OR LOWER(TRIM(u.hall)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
                OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(u.hall)), '%'))`;
      params.push(req.user.hall, req.user.hall, req.user.hall);
    } else {
      sql += ` AND 1 = 0`;
    }
  }

  // Real-time search by officer
  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    sql += ` AND (u.full_name LIKE ? OR u.matric_number LIKE ? OR u.email LIKE ?)`;
    params.push(term, term, term);
  }

  // Filter by faculty/department (useful for central officers or sub-filtering)
  if (req.query.faculty) {
    const cleanFac = req.query.faculty.replace(/^Faculty of\s+/i, '').trim();
    sql += ` AND (LOWER(TRIM(u.faculty)) = LOWER(TRIM(?))
              OR LOWER(TRIM(u.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))))`;
    params.push(cleanFac, cleanFac);
  }
  if (req.query.department) {
    sql += ` AND LOWER(TRIM(u.department)) = LOWER(TRIM(?))`;
    params.push(req.query.department);
  }

  sql += ` ORDER BY cs.submitted_at ASC`;
  const requests = await query(sql, params);

  // Attach each submission's documents
  const sectionFormService = require('../services/sectionFormService');
  for (const request of requests) {
    const [docs, formAnswers] = await Promise.all([
      query(
        `SELECT d.id, d.file_url, d.original_name, d.mime_type, dt.label AS doc_label
           FROM submission_documents sd
           JOIN documents d ON sd.document_id = d.id
           JOIN document_types dt ON d.document_type_id = dt.id
          WHERE sd.clearance_status_id = ?`,
        [request.clearance_status_id]
      ),
      sectionFormService.getStudentResponsesForReview(request.student_id, stage.id),
    ]);
    request.documents = docs;
    request.form_responses = formAnswers;
  }

  return sendSuccess(res, { stage, requests });
});

/** GET /api/officer/history */
const getHistory = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user, req.query.stage_id);

  let sql = `
    SELECT cs.student_id, cs.stage_id, cs.status, cs.remarks, cs.submitted_at,
           COALESCE(cs.reviewed_at, cs.updated_at, cs.submitted_at, NOW()) AS reviewed_at,
           u.full_name, u.matric_number, u.department, u.faculty, u.hall, u.passport_url
      FROM clearance_status cs
      JOIN users u ON cs.student_id = u.id
     WHERE cs.stage_id = ? AND cs.status IN ('approved','rejected')
  `;
  const params = [stage.id];

  if (req.user.section_code === 'department' && req.user.department) {
    sql += ` AND (LOWER(TRIM(u.department)) = LOWER(TRIM(?))
              OR LOWER(TRIM(u.department)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
              OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(u.department)), '%'))`;
    params.push(req.user.department, req.user.department, req.user.department);
  } else if (req.user.section_code === 'faculty' && req.user.faculty) {
    const cleanFac = req.user.faculty.replace(/^Faculty of\s+/i, '').trim();
    sql += ` AND (LOWER(TRIM(u.faculty)) = LOWER(TRIM(?))
              OR LOWER(TRIM(u.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))))`;
    params.push(cleanFac, cleanFac);
  } else if (req.user.section_code === 'hall') {
    if (req.user.hall) {
      sql += ` AND (LOWER(TRIM(u.hall)) = LOWER(TRIM(?))
                OR LOWER(TRIM(u.hall)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
                OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(u.hall)), '%'))`;
      params.push(req.user.hall, req.user.hall, req.user.hall);
    } else {
      sql += ` AND 1 = 0`;
    }
  }

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    sql += ` AND (u.full_name LIKE ? OR u.matric_number LIKE ?)`;
    params.push(term, term);
  }
  if (req.query.faculty) {
    const cleanFac = req.query.faculty.replace(/^Faculty of\s+/i, '').trim();
    sql += ` AND (LOWER(TRIM(u.faculty)) = LOWER(TRIM(?))
              OR LOWER(TRIM(u.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))))`;
    params.push(cleanFac, cleanFac);
  }
  if (req.query.department) {
    sql += ` AND LOWER(TRIM(u.department)) = LOWER(TRIM(?))`;
    params.push(req.query.department);
  }

  sql += ` ORDER BY COALESCE(cs.reviewed_at, cs.updated_at, cs.submitted_at) DESC LIMIT 150`;
  const history = await query(sql, params);

  return sendSuccess(res, { stage, history });
});

/**
 * Record a decision and tell the student about it on every channel they have
 * (in-app, SMS and email). Shared by the single and bulk review endpoints.
 */
async function applyReview(officerId, studentId, stageId, decision, remarks, officerUser = null) {
  // If officer is scoped to department, faculty, or hall, verify student
  if (officerUser) {
    const studentCheck = await queryOne('SELECT department, faculty, hall FROM users WHERE id = ?', [studentId]);
    if (!studentCheck) throw new ApiError('Student record not found.', 404);

    if (officerUser.section_code === 'department' && officerUser.department) {
      const sDept = (studentCheck.department || '').toLowerCase().trim();
      const oDept = officerUser.department.toLowerCase().trim();
      if (sDept !== oDept && !sDept.includes(oDept) && !oDept.includes(sDept)) {
        throw new ApiError(`This student belongs to ${studentCheck.department || 'another department'}, not ${officerUser.department}.`, 403);
      }
    } else if (officerUser.section_code === 'faculty' && officerUser.faculty) {
      const sFac = (studentCheck.faculty || '').replace(/^Faculty of\s+/i, '').toLowerCase().trim();
      const oFac = officerUser.faculty.replace(/^Faculty of\s+/i, '').toLowerCase().trim();
      if (sFac !== oFac) {
        throw new ApiError(`This student belongs to Faculty of ${studentCheck.faculty}, not ${officerUser.faculty}.`, 403);
      }
    } else if (officerUser.section_code === 'hall' && officerUser.hall) {
      const sHall = (studentCheck.hall || '').toLowerCase().trim();
      const oHall = officerUser.hall.toLowerCase().trim();
      if (sHall !== oHall && !sHall.includes(oHall) && !oHall.includes(sHall)) {
        throw new ApiError(`This student resides in ${studentCheck.hall || 'another hall of residence'}, not ${officerUser.hall}.`, 403);
      }
    }
  }

  const result = await clearanceService.reviewStage(officerId, studentId, stageId, decision, remarks);

  const student = await queryOne('SELECT id, full_name, email, phone_number FROM users WHERE id = ?', [studentId]);
  const stage = await queryOne('SELECT stage_name FROM clearance_stages WHERE id = ?', [stageId]);

  if (student && stage) {
    const isApproved = decision === 'approved';
    const title = `${stage.stage_name} ${isApproved ? 'Approved' : 'Rejected'}`;
    const message = isApproved
      ? `Congratulations! Your ${stage.stage_name} has been approved by the clearance officer. You have satisfied all requirements for this section and may now proceed with the remaining stages of your final year clearance.`
      : `Your submission for ${stage.stage_name} was reviewed and rejected by the clearance officer.\n\nReason / Feedback:\n"${remarks}"\n\nPlease log in to your student portal, review the officer's remarks, re-upload the corrected documents or form details, and resubmit for approval.`;

    await notifyUser({
      userId: student.id,
      phone: student.phone_number,
      email: student.email,
      title,
      message,
      stageId,
      subject: isApproved
        ? `UI Clearance Approved: ${stage.stage_name}`
        : `Action Required: ${stage.stage_name} Submission Rejected`,
      actionUrl: isApproved
        ? 'https://unibadan-final-year-clearance.vercel.app/student'
        : `https://unibadan-final-year-clearance.vercel.app/student/stages/${stageId}`,
      actionText: isApproved ? 'View Clearance Status' : 'Fix & Resubmit Now',
    });
  }

  return result;
}

/** PATCH /api/officer/review/:studentId/:stageId */
const reviewSubmission = asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  const stageId = Number(req.params.stageId);
  const { decision, remarks } = req.body;

  if (decision === 'rejected' && !remarks?.trim()) {
    throw new ApiError('A reason is required when rejecting a submission.', 400);
  }

  const result = await applyReview(req.user.id, studentId, stageId, decision, remarks, req.user);
  return sendSuccess(res, result);
});

/**
 * POST /api/officer/review-bulk   { student_ids: [], decision, remarks }
 */
const reviewBulk = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const { decision, remarks } = req.body;
  const studentIds = [...new Set((req.body.student_ids || []).map(Number).filter(Number.isInteger))];

  if (!studentIds.length) throw new ApiError('Select at least one student.', 400);
  if (decision === 'rejected' && !remarks?.trim()) {
    throw new ApiError('A reason is required when rejecting submissions.', 400);
  }

  const succeeded = [];
  const failed = [];

  for (const studentId of studentIds) {
    try {
      await applyReview(req.user.id, studentId, stage.id, decision, remarks, req.user);
      succeeded.push(studentId);
    } catch (error) {
      failed.push({ student_id: studentId, reason: error.message });
    }
  }

  return sendSuccess(res, {
    succeeded,
    failed,
    message: `${succeeded.length} submission${succeeded.length === 1 ? '' : 's'} ${decision}${
      failed.length ? `, ${failed.length} could not be updated` : ''
    }.`,
  });
});

/**
 * GET /api/officer/requirements
 */
const getRequirements = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);

  const [requirements, studentsInFlight] = await Promise.all([
    requirementService.getStageRequirements(stage.id),
    requirementService.countStudentsInFlight(stage.id),
  ]);

  return sendSuccess(res, { stage, requirements, students_in_flight: studentsInFlight });
});

/** POST /api/officer/requirements */
const addRequirement = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const { document_type_id, is_mandatory = true } = req.body;

  const result = await requirementService.addRequirement(stage.id, document_type_id, is_mandatory);
  return sendSuccess(res, result, 201);
});

/** DELETE /api/officer/requirements/:documentTypeId */
const removeRequirement = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const result = await requirementService.removeRequirement(stage.id, Number(req.params.documentTypeId));
  return sendSuccess(res, result);
});

/** POST /api/officer/document-types */
const createDocumentType = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const { label, description, is_mandatory = true } = req.body;

  const docType = await requirementService.createDocumentType({ label, description });
  await requirementService.addRequirement(stage.id, docType.id, is_mandatory);

  return sendSuccess(
    res,
    { document_type: docType, message: `"${docType.label}" created and added to ${stage.stage_name}.` },
    201
  );
});

/**
 * GET /api/officer/directory
 * Allows section officers and admins to search for section officers across faculties, departments, and units.
 */
const getOfficerDirectory = asyncHandler(async (req, res) => {
  let sql = `
    SELECT u.id, u.full_name, u.email, u.role, u.section_code, u.faculty, u.department, u.hall,
           u.phone_number, u.is_active, u.last_login_at, cs.stage_name
      FROM users u
      LEFT JOIN clearance_stages cs ON u.section_code = cs.code
     WHERE u.role = 'officer'
  `;
  const params = [];

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    sql += ` AND (u.full_name LIKE ? OR u.email LIKE ? OR u.department LIKE ? OR u.faculty LIKE ? OR u.hall LIKE ? OR cs.stage_name LIKE ?)`;
    params.push(term, term, term, term, term, term);
  }
  if (req.query.section) {
    sql += ` AND u.section_code = ?`;
    params.push(req.query.section);
  }
  if (req.query.faculty) {
    const cleanFac = req.query.faculty.replace(/^Faculty of\s+/i, '').trim();
    sql += ` AND (LOWER(TRIM(u.faculty)) = LOWER(TRIM(?)) OR LOWER(TRIM(u.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))))`;
    params.push(cleanFac, cleanFac);
  }
  if (req.query.department) {
    sql += ` AND LOWER(TRIM(u.department)) = LOWER(TRIM(?))`;
    params.push(req.query.department);
  }
  if (req.query.hall) {
    sql += ` AND (LOWER(TRIM(u.hall)) = LOWER(TRIM(?)) OR LOWER(TRIM(u.hall)) LIKE CONCAT('%', LOWER(TRIM(?)), '%'))`;
    params.push(req.query.hall, req.query.hall);
  }

  sql += ` ORDER BY cs.stage_order, u.faculty, u.department, u.hall, u.full_name`;
  const officers = await query(sql, params);
  return sendSuccess(res, { officers });
});

/**
 * GET /api/officer/students/search
 * Allows officers to search and look up student clearance info.
 */
const searchStudents = asyncHandler(async (req, res) => {
  const { search, faculty, department } = req.query;
  let sql = `
    SELECT u.id, u.full_name, u.matric_number, u.email, u.department, u.faculty, u.hall, u.phone_number,
           SUM(cs.status = 'approved') AS approved_stages,
           COUNT(cs.id) AS total_stages
      FROM users u
      LEFT JOIN clearance_status cs ON cs.student_id = u.id
     WHERE u.role = 'student'
  `;
  const params = [];

  if (search) {
    const term = `%${search.trim()}%`;
    sql += ` AND (u.full_name LIKE ? OR u.matric_number LIKE ? OR u.email LIKE ?)`;
    params.push(term, term, term);
  }
  if (faculty) {
    const cleanFac = faculty.replace(/^Faculty of\s+/i, '').trim();
    sql += ` AND (LOWER(TRIM(u.faculty)) = LOWER(TRIM(?)) OR LOWER(TRIM(u.faculty)) = LOWER(CONCAT('faculty of ', TRIM(?))))`;
    params.push(cleanFac, cleanFac);
  }
  if (department) {
    sql += ` AND LOWER(TRIM(u.department)) = LOWER(TRIM(?))`;
    params.push(department);
  }

  sql += ` GROUP BY u.id ORDER BY u.full_name ASC LIMIT 100`;
  const students = await query(sql, params);
  return sendSuccess(res, { students });
});

/**
 * GET /api/officer/students/:studentId/clearance
 * Allows officer to view any student's complete 10-stage clearance status.
 */
const getStudentClearanceCard = asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  const student = await queryOne(
    "SELECT id, full_name, matric_number, email, department, faculty, hall, phone_number, passport_url FROM users WHERE id = ? AND role = 'student'",
    [studentId]
  );
  if (!student) throw new ApiError('Student not found.', 404);

  const stages = await clearanceService.getStudentClearanceStatus(studentId);
  return sendSuccess(res, { student, stages });
});

/** GET /api/officer/profile */
const getOfficerProfile = asyncHandler(async (req, res) => {
  const officer = await queryOne(
    `SELECT id, full_name, email, role, section_code, faculty, department, phone_number,
            title, signature_url, is_active
       FROM users WHERE id = ?`,
    [req.user.id]
  );
  const stage = await resolveOfficerStage(req.user);
  return sendSuccess(res, {
    officer,
    stage,
    has_signature: Boolean(officer?.signature_url),
  });
});

/** PUT /api/officer/profile */
const updateOfficerProfile = asyncHandler(async (req, res) => {
  const { full_name, title, phone_number } = req.body;
  if (full_name && full_name.trim().length < 2) {
    throw new ApiError('Official full name is required.', 400);
  }
  await query(
    `UPDATE users SET full_name = COALESCE(?, full_name), title = ?, phone_number = ? WHERE id = ?`,
    [full_name?.trim() || null, title?.trim() || null, phone_number?.trim() || null, req.user.id]
  );
  const updated = await queryOne(
    `SELECT id, full_name, email, role, section_code, faculty, department, phone_number,
            title, signature_url, is_active
       FROM users WHERE id = ?`,
    [req.user.id]
  );
  return sendSuccess(res, {
    officer: updated,
    message: 'Officer profile updated successfully.',
  });
});

/** POST /api/officer/signature (multipart file upload) */
const uploadOfficerSignature = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError('Please upload an image file of your official signature (PNG/JPG).', 400);
  const { storeFile, isRemote } = require('../config/cloudinary');
  let url;
  if (isRemote()) {
    const stored = await storeFile(req.file, `officer-sig-${req.user.id}`);
    url = stored.url;
  } else {
    const mime = req.file.mimetype || 'image/png';
    url = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
  }

  try {
    await query('ALTER TABLE users MODIFY COLUMN signature_url LONGTEXT DEFAULT NULL');
  } catch (_) {}

  await query('UPDATE users SET signature_url = ? WHERE id = ?', [url, req.user.id]);
  return sendSuccess(res, {
    signature_url: url,
    message: 'Official signature uploaded and saved successfully.',
  });
});

/** POST /api/officer/signature-drawing (base64 canvas signature) */
const saveOfficerSignatureDrawing = asyncHandler(async (req, res) => {
  const { signature_data } = req.body;
  if (!signature_data || !signature_data.startsWith('data:image/')) {
    throw new ApiError('Valid signature drawing data is required.', 400);
  }

  try {
    await query('ALTER TABLE users MODIFY COLUMN signature_url LONGTEXT DEFAULT NULL');
  } catch (_) {}

  // Store data URI directly in MySQL users.signature_url (LONGTEXT).
  // This guarantees it is 100% resilient across Render restarts, deploys, and local disk wipes.
  await query('UPDATE users SET signature_url = ? WHERE id = ?', [signature_data, req.user.id]);
  return sendSuccess(res, {
    signature_url: signature_data,
    message: 'Official digital signature saved successfully.',
  });
});

/** GET /api/officer/students/:studentId/stages/:stageId/slip (PDF download) */
const getStudentSlip = asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  const stageId = Number(req.params.stageId);
  const { pdfBuffer, fileName } = await clearanceService.getStageClearanceSlip(studentId, stageId);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Length': pdfBuffer.length,
  });
  return res.send(pdfBuffer);
});

/** GET /api/officer/form-fields */
const getFormFields = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const sectionFormService = require('../services/sectionFormService');
  const fields = await sectionFormService.getStageFormFields(stage.id, req.user);
  return sendSuccess(res, { stage, fields });
});

/** POST /api/officer/form-fields */
const addFormField = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const sectionFormService = require('../services/sectionFormService');
  const field = await sectionFormService.createStageFormField(stage.id, req.body, req.user);
  return sendSuccess(res, { field, message: 'Section form question added successfully.' }, 201);
});

/** PUT /api/officer/form-fields/:fieldId */
const updateFormField = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const sectionFormService = require('../services/sectionFormService');
  const field = await sectionFormService.updateStageFormField(stage.id, Number(req.params.fieldId), req.body, req.user);
  return sendSuccess(res, { field, message: 'Section form question updated successfully.' });
});

/** DELETE /api/officer/form-fields/:fieldId */
const deleteFormField = asyncHandler(async (req, res) => {
  const stage = await resolveOfficerStage(req.user);
  const sectionFormService = require('../services/sectionFormService');
  const result = await sectionFormService.deleteStageFormField(stage.id, Number(req.params.fieldId), req.user);
  return sendSuccess(res, result);
});

module.exports = {
  getPendingRequests,
  getHistory,
  reviewSubmission,
  reviewBulk,
  getRequirements,
  addRequirement,
  removeRequirement,
  createDocumentType,
  getOfficerDirectory,
  searchStudents,
  getStudentClearanceCard,
  getOfficerProfile,
  updateOfficerProfile,
  uploadOfficerSignature,
  saveOfficerSignatureDrawing,
  getStudentSlip,
  getFormFields,
  addFormField,
  updateFormField,
  deleteFormField,
};
