/**
 * Upgrades an existing database for the Remita payment gateway.
 * Safe to run more than once. Fresh installs get this from database/schema.sql.
 *
 *   npm run db:migrate-remita
 */
const { query, queryOne, pool } = require('../config/db');
const { config } = require('../config/env');

async function main() {
  const hasRrr = await queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'rrr'`,
    [config.db.database]
  );

  if (!hasRrr.n) {
    await query('ALTER TABLE payments ADD COLUMN rrr VARCHAR(30) DEFAULT NULL AFTER reference');
    console.log('[migrate] added payments.rrr');
  } else {
    console.log('[migrate] payments.rrr already present');
  }

  await query("ALTER TABLE payments MODIFY COLUMN gateway VARCHAR(30) NOT NULL DEFAULT 'remita'");
  await query("UPDATE payments SET gateway = 'simulated' WHERE reference LIKE 'CS-%' AND rrr IS NULL AND status = 'success'");
  console.log('[migrate] payments.gateway default is now remita');
}

main()
  .catch((error) => {
    console.error('[migrate] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool && pool.end) await pool.end();
  });

