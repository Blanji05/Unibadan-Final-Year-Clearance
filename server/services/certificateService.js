/**
 * Final clearance certificate issuance.
 *
 * A certificate may only be issued when every active stage is approved — this
 * is verified against the database, never trusted from the client.
 */
const crypto = require('crypto');
const { query, queryOne } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');
const { generateCertificatePDF } = require('../utils/generatePDF');
const { notifyUser } = require('../utils/sendSMS');

/**
 * Check whether a student has completed every active stage.
 */
async function getCompletionSummary(studentId) {
  const rows = await query(
    `SELECT cs.status, cs.reviewed_at, s.stage_name, s.stage_order, u.full_name AS officer_name
       FROM clearance_status cs
       JOIN clearance_stages s ON cs.stage_id = s.id
       LEFT JOIN users u ON cs.officer_id = u.id
      WHERE cs.student_id = ? AND s.is_active = TRUE
      ORDER BY s.stage_order`,
    [studentId]
  );

  const approved = rows.filter((r) => r.status === 'approved');

  return {
    stages: rows,
    approvedStages: approved,
    total: rows.length,
    approvedCount: approved.length,
    isComplete: rows.length > 0 && approved.length === rows.length,
  };
}

/**
 * Issue (or return the existing) certificate for a student.
 */
async function issueCertificate(studentId, generatedBy = null) {
  const student = await queryOne(
    "SELECT id, full_name, email, phone_number, matric_number, department, faculty FROM users WHERE id = ? AND role = 'student'",
    [studentId]
  );
  if (!student) throw new ApiError('Student not found.', 404);

  const existing = await queryOne(
    'SELECT id, certificate_no, certificate_url, verification_code, generated_at FROM certificates WHERE student_id = ?',
    [studentId]
  );
  if (existing) return { ...existing, alreadyIssued: true };

  const summary = await getCompletionSummary(studentId);
  if (!summary.isComplete) {
    throw new ApiError(
      `Clearance letter unavailable: ${summary.approvedCount} of ${summary.total} stages approved.`,
      403
    );
  }

  const certificateNo = `UI-CLR-${new Date().getFullYear()}-${String(student.matric_number || studentId).replace(/\W/g, '')}`;
  const verificationCode = crypto.randomBytes(16).toString('hex');

  const { url } = await generateCertificatePDF({
    student,
    stages: summary.approvedStages,
    certificateNo,
    verificationCode,
  });

  await query(
    `INSERT INTO certificates (student_id, certificate_no, certificate_url, verification_code, generated_by)
     VALUES (?, ?, ?, ?, ?)`,
    [studentId, certificateNo, url, verificationCode, generatedBy]
  );

  // Only on first issuance — re-fetching an existing certificate must not spam
  // the student with a "ready" message every time the page loads.
  await notifyUser({
    userId: student.id,
    phone: student.phone_number,
    email: student.email,
    title: 'Final Clearance Letter Ready!',
    message: `Congratulations ${student.full_name}!\n\nAll ${summary.total} clearance stages have been successfully approved by the University of Ibadan officers.\n\nYour official signed Final Clearance Letter (${certificateNo}) has been issued and is available for instant download from your student portal. Verification code: ${verificationCode}.`,
    subject: 'Congratulations! Your UI Final Year Clearance Letter is Ready',
    actionUrl: 'https://unibadan-final-year-clearance.vercel.app/student/certificate',
    actionText: 'Download Clearance Letter',
  });

  try {
    const { emitToUser, emitToRole } = require('./realtimeService');
    emitToUser(student.id, 'clearance:update', { certificate_no: certificateNo });
    emitToRole('admin', 'clearance:update', { studentId: student.id, certificate_no: certificateNo });
  } catch (_) {}

  return {
    certificate_no: certificateNo,
    certificate_url: url,
    verification_code: verificationCode,
    alreadyIssued: false,
  };
}

/** Fetch a student's certificate, if issued. */
async function getCertificate(studentId) {
  return await queryOne(
    'SELECT certificate_no, certificate_url, verification_code, generated_at FROM certificates WHERE student_id = ?',
    [studentId]
  );
}

/** Public verification lookup by code. */
async function verifyCertificate(code) {
  const record = await queryOne(
    `SELECT c.certificate_no, c.generated_at, u.full_name, u.matric_number, u.department, u.faculty
       FROM certificates c
       JOIN users u ON c.student_id = u.id
      WHERE c.verification_code = ?`,
    [code]
  );
  if (!record) throw new ApiError('No clearance letter matches that verification code.', 404);
  return record;
}

module.exports = { getCompletionSummary, issueCertificate, getCertificate, verifyCertificate };
