const bcrypt = require('bcryptjs');
const { pool, query, queryOne } = require('../config/db');
const { config } = require('../config/env');
const { ACADEMIC_STRUCTURE, slugify } = require('../config/academicStructure');

async function main() {
  console.log('[academic-seed] Beginning seeding of all UI Faculties & Departments officer accounts...');

  const password = config.seedPassword || 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Verify clearance stages exist
  const deptStage = await queryOne("SELECT id, code FROM clearance_stages WHERE code = 'department'");
  const facStage = await queryOne("SELECT id, code FROM clearance_stages WHERE code = 'faculty'");

  if (!deptStage || !facStage) {
    throw new Error('Department and Faculty clearance stages must exist. Run db:init first.');
  }

  const usedEmails = new Set();
  const existingUsers = await query("SELECT email FROM users");
  existingUsers.forEach((u) => usedEmails.add(u.email.toLowerCase()));

  let facCount = 0;
  let deptCount = 0;
  let updatedCount = 0;

  // 2. Seed Faculty Officers
  for (const item of ACADEMIC_STRUCTURE) {
    const facSlug = slugify(item.faculty);
    const email = `fac.${facSlug}@ui.edu.ng`;
    const fullName = `Faculty Officer - ${item.faculty}`;

    const existing = await queryOne("SELECT id FROM users WHERE email = ?", [email]);
    if (!existing) {
      await query(
        `INSERT INTO users (full_name, email, password_hash, role, section_code, faculty, department, phone_number, is_active)
         VALUES (?, ?, ?, 'officer', 'faculty', ?, NULL, '08020000000', TRUE)`,
        [fullName, email, passwordHash, item.faculty]
      );
      usedEmails.add(email.toLowerCase());
      facCount++;
    } else {
      await query(
        `UPDATE users SET full_name = ?, section_code = 'faculty', faculty = ?, is_active = TRUE WHERE id = ?`,
        [fullName, item.faculty, existing.id]
      );
      updatedCount++;
    }
  }

  // 3. Seed Department Officers
  for (const item of ACADEMIC_STRUCTURE) {
    for (const dept of item.departments) {
      let deptSlug = slugify(dept);
      let email = `dept.${deptSlug}@ui.edu.ng`;

      // Handle rare clash across different faculties by scoping with faculty slug
      if (usedEmails.has(email) && !email.includes(slugify(item.faculty))) {
        const existing = await queryOne("SELECT department FROM users WHERE email = ?", [email]);
        if (existing && existing.department !== dept) {
          email = `dept.${deptSlug}-${slugify(item.faculty)}@ui.edu.ng`;
        }
      }

      const fullName = `Department Officer - ${dept}`;
      const existing = await queryOne("SELECT id FROM users WHERE email = ?", [email]);

      if (!existing) {
        await query(
          `INSERT INTO users (full_name, email, password_hash, role, section_code, faculty, department, phone_number, is_active)
           VALUES (?, ?, ?, 'officer', 'department', ?, ?, '08030000000', TRUE)`,
          [fullName, email, passwordHash, item.faculty, dept]
        );
        usedEmails.add(email.toLowerCase());
        deptCount++;
      } else {
        await query(
          `UPDATE users SET full_name = ?, section_code = 'department', faculty = ?, department = ?, is_active = TRUE WHERE id = ?`,
          [fullName, item.faculty, dept, existing.id]
        );
        updatedCount++;
      }
    }
  }

  console.log(`[academic-seed] Completed successfully!`);
  console.log(`  + Created ${facCount} Faculty Officer accounts`);
  console.log(`  + Created ${deptCount} Department Officer accounts`);
  console.log(`  + Updated ${updatedCount} existing accounts`);
  console.log(`  Default password for all officer logins: ${password}`);

  const totalOfficers = await queryOne("SELECT COUNT(*) AS c FROM users WHERE role = 'officer'");
  console.log(`  Total active section officers in database: ${totalOfficers.c}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[academic-seed] Error:', err);
    await pool.end();
    process.exit(1);
  });

