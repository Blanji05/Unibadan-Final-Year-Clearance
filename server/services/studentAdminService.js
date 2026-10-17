/**
 * Student account administration.
 *
 * Registration is self-service, but a registry office also needs to create
 * accounts directly (a student without email access, a late enrolment) and to
 * correct records afterwards. Every mutation here is audited, because these
 * actions change someone else's clearance standing.
 */
const bcrypt = require('bcryptjs');
const { pool, query, queryOne, withTransaction } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');
const clearanceService = require('./clearanceService');
const { notifyUser } = require('../utils/sendSMS');

/** One student with progress counts and payment/certificate state. */
async function getStudent(studentId) {
  const student = await queryOne(
    `SELECT u.id, u.full_name, u.email, u.matric_number, u.department, u.faculty, u.hall,
            u.phone_number, u.is_active, u.last_login_at, u.created_at,
            (SELECT COUNT(*) FROM clearance_status cs
               JOIN clearance_stages s ON s.id = cs.stage_id AND s.is_active = TRUE
              WHERE cs.student_id = u.id AND cs.status = 'approved') AS approved_stages,
            (SELECT COUNT(*) FROM clearance_status cs
               JOIN clearance_stages s ON s.id = cs.stage_id AND s.is_active = TRUE
              WHERE cs.student_id = u.id) AS total_stages,
            (SELECT COUNT(*) FROM documents d WHERE d.student_id = u.id) AS document_count,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
              WHERE p.student_id = u.id AND p.status = 'success') AS total_paid,
            (SELECT c.certificate_url FROM certificates c WHERE c.student_id = u.id LIMIT 1) AS certificate_url
       FROM users u
      WHERE u.id = ? AND u.role = 'student'`,
    [studentId]
  );

  if (!student) throw new ApiError('Student not found.', 404);

  return {
    ...student,
    is_active: Boolean(student.is_active),
    approved_stages: Number(student.approved_stages),
    total_stages: Number(student.total_stages),
    document_count: Number(student.document_count),
    total_paid: Number(student.total_paid),
  };
}

/**
 * Create a student account and materialise its clearance rows.
 *
 * Both steps share one transaction: a student row without clearance rows would
 * show an empty dashboard with no way to recover from the UI.
 */
async function createStudent(adminId, input) {
  const email = input.email.trim().toLowerCase();
  const matric = input.matric_number.trim();

  const clash = await queryOne('SELECT id, email, matric_number FROM users WHERE email = ? OR matric_number = ?', [
    email,
    matric,
  ]);

  if (clash) {
    throw new ApiError(
      clash.email === email
        ? 'An account with that email already exists.'
        : 'A student with that matriculation number already exists.',
      409
    );
  }

  const password_hash = await bcrypt.hash(input.password, 12);

  const created = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO users
         (full_name, email, password_hash, role, matric_number, department, faculty, hall, phone_number)
       VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?)`,
      [
        input.full_name.trim(),
        email,
        password_hash,
        matric,
        input.department?.trim() || null,
        input.faculty?.trim() || null,
        input.hall?.trim() || null,
        input.phone_number?.trim() || null,
      ]
    );

    const studentId = result.insertId;
    const stageCount = await clearanceService.initializeClearanceForStudent(studentId, conn);

    await conn.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, 'create_student', 'users', ?, ?)`,
      [adminId, studentId, JSON.stringify({ matric_number: matric, email, stages: stageCount })]
    );

    return { id: studentId, full_name: input.full_name, matric_number: matric, email, stages: stageCount };
  });

  // Welcome the account the registry just created, so the student does not
  // hear about it second-hand. Sent after the transaction commits.
  await notifyUser({
    userId: created.id,
    email: created.email,
    phone: input.phone_number?.trim() || null,
    title: 'Welcome to UI Clearance',
    message: `Hi ${created.full_name}, a clearance account was created for you (${created.matric_number}). Sign in to begin with Library Clearance, and you will be notified here as each section reviews you.`,
    subject: 'Welcome to the UI Clearance portal',
  });

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('users:update', {});
    broadcast('clearance:update', {});
  } catch (_) {}

  return created;
}

