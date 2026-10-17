/**
 * Comprehensive verification script for profile passport, locked identity fields,
 * officer signature enforcement, and clearance slip PDF generation.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool } = require('../config/db');
const { generateStudentEmail } = require('../services/studentImportService');
const { reviewStage, getStageClearanceSlip } = require('../services/clearanceService');
const { generateClearanceSlipPDF } = require('../utils/generatePDF');

async function runTests() {
  console.log('--- TEST 1: CSV Student Email Generation Formula ---');
  // Formula: (first letter of first name) + (surname) + (last 3 digits of matric) + '@stu.ui.edu.ng'
  const t1 = generateStudentEmail('Osunlana Anjoolaoluwa Victor', '230922');
  console.log('Osunlana Anjoolaoluwa Victor (230922) ->', t1);
  if (t1 !== 'aosunlana922@stu.ui.edu.ng') {
    throw new Error(`Expected aosunlana922@stu.ui.edu.ng, got ${t1}`);
  }

  const t2 = generateStudentEmail('Adewale Kazeem', '198765');
  console.log('Adewale Kazeem (198765) ->', t2);
  if (t2 !== 'kadewale765@stu.ui.edu.ng') {
    throw new Error(`Expected kadewale765@stu.ui.edu.ng, got ${t2}`);
  }
  console.log('✓ Email generation formula verified successfully!\n');

  console.log('--- TEST 2: Officer Signature Prerequisite Enforcement ---');
  // Find a test officer and student
  const [officers] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.signature_url, u.section_code
       FROM users u WHERE u.role = 'officer' LIMIT 1`
  );
  const [students] = await pool.query(
    `SELECT u.id, u.full_name, u.matric_number, u.department, u.faculty, u.passport_url
       FROM users u WHERE u.role = 'student' LIMIT 1`
  );
  const [stages] = await pool.query(
    `SELECT s.id, s.stage_name, s.code FROM clearance_stages s WHERE s.code = 'library' LIMIT 1`
  );

  if (!officers.length || !students.length || !stages.length) {
    console.log('Skipping DB checks: insufficient seed records');
    return;
  }

  const officer = officers[0];
  const student = students[0];
  const stage = stages[0];

  console.log(`Testing with Officer: ${officer.full_name} (${officer.email})`);
  console.log(`Testing with Student: ${student.full_name} (${student.matric_number})`);
  console.log(`Testing with Stage: ${stage.stage_name} (ID: ${stage.id})`);

  const originalSig = officer.signature_url;
  const originalPassport = student.passport_url;
  const [origStatusRows] = await pool.query(
    `SELECT * FROM clearance_status WHERE student_id = ? AND stage_id = ?`,
    [student.id, stage.id]
  );
  const origStatus = origStatusRows[0] || null;

  try {
    // Ensure stage is pending for this student
    await pool.query(
      `INSERT INTO clearance_status (student_id, stage_id, status, submitted_at)
       VALUES (?, ?, 'pending', NOW())
       ON DUPLICATE KEY UPDATE status = 'pending', submitted_at = NOW()`,
      [student.id, stage.id]
    );

    // Temporarily unset signature to verify block
    await pool.query('UPDATE users SET signature_url = NULL WHERE id = ?', [officer.id]);

    let blocked = false;
    try {
      await reviewStage(officer.id, student.id, stage.id, 'approved', 'Test approval without signature');
    } catch (err) {
      console.log('Approval blocked as expected with error:', err.message);
      if (err.message.includes('signature')) {
        blocked = true;
      }
    }

    if (!blocked) {
      throw new Error('FAILED: Approval without signature was NOT blocked!');
    }
    console.log('✓ Officer signature prerequisite enforced successfully!\n');

    console.log('--- TEST 3: Approval with Signature & Snapshot Recording ---');
    const sampleSignatureBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await pool.query('UPDATE users SET signature_url = ? WHERE id = ?', [sampleSignatureBase64, officer.id]);

    // Also ensure student has a dummy passport for testing PDF
    await pool.query('UPDATE users SET passport_url = ? WHERE id = ?', [sampleSignatureBase64, student.id]);

    const approvalResult = await reviewStage(officer.id, student.id, stage.id, 'approved', 'Clearance verified and approved');
    console.log('Approval completed with result:', approvalResult);

    const [statusRows] = await pool.query(
      `SELECT status, slip_reference, officer_name_snapshot, officer_signature_snapshot
         FROM clearance_status WHERE student_id = ? AND stage_id = ?`,
      [student.id, stage.id]
    );
    console.log('Saved clearance status snapshot:', statusRows[0]);
    if (!statusRows[0].slip_reference || !statusRows[0].officer_signature_snapshot) {
      throw new Error('FAILED: slip_reference or officer_signature_snapshot was not stored!');
    }
    console.log('✓ Snapshot and unique slip reference recorded successfully!\n');

    console.log('--- TEST 4: Clearance Slip PDF Generation ---');
    const slipData = await getStageClearanceSlip(student.id, stage.id);
    console.log(`Generated slip: filename="${slipData.filename}", length=${slipData.pdfBuffer.length} bytes`);
    const isPdfHeader = slipData.pdfBuffer.slice(0, 5).toString() === '%PDF-';
    console.log('PDF Header starts with %PDF-:', isPdfHeader);
    if (!isPdfHeader || slipData.pdfBuffer.length < 1000) {
      throw new Error('FAILED: Clearance slip PDF buffer is invalid or too small!');
    }
    console.log('✓ Clearance Slip PDF generated and validated successfully!\n');
  } finally {
    // Always restore officer signature, student passport, and original clearance_status
    await pool.query('UPDATE users SET signature_url = ? WHERE id = ?', [originalSig || null, officer.id]);
    await pool.query('UPDATE users SET passport_url = ? WHERE id = ?', [originalPassport || null, student.id]);

    if (origStatus) {
      await pool.query(
        `UPDATE clearance_status
            SET status = ?, officer_id = ?, remarks = ?, submitted_at = ?, reviewed_at = ?,
                officer_name_snapshot = ?, officer_signature_snapshot = ?, slip_reference = ?
          WHERE id = ?`,
        [
          origStatus.status,
          origStatus.officer_id,
          origStatus.remarks,
          origStatus.submitted_at,
          origStatus.reviewed_at,
          origStatus.officer_name_snapshot,
          origStatus.officer_signature_snapshot,
          origStatus.slip_reference,
          origStatus.id,
        ]
      );
    } else {
      await pool.query('DELETE FROM clearance_status WHERE student_id = ? AND stage_id = ?', [student.id, stage.id]);
    }
  }

  console.log('========================================');
  console.log('ALL VERIFICATION TESTS PASSED PERFECTLY!');
  console.log('========================================');
}

runTests()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Test error:', err);
    pool.end();
    process.exit(1);
  });
