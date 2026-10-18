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
    // 1. Check if users table already exists
    let usersTableExists = false;
    try {
      await queryOne("SELECT id FROM users LIMIT 1");
      usersTableExists = true;
    } catch (_) {}

    // 2. If table doesn't exist, apply schema.sql
    if (!usersTableExists) {
      console.log('[autoInit] Initializing core database tables...');
      let schemaFile = SCHEMA_PATHS.find((p) => fsSync.existsSync(p));
      if (schemaFile) {
        const sql = await fs.readFile(schemaFile, 'utf8');
        const statements = sql
          .replace(/--.*$/gm, '')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          try {
            await pool.query(statement);
          } catch (stmtErr) {
            if (!stmtErr.message.includes('already exists') && !stmtErr.message.includes('Duplicate')) {
              console.warn('[autoInit] Statement notice:', stmtErr.message.slice(0, 100));
            }
          }
        }
        console.log('[autoInit] Core schema applied.');
      }
    }

    // 3. Ensure profile & slip columns exist on `users` table
    const userColumns = [
      { name: 'passport_url', type: 'VARCHAR(500) DEFAULT NULL' },
      { name: 'signature_url', type: 'VARCHAR(500) DEFAULT NULL' },
      { name: 'title', type: 'VARCHAR(100) DEFAULT NULL' },
      { name: 'dob', type: 'VARCHAR(20) DEFAULT NULL' },
      { name: 'gender', type: 'VARCHAR(20) DEFAULT NULL' },
      { name: 'blood_group', type: 'VARCHAR(10) DEFAULT NULL' },
      { name: 'genotype', type: 'VARCHAR(10) DEFAULT NULL' },
      { name: 'next_of_kin_name', type: 'VARCHAR(150) DEFAULT NULL' },
      { name: 'next_of_kin_phone', type: 'VARCHAR(30) DEFAULT NULL' },
      { name: 'next_of_kin_address', type: 'TEXT DEFAULT NULL' },
      { name: 'contact_address', type: 'TEXT DEFAULT NULL' },
      { name: 'state_of_origin', type: 'VARCHAR(100) DEFAULT NULL' },
      { name: 'lga', type: 'VARCHAR(100) DEFAULT NULL' },
      { name: 'graduation_session', type: 'VARCHAR(50) DEFAULT NULL' },
      { name: 'degree_program', type: 'VARCHAR(100) DEFAULT NULL' },
      { name: 'must_change_password', type: 'BOOLEAN DEFAULT FALSE' },
    ];

    for (const col of userColumns) {
      try {
        const exists = await query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
          [col.name]
        );
        if (!exists.length) {
          await query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
        }
      } catch (_) {}
    }

    // 4. Ensure slip snapshot columns exist on `clearance_status`
    const statusColumns = [
      { name: 'slip_reference', type: 'VARCHAR(100) DEFAULT NULL' },
      { name: 'officer_signature_snapshot', type: 'VARCHAR(500) DEFAULT NULL' },
      { name: 'officer_name_snapshot', type: 'VARCHAR(150) DEFAULT NULL' },
    ];
    for (const col of statusColumns) {
      try {
        const exists = await query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clearance_status' AND COLUMN_NAME = ?`,
          [col.name]
        );
        if (!exists.length) {
          await query(`ALTER TABLE clearance_status ADD COLUMN ${col.name} ${col.type}`);
        }
      } catch (_) {}
    }

    // 5. Ensure auxiliary tables exist
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key   VARCHAR(50) PRIMARY KEY,
        setting_value VARCHAR(255) DEFAULT NULL,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at    DATETIME DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reset_token (token_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS section_form_fields (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stage_id INT NOT NULL,
        officer_id INT DEFAULT NULL,
        hall VARCHAR(100) DEFAULT NULL,
        department VARCHAR(100) DEFAULT NULL,
        faculty VARCHAR(100) DEFAULT NULL,
        field_label VARCHAR(255) NOT NULL,
        field_type VARCHAR(50) NOT NULL DEFAULT 'text',
        field_options TEXT DEFAULT NULL,
        placeholder VARCHAR(255) DEFAULT NULL,
        help_text TEXT DEFAULT NULL,
        is_required BOOLEAN NOT NULL DEFAULT TRUE,
        order_index INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS section_form_responses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        stage_id INT NOT NULL,
        field_id INT NOT NULL,
        response_value TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_student_field (student_id, field_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 6. Ensure default admin user exists
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

    // 7. Ensure demo officers exist
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

    return { success: true, message: 'All tables, columns, and accounts initialized successfully.' };
  } catch (error) {
    console.error('[autoInit] Error during database auto-init:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { ensureSchemaAndSeed };
