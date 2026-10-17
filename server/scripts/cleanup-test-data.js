/**
 * Removes rows left behind by the smoke-test scripts so the demo data stays clean.
 *   node scripts/cleanup-test-data.js
 */
// Resolved relative to this file so the script works from any directory.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/db');

// Filenames used by the smoke-test scripts. Anything not on this list is
// treated as a genuine student upload and left untouched.
const TEST_FILENAMES = ['test-doc.pdf', 'is-locked-check.pdf'];

(async () => {
  const docs = await query(
    `SELECT id FROM documents WHERE original_name IN (${TEST_FILENAMES.map(() => '?').join(', ')})`,
    TEST_FILENAMES
  );

  for (const doc of docs) {
    await query('DELETE FROM submission_documents WHERE document_id = ?', [doc.id]);
    await query('DELETE FROM documents WHERE id = ?', [doc.id]);
  }

  // Reset any stage the test pushed into review or approved without real submission documents.
  const reset = await query(
    `UPDATE clearance_status cs
       JOIN clearance_stages s ON s.id = cs.stage_id
        SET cs.status = 'not_started',
            cs.officer_id = NULL,
            cs.submitted_at = NULL,
            cs.reviewed_at = NULL,
            cs.remarks = NULL,
            cs.officer_name_snapshot = NULL,
            cs.officer_signature_snapshot = NULL,
            cs.slip_reference = NULL
      WHERE s.code = 'library'
        AND cs.status IN ('pending', 'approved', 'rejected')
        AND NOT EXISTS (
          SELECT 1 FROM submission_documents sd WHERE sd.clearance_status_id = cs.id
        )`
  );

  // Clear dummy 1x1 base64 passport_url or signature_url injected by test scripts
  const DUMMY_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await query('UPDATE users SET passport_url = NULL WHERE passport_url = ?', [DUMMY_PIXEL]);
  await query('UPDATE users SET signature_url = NULL WHERE signature_url = ?', [DUMMY_PIXEL]);

  // Simulated payments (CS- references or pending test UI-PAY references) are test-only.
  const payments = await query(
    `DELETE p FROM payments p
       JOIN users u ON u.id = p.student_id
      WHERE u.role = 'student'
        AND (p.reference LIKE 'CS-%' OR (p.reference LIKE 'UI-PAY-%' AND p.status = 'pending'))`
  );

  // Remove synthetic test audit_logs created by check scripts
  await query(
    `DELETE FROM audit_logs
      WHERE details LIKE '%check.student.%'
         OR details LIKE '%check\\_%'
         OR details LIKE '%verification run%'
         OR details LIKE '%Verification run%'
         OR details LIKE '%verification override%'`
  );

  // The admin check script names everything it creates with a `check_`/`check.`
  // prefix and removes it on the way out. If it is interrupted mid-run the rows
  // survive, so sweep them here — an extra section would otherwise sit in every
  // student's workflow forever.
  const orphanUsers = await query(
    `DELETE FROM users
      WHERE email LIKE 'check.student.%@student.ui.edu.ng'
         OR email LIKE 'check.officer.%@ui.edu.ng'`
  );

  const orphanSections = await query(
    `DELETE s FROM clearance_stages s
      WHERE s.code LIKE 'check\\_%'
        AND NOT EXISTS (
          SELECT 1 FROM clearance_status cs
           WHERE cs.stage_id = s.id AND cs.status <> 'not_started'
        )`
  );

  // Deleting a section leaves a gap in stage_order; close it so the workflow
  // stays contiguous, which the dashboards and the checks both assume.
  if (orphanSections.affectedRows) {
    const remaining = await query('SELECT id FROM clearance_stages ORDER BY stage_order');
    for (const [index, stage] of remaining.entries()) {
      await query('UPDATE clearance_stages SET stage_order = ? WHERE id = ?', [index + 1, stage.id]);
    }
  }

  console.log(
    `Removed ${docs.length} test document(s); reset ${reset.affectedRows} stage row(s); ` +
      `cleared ${payments.affectedRows} simulated payment(s); ` +
      `swept ${orphanUsers.affectedRows} test account(s) and ${orphanSections.affectedRows} test section(s).`
  );
  process.exit(0);
})();