/** Correct a student's record. Only the fields supplied are touched. */
async function updateStudent(adminId, studentId, input) {
  const student = await queryOne("SELECT * FROM users WHERE id = ? AND role = 'student'", [studentId]);
  if (!student) throw new ApiError('Student not found.', 404);

  // Email and matric number are unique, so a change has to be checked first.
  if (input.email && input.email.trim().toLowerCase() !== student.email) {
    const clash = await queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [
      input.email.trim().toLowerCase(),
      studentId,
    ]);
    if (clash) throw new ApiError('Another account already uses that email.', 409);
  }

  if (input.matric_number && input.matric_number.trim() !== student.matric_number) {
    const clash = await queryOne('SELECT id FROM users WHERE matric_number = ? AND id <> ?', [
      input.matric_number.trim(),
      studentId,
    ]);
    if (clash) throw new ApiError('Another student already uses that matriculation number.', 409);
  }

  const next = {
    full_name: input.full_name?.trim() || student.full_name,
    email: input.email?.trim().toLowerCase() || student.email,
    matric_number: input.matric_number?.trim() || student.matric_number,
    department: input.department?.trim() ?? student.department,
    faculty: input.faculty?.trim() ?? student.faculty,
    hall: input.hall?.trim() ?? student.hall,
    phone_number: input.phone_number?.trim() ?? student.phone_number,
  };

  await query(
    `UPDATE users
        SET full_name = ?, email = ?, matric_number = ?, department = ?, faculty = ?, hall = ?, phone_number = ?
      WHERE id = ?`,
    [
      next.full_name,
      next.email,
      next.matric_number,
      next.department,
      next.faculty,
      next.hall,
      next.phone_number,
      studentId,
    ]
  );

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'update_student', 'users', ?, ?)`,
    [adminId, studentId, JSON.stringify(next)]
  );

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('users:update', { studentId });
    broadcast('clearance:update', { studentId });
  } catch (_) {}

  return { message: `${next.full_name}'s record updated.` };
}

/**
 * Set a new password for any account.
 *
 * The new password is returned rather than emailed: no transport can be assumed
 * to be configured, and an admin reading it back to the student is always
 * workable. The user is still told their password changed — that notice is a
 * security signal, not a delivery mechanism.
 */
async function resetPassword(adminId, userId, newPassword) {
  const user = await queryOne('SELECT id, full_name, role FROM users WHERE id = ?', [userId]);
  if (!user) throw new ApiError('User not found.', 404);

  const password_hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, userId]);

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'reset_password', 'users', ?, ?)`,
    [adminId, userId, JSON.stringify({ role: user.role })]
  );

  const contact = await queryOne('SELECT email, phone_number FROM users WHERE id = ?', [userId]);
  await notifyUser({
    userId,
    email: contact?.email,
    phone: contact?.phone_number,
    title: 'Your password was changed',
    message:
      'The password for your UI Clearance account was reset by an administrator. If this was not you, contact the registry office immediately.',
    subject: 'UI Clearance: your password was changed',
  });

  return { message: `Password reset for ${user.full_name}. Share it with them directly.` };
}

/**
 * Delete a student and everything attached to them.
 *
 * Refused once a certificate exists: that document has been issued and may have
 * been presented, so the record behind it has to remain verifiable.
 */
async function deleteStudent(adminId, studentId) {
  const student = await queryOne(
    "SELECT id, full_name, matric_number FROM users WHERE id = ? AND role = 'student'",
    [studentId]
  );
  if (!student) throw new ApiError('Student not found.', 404);

  const certificate = await queryOne('SELECT id FROM certificates WHERE student_id = ?', [studentId]);
  if (certificate) {
    throw new ApiError(
      'This student has already been issued a clearance letter, which must stay verifiable. Deactivate the account instead of deleting it.',
      409
    );
  }

  // FK cascades remove clearance_status, documents, payments and notifications.
  await query('DELETE FROM users WHERE id = ?', [studentId]);

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'delete_student', 'users', ?, ?)`,
    [adminId, studentId, JSON.stringify({ matric_number: student.matric_number, full_name: student.full_name })]
  );

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('users:update', {});
    broadcast('clearance:update', {});
  } catch (_) {}

  return { message: `${student.full_name} (${student.matric_number}) deleted.` };
}

