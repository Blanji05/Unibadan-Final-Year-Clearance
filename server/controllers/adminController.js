const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../config/db');
const clearanceService = require('../services/clearanceService');
const certificateService = require('../services/certificateService');
const sectionService = require('../services/sectionService');
const studentAdminService = require('../services/studentAdminService');
const { sendSuccess, asyncHandler, ApiError } = require('../utils/apiResponse');
const { notifyUser } = require('../utils/sendSMS');

/** GET /api/admin/students */
const getStudents = asyncHandler(async (req, res) => {
  let sql = `
    SELECT u.id, u.full_name, u.email, u.matric_number, u.department, u.faculty, u.hall,
           u.phone_number, u.is_active, u.created_at, u.passport_url,
           SUM(cs.status = 'approved') AS approved_stages,
           COUNT(cs.id) AS total_stages
      FROM users u
      LEFT JOIN clearance_status cs ON cs.student_id = u.id
     WHERE u.role = 'student'
  `;
  const params = [];

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    sql += ` AND (u.full_name LIKE ? OR u.matric_number LIKE ? OR u.email LIKE ? OR u.department LIKE ? OR u.faculty LIKE ? OR u.hall LIKE ?)`;
    params.push(term, term, term, term, term, term);
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

  sql += ` GROUP BY u.id ORDER BY u.created_at DESC`;

  if (req.query.limit) {
    const lim = Math.max(1, parseInt(req.query.limit, 10) || 50);
    sql += ` LIMIT ${lim}`;
  }

  const students = await query(sql, params);
  return sendSuccess(res, { students });
});

/** GET /api/admin/users */
const getUsers = asyncHandler(async (req, res) => {
  let sql = `
    SELECT u.id, u.full_name, u.email, u.role, u.matric_number, u.section_code,
           u.faculty, u.department, u.hall, u.phone_number, u.is_active, u.last_login_at, u.created_at,
           u.passport_url, cs.stage_name
      FROM users u
      LEFT JOIN clearance_stages cs ON u.section_code = cs.code
     WHERE 1=1
  `;
  const params = [];

  if (req.query.role) {
    if (req.query.role === 'staff') {
      sql += ` AND u.role IN ('officer', 'admin')`;
    } else {
      sql += ` AND u.role = ?`;
      params.push(req.query.role);
    }
  } else {
    // Default to officers and admins for staff accounts management (prevent loading 6,000 students)
    sql += ` AND u.role IN ('officer', 'admin')`;
  }
  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    sql += ` AND (u.full_name LIKE ? OR u.email LIKE ? OR u.matric_number LIKE ? OR u.department LIKE ? OR u.faculty LIKE ? OR u.hall LIKE ? OR cs.stage_name LIKE ?)`;
    params.push(term, term, term, term, term, term, term);
  }
  if (req.query.section_code) {
    sql += ` AND u.section_code = ?`;
    params.push(req.query.section_code);
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

  sql += ` ORDER BY u.role, cs.stage_order, u.faculty, u.department, u.hall, u.full_name`;
  const users = await query(sql, params);
  return sendSuccess(res, { users });
});

