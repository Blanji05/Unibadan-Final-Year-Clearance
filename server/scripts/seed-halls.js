/**
 * Seed Hall Officer accounts for each of the official University of Ibadan residential halls.
 *
 * Each residential hall receives its own dedicated section officer account,
 * functioning exactly like the department-level accounts.
 */
const bcrypt = require('bcryptjs');
const { pool, query, queryOne } = require('../config/db');
const { config } = require('../config/env');
const { UI_HALLS, slugify } = require('../config/academicStructure');

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

async function main() {
  console.log('[hall-seed] Seeding dedicated Hall Officer accounts for all UI Residential Halls...');

  const password = config.seedPassword || 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);

  // Verify Caution and Hall Clearance stage exists
  const hallStage = await queryOne("SELECT id, code, stage_name FROM clearance_stages WHERE code = 'hall'");
  if (!hallStage) {
    throw new Error('Caution and Hall Clearance stage (code: hall) must exist in clearance_stages.');
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < UI_HALLS.length; i++) {
    const hallName = UI_HALLS[i];
    const slug = HALL_EMAIL_SLUGS[hallName] || slugify(hallName);
    const email = `hall.${slug}@ui.edu.ng`;
    const fullName = `Hall Officer - ${hallName}`;
    const phone = `080400000${(i + 1).toString().padStart(2, '0')}`;

    // Check if account exists by hall name or by email
    const existing = await queryOne(
      "SELECT id, email, hall FROM users WHERE (section_code = 'hall' AND hall = ?) OR email = ?",
      [hallName, email]
    );

    if (!existing) {
      await query(
        `INSERT INTO users (full_name, email, password_hash, role, section_code, hall, phone_number, title, is_active)
         VALUES (?, ?, ?, 'officer', 'hall', ?, ?, 'Hall Clearance Officer', TRUE)`,
        [fullName, email, passwordHash, hallName, phone]
      );
      createdCount++;
      console.log(`  + Created: ${fullName} <${email}>`);
    } else {
      await query(
        `UPDATE users
            SET full_name = ?, email = ?, section_code = 'hall', hall = ?, phone_number = ?,
                title = 'Hall Clearance Officer', is_active = TRUE
          WHERE id = ?`,
        [fullName, email, hallName, phone, existing.id]
      );
      updatedCount++;
      console.log(`  ~ Updated: ${fullName} <${email}>`);
    }
  }

  console.log(`\n[hall-seed] Completed successfully!`);
  console.log(`  + Created: ${createdCount} accounts`);
  console.log(`  ~ Updated: ${updatedCount} accounts`);
  console.log(`  Default password for all Hall Officer accounts: ${password}`);

  const allHallOfficers = await query(
    "SELECT id, full_name, email, hall, is_active FROM users WHERE section_code = 'hall' ORDER BY hall ASC"
  );
  console.log('\n--- Active Residential Hall Accounts ---');
  allHallOfficers.forEach((o) => {
    console.log(`  • ${o.hall || 'General'}: ${o.full_name} (${o.email})`);
  });
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[hall-seed] Error:', err);
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  });

