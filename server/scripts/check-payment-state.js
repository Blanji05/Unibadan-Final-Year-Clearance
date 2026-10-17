/**
 * Prints a student's payment rows straight from the database.
 *
 * Useful when a payment-related test fails: it tells you whether the fee was
 * genuinely never charged, or whether an earlier run already settled it (in
 * which case run scripts/cleanup-test-data.js to reset).
 *
 *   node scripts/check-payment-state.js [email]
 */
// Resolved relative to this file so the script works from any directory.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/db');

const email = process.argv[2] || 'anjoola@student.ui.edu.ng';

(async () => {
  const rows = await query(
    `SELECT p.id, p.reference, p.amount, p.status, p.paid_at, s.stage_name
       FROM payments p
       JOIN users u ON u.id = p.student_id
       LEFT JOIN clearance_stages s ON s.id = p.stage_id
      WHERE u.email = ?
      ORDER BY p.id`,
    [email]
  );

  console.log(`\npayments for ${email}: ${rows.length}`);

  rows.forEach((r) => {
    // 'CS-' references are simulated (no Remita round-trip) — i.e. test data.
    const kind = r.reference.startsWith('CS-') ? 'simulated' : 'remita';
    console.log(
      `  #${r.id}  ${(r.stage_name || 'unknown stage').padEnd(24)} ` +
        `₦${r.amount}  ${r.status.padEnd(8)} ${kind}  ref=${r.reference}`
    );
  });

  if (rows.some((r) => r.reference.startsWith('CS-') && r.status === 'success')) {
    console.log('\nNote: a simulated payment is already settled, so payment-gating');
    console.log('assertions will fail until you run scripts/cleanup-test-data.js\n');
  }

  process.exit(0);
})();
