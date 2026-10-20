const { query, queryOne } = require('../config/db');
const clearanceService = require('../services/clearanceService');
const documentService = require('../services/documentService');
const paymentService = require('../services/paymentService');
const certificateService = require('../services/certificateService');
const timelineService = require('../services/timelineService');
const { generateReceiptPDF } = require('../utils/generatePDF');
const { sendSuccess, asyncHandler, ApiError } = require('../utils/apiResponse');

/** GET /api/student/clearance-status */
const getClearanceStatus = asyncHandler(async (req, res) => {
  const stages = await clearanceService.getStudentClearanceStatus(req.user.id);
  const approvedCount = stages.filter((s) => s.status === 'approved').length;

  const student = await queryOne(
    'SELECT phone_number, email, hall, passport_url FROM users WHERE id = ?',
    [req.user.id]
  );
  const missing = [];
  if (!student?.phone_number || !String(student.phone_number).trim()) {
    missing.push('Phone Number');
  }
  if (!student?.email || !String(student.email).trim()) {
    missing.push('Email Address');
  }
  if (!student?.hall || !String(student.hall).trim()) {
    missing.push('Hall of Residence');
  }
  if (!student?.passport_url) {
    missing.push('Passport Photograph');
  }

  return sendSuccess(res, {
    stages,
    profile_complete: missing.length === 0,
    missing_profile_fields: missing,
    progress: {
      approved: approvedCount,
      total: stages.length,
      percentage: stages.length ? Math.round((approvedCount / stages.length) * 100) : 0,
    },
  });
});

/** GET /api/student/documents */
const getDocuments = asyncHandler(async (req, res) => {
  const documents = await documentService.getStudentDocuments(req.user.id);
  return sendSuccess(res, { documents });
});

/** GET /api/student/documents/by-stage */
const getDocumentsByStage = asyncHandler(async (req, res) => {
  const stages = await documentService.getDocumentsByStage(req.user.id);
  return sendSuccess(res, { stages });
});

/**
 * GET /api/student/requirements
 *
 * Everything the sections currently ask for, de-duplicated across stages.
 * Officers maintain their own stage's list, so this reflects their choices.
 */
const getRequirementChecklist = asyncHandler(async (req, res) => {
  const requirements = await documentService.getRequirementChecklist(req.user.id);
  return sendSuccess(res, { requirements });
});

/** GET /api/student/document-types */
const getDocumentTypes = asyncHandler(async (req, res) => {
  const types = await documentService.getDocumentTypes();
  return sendSuccess(res, { document_types: types });
});

/** POST /api/student/documents  (multipart: file + document_type_id) */
const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError('No file was uploaded.', 400);

  const documentTypeId = Number(req.body.document_type_id);
  if (!Number.isInteger(documentTypeId)) {
    throw new ApiError('A valid document_type_id is required.', 400);
  }

  const document = await documentService.uploadDocument(req.user.id, documentTypeId, req.file);
  return sendSuccess(res, { document }, 201);
});

/** PUT /api/student/documents/:documentId (replace / edit uploaded file) */
const replaceDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError('No replacement file was uploaded.', 400);
  const document = await documentService.replaceDocument(req.user.id, Number(req.params.documentId), req.file);
  return sendSuccess(res, { document });
});

/** DELETE /api/student/documents/:documentId */
const deleteDocument = asyncHandler(async (req, res) => {
  const result = await documentService.deleteDocument(req.user.id, Number(req.params.documentId));
  return sendSuccess(res, result);
});

/** POST /api/student/submit/:stageId */
const submitStage = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);
  const { document_ids: documentIds, remarks, form_responses: formResponses } = req.body;

  if (formResponses && typeof formResponses === 'object') {
    const sectionFormService = require('../services/sectionFormService');
    await sectionFormService.saveStudentFormResponses(req.user.id, stageId, formResponses);
  }

  const result = await clearanceService.submitStage(req.user.id, stageId, documentIds, remarks);
  return sendSuccess(res, result);
});