/**
 * Permanently delete ALL student accounts from the portal.
 * Cleans up associated certificates, clearance statuses, documents, submissions, and payments.
 */
async function deleteAllStudents(adminId) {
  const [studentRows] = await pool.query("SELECT id FROM users WHERE role = 'student'");
  if (studentRows.length === 0) {
    return { count: 0, message: 'There are no student accounts to delete.' };
  }

  const studentIds = studentRows.map((s) => s.id);

  // Clean up any certificates for students
  await pool.query('DELETE FROM certificates WHERE student_id IN (?)', [studentIds]);

  // Clean up student rows (FK cascade handles clearance_status, documents, etc.)
  const [delResult] = await pool.query("DELETE FROM users WHERE role = 'student'");

  // Resync export CSV on disk
  try {
    const { syncStudentProfilesCsvFile } = require('./studentImportService');
    await syncStudentProfilesCsvFile();
  } catch (err) {
    // Non-fatal
  }

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, details)
     VALUES (?, 'delete_all_students', 'users', ?)`,
    [adminId, JSON.stringify({ deleted_count: delResult.affectedRows })]
  );

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('users:update', {});
    broadcast('clearance:update', {});
  } catch (_) {}

  return {
    count: delResult.affectedRows,
    message: `Successfully deleted all ${delResult.affectedRows.toLocaleString()} student records from the system.`,
  };
}

/** Reassign an officer to a different section and optionally update faculty/department. */
async function setOfficerSection(adminId, userId, sectionCode, faculty = null, department = null) {
  const officer = await queryOne("SELECT id, full_name FROM users WHERE id = ? AND role = 'officer'", [userId]);
  if (!officer) throw new ApiError('Officer not found.', 404);

  const stage = await queryOne('SELECT id, stage_name FROM clearance_stages WHERE code = ?', [sectionCode]);
  if (!stage) throw new ApiError('That section code does not match any clearance stage.', 400);

  await query('UPDATE users SET section_code = ?, faculty = ?, department = ? WHERE id = ?', [
    sectionCode,
    faculty || null,
    department || null,
    userId,
  ]);

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'reassign_officer', 'users', ?, ?)`,
    [adminId, userId, JSON.stringify({ section_code: sectionCode, faculty, department })]
  );

  // An officer whose section silently changed would keep reviewing the wrong
  // queue, so tell them directly.
  const contact = await queryOne('SELECT email, phone_number FROM users WHERE id = ?', [userId]);
  await notifyUser({
    userId,
    email: contact?.email,
    phone: contact?.phone_number,
    title: 'Your section was reassigned',
    message: `${officer.full_name}, you have been assigned to review ${stage.stage_name}${
      department ? ` (${department})` : faculty ? ` (${faculty})` : ''
    }. Your review queue now shows submissions for that section.`,
    subject: 'UI Clearance: your section changed',
  });

  try {
    const { broadcast } = require('./realtimeService');
    broadcast('users:update', {});
    broadcast('queue:update', {});
  } catch (_) {}

  return { message: `${officer.full_name} now reviews ${stage.stage_name}.` };
}

/** Most recent administrative actions, for the audit panel. */
async function recentActivity(limit = 20) {
  // Inlined rather than bound: MySQL's prepared-statement protocol rejects a
  // placeholder in LIMIT, so the value is clamped to a safe integer instead.
  const rowLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            u.full_name AS actor_name, u.role AS actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT ${rowLimit}`
  );


  return rows.map((r) => ({
    ...r,
    // mysql2 hands back JSON columns already parsed; tolerate a string too.
    details: typeof r.details === 'string' ? safeParse(r.details) : r.details,
  }));
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  getStudent,
  createStudent,
  updateStudent,
  resetPassword,
  deleteStudent,
  deleteAllStudents,
  setOfficerSection,
  recentActivity,
};
