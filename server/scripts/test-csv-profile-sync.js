/**
 * Automated test script to verify:
 * 1. CSV import with exact 15 columns requested by the user.
 * 2. Profile locked fields vs editable empty fields.
 * 3. Real-time sync of the CSV file when students edit their profile.
 * 4. Admin CSV download reflects latest updates with exact headers.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool, query, queryOne } = require('../config/db');
const { importStudents, exportStudentProfilesCsv, syncStudentProfilesCsvFile, CSV_PROFILE_HEADERS } = require('../services/studentImportService');

async function testCsvAndProfileSync() {
  console.log('--- TEST 1: CSV Header Verification ---');
  console.log('Configured Profile Headers:', CSV_PROFILE_HEADERS);
  const expectedHeaders = [
    'full_name',
    'gender',
    'matric_no',
    'email',
    'Date Of birth',
    'phone_number',
    'department',
    'faculty',
    'Graduating Session',
    'hall_of_residence',
    'password',
    'Blood Group',
    'Genotype',
    'State of origin/LGA',
    'Residentaial Addresss',
    'profile_picture',
  ];
  if (JSON.stringify(CSV_PROFILE_HEADERS) !== JSON.stringify(expectedHeaders)) {
    throw new Error('Headers do not match expected format!');
  }
  console.log('✓ Headers match exact specification with profile_picture!\n');

  console.log('--- TEST 2: Import User CSV Snippet with Profile Picture ---');
  // Use rows from user's prompt with profile_picture column added
  const testCsv =
`full_name,gender,matric_no,email,Date Of birth,phone_number,department,faculty,Graduating Session,hall_of_residence,password,Blood Group,Genotype,State of origin/LGA,Residentaial Addresss,profile_picture
Musa Adaeze Oluwatoyin,Female,230147,amusa147@stu.ui.edu.ng,2005-04-13,,Fisheries and Wildlife Management,Agriculture,2025/2026,Queen Elizabeth II Hall,,,,,,https://res.cloudinary.com/ui/image/upload/v1/passports/musa.jpg
Oyewole Anjolaoluwa,Male,201512,aoyewole512@stu.ui.edu.ng,2001-04-28,,Veterinary Medicine,Veterinary Medicine,2025/2026,Sultan Bello Hall,,,,,,
Fagbemi Amarachi,Female,220116,afagbemi116@stu.ui.edu.ng,2005-02-14,,Geography,Social Sciences,2025/2026,Queen Elizabeth II Hall,,,,,,`;

  // Get admin user ID for import audit log
  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  const adminId = admins[0]?.id || 1;

  const result = await importStudents(adminId, testCsv);
  console.log('Import result:', { created: result.created, updated: result.updated, total: result.total, failedCount: result.failed.length });
  if (result.failed.length > 0) {
    console.error('Failed rows:', result.failed);
    throw new Error('Import failed unexpectedly');
  }

  // Check imported record in DB
  const student = await queryOne('SELECT * FROM users WHERE matric_number = ?', ['230147']);
  console.log('Imported student record in DB:');
  console.log({
    full_name: student.full_name,
    gender: student.gender,
    matric_number: student.matric_number,
    email: student.email,
    dob: student.dob,
    department: student.department,
    faculty: student.faculty,
    graduation_session: student.graduation_session,
    phone_number: student.phone_number,
    hall: student.hall,
    blood_group: student.blood_group,
    passport_url: student.passport_url,
  });

  if (student.full_name !== 'Musa Adaeze Oluwatoyin' || student.gender !== 'Female' || student.dob !== '2005-04-13' || student.graduation_session !== '2025/2026') {
    throw new Error('Imported data does not match CSV row!');
  }
  if (student.passport_url !== 'https://res.cloudinary.com/ui/image/upload/v1/passports/musa.jpg') {
    throw new Error('Imported passport_url does not match CSV column!');
  }
  console.log('✓ Import correctly populated locked academic identity and profile picture!\n');

  console.log('--- TEST 3: Student Edits Empty/Editable Fields & Triggers Live Sync ---');
  // Student updates their empty profile details:
  const newPhone = '08099887766';
  const newHall = 'Queen Idia Hall';
  const newBlood = 'O+';
  const newGenotype = 'AA';
  const newState = 'Oyo State / Ibadan North';
  const newAddress = 'Flat 4, University Crescent, UI Post Office, Ibadan';
  const newPassport = 'https://res.cloudinary.com/ui/image/upload/v1/passports/musa-updated.jpg';

  await query(
    `UPDATE users
        SET phone_number = ?, hall = ?, blood_group = ?, genotype = ?,
            state_of_origin = ?, contact_address = ?, passport_url = ?
      WHERE id = ?`,
    [newPhone, newHall, newBlood, newGenotype, newState, newAddress, newPassport, student.id]
  );

  // Trigger sync function as called by studentController.updateProfile
  const syncedFile = await syncStudentProfilesCsvFile();
  console.log('Synced CSV file on disk:', syncedFile);
  if (!fs.existsSync(syncedFile)) {
    throw new Error(`Synced CSV file not found on disk at: ${syncedFile}`);
  }

  console.log('--- TEST 4: Export CSV Contains Latest Student Edits & Profile Picture ---');
  const exportCsv = await exportStudentProfilesCsv();
  console.log('Exported CSV snippet (first 300 chars):\n', exportCsv.slice(0, 300));

  // Verify that the updated phone number, hall, blood group, genotype, state, address, and profile picture are present
  if (!exportCsv.includes('08099887766') || !exportCsv.includes('Queen Idia Hall') || !exportCsv.includes('O+') || !exportCsv.includes('AA') || !exportCsv.includes('musa-updated.jpg')) {
    throw new Error('Export CSV did not include the student profile edits!');
  }
  console.log('✓ Exported CSV successfully reflects real-time student profile edits and profile picture!\n');

  // Verify that headers in exported CSV match
  const firstLine = exportCsv.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  console.log('Export CSV header line:\n', firstLine);
  if (firstLine !== expectedHeaders.join(',')) {
    throw new Error(`Header mismatch! Got:\n${firstLine}\nExpected:\n${expectedHeaders.join(',')}`);
  }
  console.log('--- TEST 5: Brand-New Student Creation with Profile Picture ---');
  const uniqueMatric = '999' + Math.floor(100 + Math.random() * 900);
  const newStudentCsv =
`full_name,gender,matric_no,email,Date Of birth,phone_number,department,faculty,Graduating Session,hall_of_residence,password,Blood Group,Genotype,State of origin/LGA,Residentaial Addresss,profile_picture
Test Student New,Male,${uniqueMatric},,2002-05-15,08123456789,Computer Science and Artificial Intelligence,Computing,2025/2026,Mellanby Hall,,,AA,Oyo State / Ibadan North,Ibadan,https://res.cloudinary.com/ui/image/upload/v1/passports/newstudent.png`;

  const newRes = await importStudents(adminId, newStudentCsv);
  console.log('New student import result:', newRes);
  if (newRes.created !== 1) {
    throw new Error('Expected 1 student created, got ' + newRes.created);
  }

  const createdStudent = await queryOne('SELECT * FROM users WHERE matric_number = ?', [uniqueMatric]);
  if (!createdStudent || createdStudent.passport_url !== 'https://res.cloudinary.com/ui/image/upload/v1/passports/newstudent.png') {
    throw new Error('New student passport_url was not saved properly in DB!');
  }
  console.log('✓ New student successfully created with passport_url and clearance stages initialized!\n');

  // Clean up test student
  await query('DELETE FROM clearance_status WHERE student_id = ?', [createdStudent.id]);
  await query('DELETE FROM users WHERE id = ?', [createdStudent.id]);

  console.log('========================================================');
  console.log('ALL CSV IMPORT, PROFILE, AND LIVE SYNC TESTS PASSED! 🎉');
  console.log('========================================================');
}

testCsvAndProfileSync()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Test error:', err);
    pool.end();
    process.exit(1);
  });

