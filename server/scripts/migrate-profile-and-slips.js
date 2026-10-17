const { query } = require('../config/db');

async function migrate() {
  console.log('[migration] Checking and adding columns to users and clearance_status...');

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
  ];

  for (const col of userColumns) {
    const exists = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [col.name]
    );
    if (!exists.length) {
      await query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
      console.log(`[migration] Added column users.${col.name}`);
    }
  }

  const statusColumns = [
    { name: 'slip_reference', type: 'VARCHAR(100) DEFAULT NULL' },
    { name: 'officer_signature_snapshot', type: 'VARCHAR(500) DEFAULT NULL' },
    { name: 'officer_name_snapshot', type: 'VARCHAR(150) DEFAULT NULL' },
  ];

  for (const col of statusColumns) {
    const exists = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clearance_status' AND COLUMN_NAME = ?`,
      [col.name]
    );
    if (!exists.length) {
      await query(`ALTER TABLE clearance_status ADD COLUMN ${col.name} ${col.type}`);
      console.log(`[migration] Added column clearance_status.${col.name}`);
    }
  }

  console.log('[migration] Migration completed successfully.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migration] failed:', err);
    process.exit(1);
  });

