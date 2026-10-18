const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, queryOne } = require('../config/db');
const { config } = require('../config/env');

const SCHEMA_PATHS = [
  path.join(__dirname, '..', 'schema.sql'),
  path.join(__dirname, '..', '..', 'database', 'schema.sql'),
];

async function ensureSchemaAndSeed() {
  try {
    // 1. Check if users table already exists and has an admin
    let hasAdmin = false;
    try {
      const admin = await queryOne("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      if (admin) hasAdmin = true;
    } catch (err) {
      // Table doesn't exist yet
    }

    // 2. If table doesn't exist, apply schema.sql
    if (!hasAdmin) {
      console.log('[autoInit] Initializing database tables...');
      let schemaFile = SCHEMA_PATHS.find((p) => fsSync.existsSync(p));
      if (schemaFile) {
        const sql = await fs.readFile(schemaFile, 'utf8');
        // Split statements by semicolon that ends a line
        const statements = sql
          .replace(/--.*$/gm, '')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          try {
            await pool.query(statement);
          } catch (stmtErr) {
            // Ignore duplicate or already-exists errors
            if (!stmtErr.message.includes('already exists') && !stmtErr.message.includes('Duplicate')) {
              console.warn('[autoInit] Statement notice:', stmtErr.message.slice(0, 100));
            }
          }
        }
        console.log('[autoInit] Schema applied successfully.');
      }
    }

    // 3. Ensure the admin user exists
    const existingAdmin = await queryOne("SELECT id FROM users WHERE email = 'admin@ui.edu.ng'");
    if (!existingAdmin) {
      const hash = await bcrypt.hash(config.seedPassword || 'Password123!', 12);
      await query(
        `INSERT INTO users (full_name, email, password_hash, role, phone_number)
         VALUES ('System Administrator', 'admin@ui.edu.ng', ?, 'admin', '08030000000')`,
        [hash]
      );
      console.log('[autoInit] Created default admin account: admin@ui.edu.ng');
    }

    // 4. Ensure demo officers exist
    const officerCount = await queryOne("SELECT COUNT(*) AS c FROM users WHERE role = 'officer'");
    if (!officerCount || Number(officerCount.c) === 0) {
      const hash = await bcrypt.hash(config.seedPassword || 'Password123!', 12);
      const stages = await query("SELECT code, stage_name FROM clearance_stages");
      for (const st of stages) {
        const offEmail = `${st.code}.officer@ui.edu.ng`;
        const exists = await queryOne("SELECT id FROM users WHERE email = ?", [offEmail]);
        if (!exists) {
          await query(
            `INSERT INTO users (full_name, email, password_hash, role, section_code, phone_number)
             VALUES (?, ?, ?, 'officer', ?, '08030000010')`,
            [`${st.stage_name} Officer`, offEmail, hash, st.code]
          );
        }
      }
      console.log('[autoInit] Seeded section officers.');
    }

    return { success: true, message: 'Database initialized and seeded successfully.' };
  } catch (error) {
    console.error('[autoInit] Error during database auto-init:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { ensureSchemaAndSeed };
