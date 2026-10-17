/**
 * Adds the tables behind the deadline/reminder and password-reset features to an
 * existing database. Safe to run more than once - it never touches existing data.
 *
 *   npm run db:migrate-features
 */
const { query, pool } = require('../config/db');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
     setting_key   VARCHAR(50) PRIMARY KEY,
     setting_value VARCHAR(255) DEFAULT NULL,
     updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS password_resets (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     user_id    INT NOT NULL,
     token_hash CHAR(64) NOT NULL,
     expires_at DATETIME NOT NULL,
     used_at    DATETIME DEFAULT NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     INDEX idx_reset_token (token_hash)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await query(sql);
  }
  console.log('[migrate] settings and password_resets tables are ready');
}

main()
  .catch((error) => {
    console.error('[migrate] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