/** POST /api/admin/officers — create a section officer account */
const createOfficer = asyncHandler(async (req, res) => {
  const { full_name, email, password, section_code, phone_number, faculty, department, hall } = req.body;

  const stage = await queryOne('SELECT id, stage_name FROM clearance_stages WHERE code = ?', [section_code]);
  if (!stage) throw new ApiError('That section code does not match any clearance stage.', 400);

  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new ApiError('An account with that email already exists.', 409);

  const password_hash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (full_name, email, password_hash, role, section_code, faculty, department, hall, phone_number)
     VALUES (?, ?, ?, 'officer', ?, ?, ?, ?, ?)`,
    [full_name, email, password_hash, section_code, faculty || null, department || null, hall || null, phone_number || null]
  );

  // Welcome the new officer and point them at their queue.
  await notifyUser({
    userId: result.insertId,
    email,
    phone: phone_number || null,
    title: 'Officer account created',
    message: `Hi ${full_name}, your ${stage.stage_name}${
      hall ? ` (${hall})` : department ? ` (${department})` : faculty ? ` (${faculty})` : ''
    } review account has been created. Sign in to the UI Clearance portal to review submissions for your section.`,
    subject: 'UI Clearance: your officer account is ready',
  });

  try {
    const { broadcast } = require('../services/realtimeService');
    broadcast('users:update', {});
    broadcast('stages:update', {});
  } catch (_) {}

  return sendSuccess(res, { id: result.insertId, full_name, email, section_code, faculty, department }, 201);
});

/** PATCH /api/admin/users/:userId/status — activate or deactivate */
const setUserStatus = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const { is_active } = req.body;

  if (userId === req.user.id) throw new ApiError('You cannot deactivate your own account.', 400);

  const user = await queryOne('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) throw new ApiError('User not found.', 404);

  await query('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, userId]);

  try {
    const { broadcast } = require('../services/realtimeService');
    broadcast('users:update', { userId });
  } catch (_) {}

  return sendSuccess(res, { message: `Account ${is_active ? 'activated' : 'deactivated'}.` });
});

/** GET /api/admin/analytics */
const getAnalytics = asyncHandler(async (req, res) => {
  const [totals] = await query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'student') AS total_students,
       (SELECT COUNT(*) FROM users WHERE role = 'officer') AS total_officers,
       (SELECT COUNT(*) FROM certificates) AS certificates_issued,
       (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'success') AS total_collected`
  );

  // Per-stage breakdown — reveals bottleneck stages.
  const byStage = await query(
    `SELECT s.id, s.stage_name, s.stage_order,
            SUM(cs.status = 'not_started') AS not_started,
            SUM(cs.status = 'pending')     AS pending,
            SUM(cs.status = 'approved')    AS approved,
            SUM(cs.status = 'rejected')    AS rejected,
            ROUND(AVG(CASE WHEN cs.reviewed_at IS NOT NULL AND cs.submitted_at IS NOT NULL
                      THEN TIMESTAMPDIFF(HOUR, cs.submitted_at, cs.reviewed_at) END), 1) AS avg_review_hours
       FROM clearance_stages s
       LEFT JOIN clearance_status cs ON cs.stage_id = s.id
      WHERE s.is_active = TRUE
      GROUP BY s.id
      ORDER BY s.stage_order`
  );

  // Students who finished everything.
  const [completion] = await query(
    `SELECT COUNT(*) AS fully_cleared FROM (
       SELECT cs.student_id
         FROM clearance_status cs
         JOIN clearance_stages s ON s.id = cs.stage_id AND s.is_active = TRUE
        GROUP BY cs.student_id
       HAVING SUM(cs.status = 'approved') = COUNT(*)
     ) t`
  );

  return sendSuccess(res, {
    totals: { ...totals, fully_cleared: completion.fully_cleared },
    by_stage: byStage,
  });
});

/** GET /api/admin/students/:studentId/clearance */
const getStudentClearance = asyncHandler(async (req, res) => {
  const stages = await clearanceService.getStudentClearanceStatus(Number(req.params.studentId));
  return sendSuccess(res, { stages });
});

/** PATCH /api/admin/override/:studentId/:stageId */
const overrideStage = asyncHandler(async (req, res) => {
  const { status, remarks } = req.body;
  const result = await clearanceService.overrideStageStatus(
    req.user.id,
    Number(req.params.studentId),
    Number(req.params.stageId),
    status,
    remarks
  );
  return sendSuccess(res, result);
});

/** POST /api/admin/generate-certificate/:studentId */
const generateCertificate = asyncHandler(async (req, res) => {
  const certificate = await certificateService.issueCertificate(Number(req.params.studentId), req.user.id);
  return sendSuccess(res, { certificate }, certificate.alreadyIssued ? 200 : 201);
});

/** GET /api/admin/stages — kept for compatibility; sections endpoint is richer. */
const getStages = asyncHandler(async (req, res) => {
  const stages = await query(
    `SELECT s.*, GROUP_CONCAT(sp.prerequisite_stage_id) AS prerequisite_ids
       FROM clearance_stages s
       LEFT JOIN stage_prerequisites sp ON sp.stage_id = s.id
      GROUP BY s.id
      ORDER BY s.stage_order`
  );

  return sendSuccess(res, {
    stages: stages.map((s) => ({
      ...s,
      prerequisite_ids: s.prerequisite_ids ? s.prerequisite_ids.split(',').map(Number) : [],
    })),
  });
});

