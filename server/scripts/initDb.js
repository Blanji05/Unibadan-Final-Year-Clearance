/**
 * Creates the database (if absent) and applies database/schema.sql.
 *
 * Usage:
 *   npm run db:init          # create + apply schema
 *   npm run db:init -- --drop  # DROP the database first, then recreate
 */
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { config } = require('../config/env');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql');

async function main() {
  const shouldDrop = process.argv.includes('--drop');

  // Connect without selecting a database so we can create it.
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    if (shouldDrop) {
      console.log(`[db] dropping database ${config.db.database} ...`);
      await connection.query(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
    }

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
    );
    console.log(`[db] database ready: ${config.db.database}`);

    await connection.changeUser({ database: config.db.database });

    const sql = await fs.readFile(SCHEMA_PATH, 'utf8');
    await connection.query(sql);
    console.log('[db] schema applied successfully.');

    const [[{ stages }]] = await connection.query('SELECT COUNT(*) AS stages FROM clearance_stages');
    const [[{ types }]] = await connection.query('SELECT COUNT(*) AS types FROM document_types');
    const [[{ edges }]] = await connection.query('SELECT COUNT(*) AS edges FROM stage_prerequisites');
    console.log(`[db] seeded: ${stages} stages, ${types} document types, ${edges} prerequisite links.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('\n[db] initialization failed:', error.message);
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('     Check DB_USER / DB_PASSWORD in server/.env');
  }
  if (error.code === 'ECONNREFUSED') {
    console.error('     Is the MySQL service running?');
  }
  process.exit(1);
});