/** POST /api/student/pay/:stageId */
const initiatePayment = asyncHandler(async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || null;
  const result = await paymentService.initiatePayment(req.user.id, Number(req.params.stageId), origin);
  return sendSuccess(res, result, 201);
});


/** DELETE /api/student/payments/:paymentId */
const cancelPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.cancelPayment(req.user.id, Number(req.params.paymentId));
  return sendSuccess(res, result);
});

/** GET /api/student/payments */
const getPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.getStudentPayments(req.user.id);
  return sendSuccess(res, { payments });
});

/** GET /api/student/certificate */
const getCertificate = asyncHandler(async (req, res) => {
  const summary = await certificateService.getCompletionSummary(req.user.id);
  const existing = await certificateService.getCertificate(req.user.id);

  if (existing) return sendSuccess(res, { certificate: existing, eligible: true });

  if (!summary.isComplete) {
    return sendSuccess(res, {
      certificate: null,
      eligible: false,
      message: `${summary.approvedCount} of ${summary.total} stages approved.`,
    });
  }

  // Eligible but not yet generated — issue it now.
  const certificate = await certificateService.issueCertificate(req.user.id, req.user.id);
  return sendSuccess(res, { certificate, eligible: true });
});

/** GET /api/student/payments/:paymentId/receipt  (PDF download) */
const getReceipt = asyncHandler(async (req, res) => {
  const { student, payment } = await paymentService.getReceipt(req.user.id, Number(req.params.paymentId));
  const pdf = await generateReceiptPDF({ student, payment });

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="receipt-${payment.reference}.pdf"`,
    'Content-Length': pdf.length,
  });
  return res.send(pdf);
});

/** GET /api/student/timeline */
const getTimeline = asyncHandler(async (req, res) => {
  const timeline = await timelineService.getStudentTimeline(req.user.id);
  return sendSuccess(res, timeline);
});

/** GET /api/student/profile */
const getProfile = asyncHandler(async (req, res) => {
  const user = await queryOne(
    `SELECT id, full_name, email, role, matric_number, department, faculty, hall,
            section_code, phone_number, is_active, passport_url,
            dob, gender, blood_group, genotype, next_of_kin_name, next_of_kin_phone,
            next_of_kin_address, contact_address, state_of_origin, lga, graduation_session, degree_program
       FROM users WHERE id = ?`,
    [req.user.id]
  );
  return sendSuccess(res, {
    user,
    has_passport: Boolean(user?.passport_url),
  });
});

/** PUT /api/student/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const {
    email,
    phone_number,
    dob,
    gender,
    blood_group,
    genotype,
    next_of_kin_name,
    next_of_kin_phone,
    next_of_kin_address,
    contact_address,
    state_of_origin,
    lga,
    graduation_session,
    degree_program,
    hall,
  } = req.body;

  if (hall !== undefined && (!hall || !String(hall).trim())) {
    throw new ApiError('Hall of residence is compulsory.', 400);
  }

  // If registry records (dob, gender, session) already exist, preserve them from student overwrite
  const existing = await queryOne(
    'SELECT email, dob, gender, graduation_session FROM users WHERE id = ?',
    [req.user.id]
  );

  let finalEmail = existing?.email;
  if (email && String(email).trim()) {
    const cleanEmail = String(email).trim().toLowerCase();
    const conflict = await queryOne('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?', [cleanEmail, req.user.id]);
    if (conflict) {
      throw new ApiError('This email address is already in use by another account.', 400);
    }
    finalEmail = cleanEmail;
  }

  const finalDob = existing?.dob || dob || null;
  const finalGender = existing?.gender || gender || null;
  const finalSession = existing?.graduation_session || graduation_session || null;

  await query(
    `UPDATE users
        SET email = ?, phone_number = ?, dob = ?, gender = ?, blood_group = ?, genotype = ?,
            next_of_kin_name = ?, next_of_kin_phone = ?, next_of_kin_address = ?,
            contact_address = ?, state_of_origin = ?, lga = ?,
            graduation_session = ?, degree_program = ?, hall = ?
      WHERE id = ?`,
    [
      finalEmail,
      phone_number ?? null,
      finalDob,
      finalGender,
      blood_group ?? null,
      genotype ?? null,
      next_of_kin_name ?? null,
      next_of_kin_phone ?? null,
      next_of_kin_address ?? null,
      contact_address ?? null,
      state_of_origin ?? null,
      lga ?? null,
      finalSession,
      degree_program ?? null,
      hall ?? null,
      req.user.id,
    ]
  );

  // Synchronize changes to master CSV file immediately
  try {
    const { syncStudentProfilesCsvFile } = require('../services/studentImportService');
    await syncStudentProfilesCsvFile();
  } catch (err) {
    console.warn('[updateProfile] CSV sync failed:', err.message);
  }

  const updatedUser = await queryOne(
    `SELECT id, full_name, email, role, matric_number, department, faculty, hall,
            section_code, phone_number, is_active, passport_url,
            dob, gender, blood_group, genotype, next_of_kin_name, next_of_kin_phone,
            next_of_kin_address, contact_address, state_of_origin, lga, graduation_session, degree_program
       FROM users WHERE id = ?`,
    [req.user.id]
  );

  return sendSuccess(res, {
    user: updatedUser,
    message: 'Profile updated successfully.',
  });
});

/** POST /api/student/profile/passport (multipart upload) */
const uploadPassport = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError('Please upload a passport photograph image (JPG/PNG).', 400);

  const { storeFile, isRemote } = require('../config/cloudinary');
  let url;

  if (isRemote()) {
    const stored = await storeFile(req.file, `passport-${req.user.id}`);
    url = stored.url;
  } else {
    // When cloud storage is not configured, encode as a high-availability Data URI
    // stored directly in users.passport_url (MEDIUMTEXT) in MySQL.
    // This guarantees it is permanently available across Vercel & Render, never gets wiped out on restart,
    // and displays instantly in browser and PDF slips without 404 errors!
    const mime = req.file.mimetype || 'image/jpeg';
    url = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
  }

  try {
    await query('ALTER TABLE users MODIFY COLUMN passport_url LONGTEXT DEFAULT NULL');
  } catch (_) {}

  await query('UPDATE users SET passport_url = ? WHERE id = ?', [url, req.user.id]);

  // Synchronize changes to master CSV file immediately
  try {
    const { syncStudentProfilesCsvFile } = require('../services/studentImportService');
    await syncStudentProfilesCsvFile();
  } catch (err) {
    console.warn('[uploadPassport] CSV sync failed:', err.message);
  }

  return sendSuccess(res, {
    passport_url: url,
    message: 'Profile passport photograph uploaded successfully.',
  });
});

/** GET /api/student/stages/:stageId/slip (PDF download) */
const getClearanceSlip = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);
  const { pdfBuffer, fileName } = await clearanceService.getStageClearanceSlip(req.user.id, stageId);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Length': pdfBuffer.length,
  });
  return res.send(pdfBuffer);
});

/** GET /api/student/stages/:stageId/form */
const getStageForm = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);
  const sectionFormService = require('../services/sectionFormService');
  const fields = await sectionFormService.getStudentFormWithResponses(req.user.id, stageId);
  return sendSuccess(res, { fields });
});

/** POST /api/student/stages/:stageId/form */
const saveStageForm = asyncHandler(async (req, res) => {
  const stageId = Number(req.params.stageId);
  const { responses } = req.body;
  const sectionFormService = require('../services/sectionFormService');
  const result = await sectionFormService.saveStudentFormResponses(req.user.id, stageId, responses);
  return sendSuccess(res, result);
});

module.exports = {
  getClearanceStatus,
  getDocuments,
  getDocumentsByStage,
  getRequirementChecklist,
  getDocumentTypes,
  uploadDocument,
  replaceDocument,
  deleteDocument,
  submitStage,
  initiatePayment,
  getPayments,
  cancelPayment,
  getReceipt,
  getTimeline,
  getCertificate,
  getProfile,
  updateProfile,
  uploadPassport,
  getClearanceSlip,
  getStageForm,
  saveStageForm,
};
