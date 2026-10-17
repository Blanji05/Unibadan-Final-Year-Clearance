/**
 * Clean up script:
 * Completely removes any fake/seeded approvals or rejections from clearance_status.
 * Only genuine student requests and genuine submissions remain in the system.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

async function resetAllFakeApprovals() {
  console.log('Resetting all fake approvals and rejections across clearance_status...');

  // 1. Reset all clearance_status where no real submission_document exists
  const [resetResult] = await db.pool.query(`
    UPDATE clearance_status
       SET status = 'not_started',
           officer_id = NULL,
           remarks = NULL,
           submitted_at = NULL,
           reviewed_at = NULL,
           officer_name_snapshot = NULL,
           officer_signature_snapshot = NULL,
           slip_reference = NULL
     WHERE id NOT IN (SELECT clearance_status_id FROM submission_documents)
  `);
  console.log(`✓ Reset ${resetResult.affectedRows} records to 'not_started'.`);

  // 2. Any clearance_status that has real submission_documents attached should be in 'pending' status
  // awaiting real officer review
  const [pendingResult] = await db.pool.query(`
    UPDATE clearance_status
       SET status = 'pending',
           officer_id = NULL,
           reviewed_at = NULL,
           officer_name_snapshot = NULL,
           officer_signature_snapshot = NULL,
           slip_reference = NULL
     WHERE id IN (SELECT clearance_status_id FROM submission_documents)
  `);
  console.log(`✓ Verified ${pendingResult.affectedRows} real submission(s) set to 'pending'.`);

  // 3. Check distribution
  const [counts] = await db.pool.query(
    'SELECT status, COUNT(*) AS count FROM clearance_status GROUP BY status'
  );
  console.log('Current clearance_status distribution:', counts);

  const [activeSubmissions] = await db.pool.query(`
    SELECT cs.id, cs.student_id, cs.stage_id, cs.status, u.full_name, u.matric_number, s.stage_name
      FROM clearance_status cs
      JOIN users u ON cs.student_id = u.id
      JOIN clearance_stages s ON cs.stage_id = s.id
     WHERE cs.status != 'not_started'
  `);
  console.log('Genuine active submissions in system:', activeSubmissions);

  // Notify real-time clients
  try {
    const { emitToRole } = require('../services/realtimeService');
    emitToRole('admin', 'clearance:update', {});
    emitToRole('officer', 'queue:update', {});
  } catch (_) {}

  process.exit(0);
}

resetAllFakeApprovals().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});

