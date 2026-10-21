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

/** Verification lookup by verification code, certificate number, or matric number. */
async function verifyCertificate(queryStr) {
  const clean = String(queryStr || '').trim();
  if (!clean) throw new ApiError('Please provide a verification code, certificate number, or matric number.', 400);

  const record = await queryOne(
    `SELECT c.id AS certificate_id, c.certificate_no, c.verification_code, c.certificate_url, c.generated_at,
            u.id AS student_id, u.full_name, u.matric_number, u.department, u.faculty,
            u.degree_program, u.hall, u.graduation_session, u.email, u.phone_number, u.passport_url
       FROM certificates c
       JOIN users u ON c.student_id = u.id
      WHERE c.verification_code = ? OR c.certificate_no = ? OR u.matric_number = ?`,
    [clean, clean, clean]
  );
  if (!record) throw new ApiError('No clearance letter matches that verification code or matric number.', 404);

  // Fetch approved clearance stages breakdown
  const stages = await query(
    `SELECT cs.status, cs.reviewed_at, cs.remarks, s.stage_name, s.stage_order, s.code, u.full_name AS officer_name
       FROM clearance_status cs
       JOIN clearance_stages s ON cs.stage_id = s.id
       LEFT JOIN users u ON cs.officer_id = u.id
      WHERE cs.student_id = ? AND s.is_active = TRUE
      ORDER BY s.stage_order`,
    [record.student_id]
  );

  const approved = stages.filter((s) => s.status === 'approved');

  return {
    verified: true,
    certificate_id: record.certificate_id,
    certificate_no: record.certificate_no,
    verification_code: record.verification_code,
    certificate_url: record.certificate_url,
    issued_at: record.generated_at,
    student: {
      id: record.student_id,
      full_name: record.full_name,
      matric_number: record.matric_number,
      department: record.department,
      faculty: record.faculty,
      degree_program: record.degree_program,
      hall: record.hall,
      graduation_session: record.graduation_session,
      email: record.email,
      phone_number: record.phone_number,
      passport_url: record.passport_url,
    },
    summary: {
      total_stages: stages.length,
      approved_stages: approved.length,
      is_complete: stages.length > 0 && approved.length === stages.length,
    },
    stages,
  };
}

/** List all issued clearance letters / certificates with pagination and search. */
async function listCertificates({ search = '', limit = 50, offset = 0 } = {}) {
  const cleanSearch = String(search || '').trim();
  const searchPattern = `%${cleanSearch}%`;
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  let sql = `
    SELECT c.id, c.certificate_no, c.verification_code, c.generated_at,
           u.id AS student_id, u.full_name, u.matric_number, u.department, u.faculty
      FROM certificates c
      JOIN users u ON c.student_id = u.id
  `;
  const params = [];

  if (cleanSearch) {
    sql += ` WHERE u.matric_number LIKE ? OR u.full_name LIKE ? OR c.certificate_no LIKE ? OR c.verification_code LIKE ?`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  sql += ` ORDER BY c.generated_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

  const rows = await query(sql, params);

  const countRow = await queryOne(
    cleanSearch
      ? `SELECT COUNT(*) AS total
           FROM certificates c
           JOIN users u ON c.student_id = u.id
          WHERE u.matric_number LIKE ? OR u.full_name LIKE ? OR c.certificate_no LIKE ? OR c.verification_code LIKE ?`
      : `SELECT COUNT(*) AS total FROM certificates`,
    cleanSearch ? [searchPattern, searchPattern, searchPattern, searchPattern] : []
  );

  return {
    items: rows,
    total: countRow?.total || 0,
  };
}


/** Generate or retrieve the clearance letter PDF buffer for download. */
async function getCertificatePDF(studentId) {
  const student = await queryOne(
    `SELECT id, full_name, matric_number, department, faculty, email, phone_number,
            passport_url, degree_program, hall, graduation_session
       FROM users WHERE id = ?`,
    [studentId]
  );
  if (!student) throw new ApiError('Student not found.', 404);

  const summary = await getCompletionSummary(studentId);
  if (!summary.isComplete) {
    throw new ApiError(
      `Clearance letter unavailable: ${summary.approvedCount} of ${summary.total} stages approved.`,
      403
    );
  }

  let cert = await queryOne(
    'SELECT certificate_no, verification_code FROM certificates WHERE student_id = ?',
    [studentId]
  );

  if (!cert) {
    cert = await issueCertificate(studentId, studentId);
  }

  const { pdfBuffer } = await generateCertificatePDF({
    student,
    stages: summary.approvedStages,
    certificateNo: cert.certificate_no,
    verificationCode: cert.verification_code,
  });

  return {
    pdfBuffer,
    fileName: `Clearance-Letter-${cert.certificate_no}.pdf`,
  };
}

module.exports = { getCompletionSummary, issueCertificate, getCertificate, verifyCertificate, listCertificates, getCertificatePDF };
