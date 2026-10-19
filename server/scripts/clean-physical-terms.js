/**
 * Updates stage names, descriptions, locations, and document labels
 * to remove references to physical rooms, buildings, and directions.
 */
const { query } = require('../config/db');

async function run() {
  console.log('[migration] Cleaning physical location terminology...');

  await query(`UPDATE clearance_stages SET location = NULL`);

  await query(`
    UPDATE clearance_stages 
       SET stage_name = 'University Health Services Clearance', 
           description = 'University Health Services clearance. Online verification of institutional health registration card and medical records.' 
     WHERE code = 'clinic'
  `);

  await query(`
    UPDATE clearance_stages 
       SET stage_name = 'Sports Council Clearance', 
           description = 'Sports Council online clearance verification. Verifies student sports disengagement and equipment clearance against approved prerequisite records.' 
     WHERE code = 'sports'
  `);

  await query(`
    UPDATE clearance_stages 
       SET description = 'First clearance stage. Online verification by Kenneth Dike Library (KDL). Upload your Library ID Card and ensure all library accounts are in good standing.' 
     WHERE code = 'library'
  `);

  await query(`
    UPDATE clearance_stages 
       SET stage_name = 'Alumni Association Clearance', 
           description = 'Alumni association clearance. Verification of alumni registration and dues payment receipt for digital graduation records.' 
     WHERE code = 'alumni'
  `);

  await query(`
    UPDATE clearance_stages 
       SET description = 'Student Affairs residential disengagement verification. Confirms student lodging records and prerequisite clearances prior to Bursary review.' 
     WHERE code = 'lodgings'
  `);

  await query(`
    UPDATE clearance_stages 
       SET stage_name = 'Bursary Financial Clearance', 
           description = 'Comprehensive bursary and financial audit. Digital reconciliation of all academic session fees, convocation fee receipt, and prior section endorsements.' 
     WHERE code = 'bursar'
  `);

  await query(`
    UPDATE clearance_stages 
       SET description = 'Final institutional sign-off and clearance certificate issuance by the Student Affairs Division upon completion of all departmental, faculty, and central clearances.' 
     WHERE code = 'student_affairs'
  `);

  await query(`
    UPDATE document_types 
       SET label = 'University Health Services Card', 
           description = 'University Health Services medical registration card' 
     WHERE code = 'jaja_card'
  `);

  await query(`
    UPDATE document_types 
       SET label = 'Statement of Result', 
           description = 'Official university personal statement of result' 
     WHERE code = 'statement_of_result'
  `);

  await query(`
    UPDATE document_types 
       SET description = 'Official payment receipt for alumni registration' 
     WHERE code = 'alumni_receipt'
  `);

  await query(`
    UPDATE users 
       SET full_name = 'University Health Services Officer' 
     WHERE email = 'clinic.officer@ui.edu.ng' OR (role = 'officer' AND section_code = 'clinic')
  `);

  console.log('[migration] All physical location terms successfully cleaned!');
  process.exit(0);
}

run().catch((err) => {
  console.error('[migration] Error:', err);
  process.exit(1);
});