// --- Section (clearance stage) management -----------------------------------

/** GET /api/admin/sections */
const getSections = asyncHandler(async (req, res) => {
  const sections = await sectionService.listSections();
  return sendSuccess(res, { sections });
});

/** POST /api/admin/sections */
const createSection = asyncHandler(async (req, res) => {
  const section = await sectionService.createSection(req.user.id, req.body);
  return sendSuccess(res, section, 201);
});

/** PATCH /api/admin/sections/:stageId */
const updateSection = asyncHandler(async (req, res) => {
  const result = await sectionService.updateSection(req.user.id, Number(req.params.stageId), req.body);
  return sendSuccess(res, result);
});

/** PATCH /api/admin/sections/:stageId/status */
const setSectionStatus = asyncHandler(async (req, res) => {
  const result = await sectionService.setSectionActive(
    req.user.id,
    Number(req.params.stageId),
    Boolean(req.body.is_active)
  );
  return sendSuccess(res, result);
});

/** DELETE /api/admin/sections/:stageId */
const deleteSection = asyncHandler(async (req, res) => {
  const result = await sectionService.deleteSection(req.user.id, Number(req.params.stageId));
  return sendSuccess(res, result);
});

/** PATCH /api/admin/sections/reorder */
const reorderSections = asyncHandler(async (req, res) => {
  const result = await sectionService.reorderSections(req.user.id, req.body.order.map(Number));
  return sendSuccess(res, result);
});

/** PUT /api/admin/sections/:stageId/prerequisites */
const setPrerequisites = asyncHandler(async (req, res) => {
  const result = await sectionService.setPrerequisites(
    req.user.id,
    Number(req.params.stageId),
    req.body.prerequisite_ids || []
  );
  return sendSuccess(res, result);
});

// --- Student management -----------------------------------------------------

/** GET /api/admin/students/:studentId */
const getStudent = asyncHandler(async (req, res) => {
  const student = await studentAdminService.getStudent(Number(req.params.studentId));
  return sendSuccess(res, { student });
});

/** POST /api/admin/students */
const createStudent = asyncHandler(async (req, res) => {
  const student = await studentAdminService.createStudent(req.user.id, req.body);
  return sendSuccess(res, student, 201);
});

/** PATCH /api/admin/students/:studentId */
const updateStudent = asyncHandler(async (req, res) => {
  const result = await studentAdminService.updateStudent(req.user.id, Number(req.params.studentId), req.body);
  return sendSuccess(res, result);
});

/** DELETE /api/admin/students/:studentId */
const deleteStudent = asyncHandler(async (req, res) => {
  const result = await studentAdminService.deleteStudent(req.user.id, Number(req.params.studentId));
  return sendSuccess(res, result);
});

/** DELETE /api/admin/students (delete all students) */
const deleteAllStudents = asyncHandler(async (req, res) => {
  const result = await studentAdminService.deleteAllStudents(req.user.id);
  return sendSuccess(res, result);
});

/** POST /api/admin/users/:userId/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const result = await studentAdminService.resetPassword(req.user.id, Number(req.params.userId), req.body.password);
  return sendSuccess(res, result);
});

/** PATCH /api/admin/users/:userId/section — reassign an officer */
const setOfficerSection = asyncHandler(async (req, res) => {
  const result = await studentAdminService.setOfficerSection(
    req.user.id,
    Number(req.params.userId),
    req.body.section_code,
    req.body.faculty || null,
    req.body.department || null
  );
  return sendSuccess(res, result);
});

/** GET /api/admin/activity — recent audited actions */
const getActivity = asyncHandler(async (req, res) => {
  const activity = await studentAdminService.recentActivity(req.query.limit || 20);
  return sendSuccess(res, { activity });
});

module.exports = {
  getStudents,
  getUsers,
  createOfficer,
  setUserStatus,
  getAnalytics,
  getStudentClearance,
  overrideStage,
  generateCertificate,
  getStages,
  getSections,
  createSection,
  updateSection,
  setSectionStatus,
  deleteSection,
  reorderSections,
  setPrerequisites,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  deleteAllStudents,
  resetPassword,
  setOfficerSection,
  getActivity,
};
