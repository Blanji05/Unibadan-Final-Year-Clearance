/**
 * Seeds demo accounts: 1 admin, 10 section officers (one per stage) and
 * 3 sample students with clearance rows initialized.
 *
 * Every account uses SEED_PASSWORD from .env (default: Password123!).
 * Safe to re-run: existing emails are skipped.
 */
const bcrypt = require('bcryptjs');
const { pool, query, queryOne } = require('../config/db');
const { config } = require('../config/env');

const STUDENTS = [
  {
    full_name: 'Osunlana Anjoolaoluwa Victor',
    email: 'anjoola@student.ui.edu.ng',
    matric_number: '230922',
    department: 'Computer Science',
    faculty: 'Faculty of Computing',
    hall: 'Independence Hall',
    phone_number: '08030000001',
  },
  {
    full_name: 'Adebayo Folake Grace',
    email: 'folake@student.ui.edu.ng',
    matric_number: '230451',
    department: 'Computer Science',
    faculty: 'Faculty of Computing',
    hall: 'Queen Elizabeth II Hall',
    phone_number: '08030000002',
  },
  {
    full_name: 'Chukwu Emeka Daniel',
    email: 'emeka@student.ui.edu.ng',
    matric_number: '230777',
    department: 'Statistics',
    faculty: 'Faculty of Science',
    hall: 'Mellanby Hall',
    phone_number: '08030000003',
  },
];

async function createUser(user) {
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [user.email]);
  if (existing) return { id: existing.id, created: false };

  const password_hash = await bcrypt.hash(config.seedPassword, 12);
  const result = await query(
    `INSERT INTO users (full_name, email, password_hash, role, matric_number, department, faculty, hall, section_code, phone_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.full_name,
      user.email,
      password_hash,
      user.role,
      user.matric_number || null,
      user.department || null,
      user.faculty || null,
      user.hall || null,
      user.section_code || null,
      user.phone_number || null,
    ]
  );
  return { id: result.insertId, created: true };
}

async function main() {
  const stages = await query('SELECT id, code, stage_name FROM clearance_stages ORDER BY stage_order');
  if (!stages.length) {
    throw new Error('No clearance stages found. Run "npm run db:init" first.');
  }

  let created = 0;

  // --- Admin ---
  const admin = await createUser({
    full_name: 'System Administrator',
    email: 'admin@ui.edu.ng',
    role: 'admin',
    phone_number: '08030000000',
  });
  if (admin.created) created++;

  // --- One officer per central stage (excluding department and faculty, which have dedicated officers) ---
  for (const stage of stages) {
    if (stage.code === 'department' || stage.code === 'faculty') {
      continue;
    }
    const officer = await createUser({
      full_name: `${stage.stage_name} Officer`,
      email: `${stage.code}@ui.edu.ng`,
      role: 'officer',
      section_code: stage.code,
    });
    if (officer.created) created++;
  }

  // --- Students (with clearance rows) ---
  // The clearance rows are (re)inserted for every seeded student, not just
  // newly created ones: a student whose user row committed but whose clearance
  // insert failed would otherwise stay permanently stage-less, since the email
  // check above skips them on re-run. INSERT IGNORE makes this a no-op when the
  // rows already exist.
  for (const student of STUDENTS) {
    const result = await createUser({ ...student, role: 'student' });
    if (result.created) created++;

    const values = stages.map((s) => [result.id, s.id, 'not_started']);
    const inserted = await query(
      `INSERT IGNORE INTO clearance_status (student_id, stage_id, status) VALUES ${values.map(() => '(?, ?, ?)').join(', ')}`,
      values.flat()
    );
    if (!result.created && inserted.affectedRows) {
      console.log(`[seed] backfilled ${inserted.affectedRows} clearance stage(s) for ${student.email}`);
    }
  }


  console.log(`\n[seed] ${created} new account(s) created.`);
  console.log(`[seed] Password for every seeded account: ${config.seedPassword}\n`);
  console.log('  Admin    : admin@ui.edu.ng');
  console.log('  Officers : library@ui.edu.ng, hall@ui.edu.ng, clinic@ui.edu.ng, alumni@ui.edu.ng,');
  console.log('             sports@ui.edu.ng, lodgings@ui.edu.ng, bursar@ui.edu.ng, student_affairs@ui.edu.ng');
  console.log('             (Faculty & Department officers are dedicated per faculty and department)');
  console.log('  Students : anjoola@student.ui.edu.ng, folake@student.ui.edu.ng, emeka@student.ui.edu.ng\n');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('\n[seed] failed:', error.message);
    await pool.end();
    process.exit(1);
  });
