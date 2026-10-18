const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, queryOne } = require('../config/db');
const { config } = require('../config/env');
const { ACADEMIC_STRUCTURE, UI_HALLS, slugify } = require('../config/academicStructure');

const SCHEMA_PATHS = [
  path.join(__dirname, '..', 'schema.sql'),
  path.join(__dirname, '..', '..', 'database', 'schema.sql'),
];

const CENTRAL_STAGES = [
  { code: 'library', name: 'Kenneth Dike Library Officer' },
  { code: 'clinic', name: 'Jaja Health Clinic Officer' },
  { code: 'alumni', name: 'Alumni Relations Officer' },
  { code: 'sports', name: 'Sports Council Officer' },
  { code: 'lodgings', name: 'Student Lodgings Officer' },
  { code: 'bursar', name: 'Bursary Officer' },
  { code: 'student_affairs', name: 'Student Affairs Officer' },
];

const HALL_EMAIL_SLUGS = {
  'Mellanby Hall': 'mellanby',
  'Tedder Hall': 'tedder',
  'Kuti Hall': 'kuti',
  'Sultan Bello Hall': 'sultan-bello',
  'Nnamdi Azikiwe Hall': 'nnamdi-azikiwe',
  'Independence Hall': 'independence',
  'Queen Elizabeth II Hall': 'queen-elizabeth-ii',
  'Queen Idia Hall': 'queen-idia',
  'Obafemi Awolowo Hall': 'obafemi-awolowo',
};

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

    // 7. Ensure all designated officers exist (Central, Halls, Faculties, Departments)
    const officerHash = await bcrypt.hash(config.seedPassword || 'Password123!', 10);
    const existingUsers = await query("SELECT id, email, section_code, faculty, department, hall FROM users");
    const existingUserMap = new Map();
    existingUsers.forEach((u) => existingUserMap.set(String(u.email || '').toLowerCase().trim(), u));

    // A. Seed Central Stage Officers
    for (const st of CENTRAL_STAGES) {
      const email = `${st.code}.officer@ui.edu.ng`.toLowerCase();
      if (!existingUserMap.has(email)) {
        await query(
          `INSERT INTO users (full_name, email, password_hash, role, section_code, phone_number, is_active)
           VALUES (?, ?, ?, 'officer', ?, '08030000010', TRUE)`,
          [st.name, email, officerHash, st.code]
        );
        existingUserMap.set(email, { email });
      }
    }

    // B. Seed the 9 UI Residential Halls
    for (let i = 0; i < UI_HALLS.length; i++) {
      const hallName = UI_HALLS[i];
      const slug = HALL_EMAIL_SLUGS[hallName] || slugify(hallName);
      const email = `hall.${slug}@ui.edu.ng`.toLowerCase();
      const fullName = `Hall Officer - ${hallName}`;
      const phone = `080400000${(i + 1).toString().padStart(2, '0')}`;

      const existing = existingUserMap.get(email);
      if (!existing) {
        await query(
          `INSERT INTO users (full_name, email, password_hash, role, section_code, hall, phone_number, title, is_active)
           VALUES (?, ?, ?, 'officer', 'hall', ?, ?, 'Hall Clearance Officer', TRUE)`,
          [fullName, email, officerHash, hallName, phone]
        );
        existingUserMap.set(email, { email, hall: hallName });
      } else {
        await query(
          `UPDATE users 
              SET full_name = ?, section_code = 'hall', hall = ?, phone_number = ?, 
                  title = 'Hall Clearance Officer', is_active = TRUE 
            WHERE id = ?`,
          [fullName, hallName, phone, existing.id]
        );
      }
    }

    // C. Seed Faculty Officers
    for (const item of ACADEMIC_STRUCTURE) {
      const facSlug = slugify(item.faculty);
      const email = `fac.${facSlug}@ui.edu.ng`.toLowerCase();
      const cleanFacName = item.faculty.replace(/^Faculty of\s+/i, '');
      const fullName = `Faculty Officer - ${cleanFacName}`;

      const existing = existingUserMap.get(email);
      if (!existing) {
        await query(
          `INSERT INTO users (full_name, email, password_hash, role, section_code, faculty, phone_number, title, is_active)
           VALUES (?, ?, ?, 'officer', 'faculty', ?, '08020000000', 'Faculty Clearance Officer', TRUE)`,
          [fullName, email, officerHash, item.faculty]
        );
        existingUserMap.set(email, { email, faculty: item.faculty });
      } else {
        await query(
          `UPDATE users 
              SET full_name = ?, section_code = 'faculty', faculty = ?, 
                  title = 'Faculty Clearance Officer', is_active = TRUE 
            WHERE id = ?`,
          [fullName, item.faculty, existing.id]
        );
      }
    }

    // D. Seed Department Officers
    const seenDeptEmails = new Set();
    for (const item of ACADEMIC_STRUCTURE) {
      for (const dept of item.departments) {
        let deptSlug = slugify(dept);
        let email = `dept.${deptSlug}@ui.edu.ng`.toLowerCase();
        if (seenDeptEmails.has(email)) {
          email = `dept.${deptSlug}-${slugify(item.faculty)}@ui.edu.ng`.toLowerCase();
        }
        seenDeptEmails.add(email);

        const fullName = `Department Officer - ${dept}`;
        const existing = existingUserMap.get(email);
        if (!existing) {
          await query(
            `INSERT INTO users (full_name, email, password_hash, role, section_code, faculty, department, phone_number, title, is_active)
             VALUES (?, ?, ?, 'officer', 'department', ?, ?, '08030000000', 'Department Clearance Officer', TRUE)`,
            [fullName, email, officerHash, item.faculty, dept]
          );
          existingUserMap.set(email, { email, faculty: item.faculty, department: dept });
        } else {
          await query(
            `UPDATE users 
                SET full_name = ?, section_code = 'department', faculty = ?, department = ?, 
                    title = 'Department Clearance Officer', is_active = TRUE 
              WHERE id = ?`,
            [fullName, item.faculty, dept, existing.id]
        }

        // Common shorthand alias for Computer Science
        if (dept.toLowerCase().includes('computer science') && !existingUserMap.has('dept.computer-science@ui.edu.ng')) {
          await query(
            `INSERT IGNORE INTO users (full_name, email, password_hash, role, section_code, faculty, department, phone_number, title, is_active)
             VALUES (?, 'dept.computer-science@ui.edu.ng', ?, 'officer', 'department', ?, ?, '08030000000', 'Department Clearance Officer', TRUE)`,
            [fullName, officerHash, item.faculty, dept]
          );
        }
      }
    }

    // E. Remove generic and discontinued hall/faculty/department accounts
    const obsoleteEmails = [
      'department.officer@ui.edu.ng',
      'faculty.officer@ui.edu.ng',
      'hall.officer@ui.edu.ng',
      'hall.tafawa-balewa@ui.edu.ng',
      'hall.alexander-brown@ui.edu.ng',
      'hall.off-campus@ui.edu.ng',
    ];
    try {
      const placeholders = obsoleteEmails.map(() => '?').join(', ');
      const obsoleteUsers = await query(`SELECT id FROM users WHERE email IN (${placeholders})`, obsoleteEmails);
      if (obsoleteUsers && obsoleteUsers.length > 0) {
        const ids = obsoleteUsers.map((u) => u.id);
        const idPlaceholders = ids.map(() => '?').join(', ');
        await query(`UPDATE clearance_status SET officer_id = NULL WHERE officer_id IN (${idPlaceholders})`, ids);
        await query(`DELETE FROM password_resets WHERE user_id IN (${idPlaceholders})`, ids);
        await query(`DELETE FROM users WHERE id IN (${idPlaceholders})`, ids);
        console.log(`[autoInit] Cleaned up ${ids.length} obsolete/generic officer accounts.`);
      }
    } catch (cleanErr) {
      console.warn('[autoInit] Obsolete accounts cleanup notice:', cleanErr.message);
    }
    console.log('[autoInit] Completed seeding of all UI faculty, department, hall, and central officers.');

    return { success: true, message: 'All tables, columns, and accounts initialized successfully.' };
  } catch (error) {
    console.error('[autoInit] Error during database auto-init:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { ensureSchemaAndSeed };

