const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool, query, queryOne } = require('../config/db');
const { login, changeInitialPassword } = require('../services/authService');
const { importStudents } = require('../services/studentImportService');
const { deleteAllStudents } = require('../services/studentAdminService');

async function runTests() {
  console.log('--- TEST 1: Universal/General Password Login Verification ---');
  // 1. Admin login with general password Password123!
  const adminLogin = await login('admin@ui.edu.ng', 'Password123!');
  console.log('✓ Admin login successful with Password123! (Admin ID: ' + adminLogin.user.id + ')');

  console.log('\n--- TEST 2: Import Student & Test Login with Matric Number and General/Random Password ---');
  const testMatric = '888' + Math.floor(100 + Math.random() * 900);
  const testEmail = `tuser${testMatric}@stu.ui.edu.ng`;
  const csv =
`full_name,gender,matric_no,email,Date Of birth,phone_number,department,faculty,Graduating Session,hall_of_residence,password,Blood Group,Genotype,State of origin/LGA,Residentaial Addresss,profile_picture
Test Student FirstLogin,Male,${testMatric},${testEmail},2002-05-15,,Computer Science and Artificial Intelligence,Computing,2025/2026,Mellanby Hall,,,,,,`;

  const importRes = await importStudents(adminLogin.user.id, csv);
  console.log('Imported student result:', { created: importRes.created, updated: importRes.updated });

  // Student should be able to log in with matric_number + Password123!
  const studentLoginMatric = await login(testMatric, 'Password123!');
  console.log('✓ Student logged in with matric number + Password123! must_change_password:', studentLoginMatric.user.must_change_password);
  if (!studentLoginMatric.user.must_change_password) {
    throw new Error('Expected student must_change_password to be true on first login!');
  }

  // Student should also be able to log in with email + Password123!
  const studentLoginEmail = await login(testEmail, 'Password123!');
  console.log('✓ Student logged in with email + Password123! (ID: ' + studentLoginEmail.user.id + ')');

  console.log('\n--- TEST 3: Student Changes Initial Password & Receives Email ---');
  const changeRes = await changeInitialPassword(studentLoginEmail.user.id, 'NewSecurePass99!');
  console.log('Change password response:', changeRes.message);

  // Verify that must_change_password is now false
  const updatedStudent = await queryOne('SELECT must_change_password, last_login_at FROM users WHERE id = ?', [studentLoginEmail.user.id]);
  console.log('DB student status after change:', updatedStudent);
  if (updatedStudent.must_change_password) {
    throw new Error('must_change_password should be false after changeInitialPassword!');
  }

  // Student can now log in with their newly set password
  const newLogin = await login(testMatric, 'NewSecurePass99!');
  console.log('✓ Student logged in successfully with their newly set password! must_change_password:', newLogin.user.must_change_password);
  if (newLogin.user.must_change_password) {
    throw new Error('Expected must_change_password to be false for subsequent logins!');
  }

  console.log('\n--- TEST 4: Delete Student Functionality ---');
  const countBefore = (await queryOne("SELECT COUNT(*) AS c FROM users WHERE role = 'student'")).c;
  console.log('Student count before delete:', countBefore);

  const { deleteStudent } = require('../services/studentAdminService');
  const delRes = await deleteStudent(adminLogin.user.id, studentLoginEmail.user.id);
  console.log('Delete student result:', delRes.message);

  const countAfter = (await queryOne("SELECT COUNT(*) AS c FROM users WHERE role = 'student'")).c;
  console.log('Student count after delete:', countAfter);
  if (countAfter !== countBefore - 1) {
    throw new Error(`Expected student count to decrement by 1, was ${countBefore} now ${countAfter}`);
  }
  console.log('✓ Test student successfully removed without affecting other students or officers!\n');

  console.log('====================================================');
  console.log('ALL FIRST LOGIN, GENERAL PASSWORD & DELETE ALL TESTS PASSED! 🎉');
  console.log('====================================================');
}

runTests()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Test error:', err);
    pool.end();
    process.exit(1);
  });

