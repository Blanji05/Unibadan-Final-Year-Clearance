/**
 * Seeds and configures the exact official required documents for all 10 clearance sections.
 * Gives each section officer the exact prehand document checklist, with the ability to
 * add or remove any documents related to their section.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool, query } = require('../config/db');

async function seedSectionDocuments() {
  console.log('[seedSectionDocuments] Ensuring all official document types exist...');

  const docTypes = [
    { code: 'kdl_id_card', label: 'KDL Library ID Card', description: 'Kenneth Dike Library identification card' },
    { code: 'library_form', label: 'Library Form (KDL Registration Form)', description: 'Completed Kenneth Dike Library clearance form' },
    { code: 'school_fee_receipts', label: 'School Fee Receipts (100L to Final Year)', description: 'All official school fee receipts from 100L through final year' },
    { code: 'room_clearance', label: 'Room Clearance Form', description: 'Hostel room clearance sign-off' },
    { code: 'passport_photo', label: 'Passport Photograph', description: 'Recent colour passport photograph' },
    { code: 'school_id', label: 'School Identity Card', description: 'University of Ibadan student ID card' },
    { code: 'off_campus_form', label: 'Off-Campus Form', description: 'Required for any session not spent residing in the hostel' },
    { code: 'maintenance_clearance', label: 'Hall Maintenance Clearance', description: 'Hall maintenance clearance sign-off' },
    { code: 'jaja_card', label: 'Jaja Health Card', description: 'University Health Services clinic card' },
    { code: 'alumni_receipt', label: '₦1,000 Bank Teller / Alumni Payment Receipt', description: '₦1,000 bank teller or payment receipt for alumni dues' },
    { code: 'alumni_form', label: 'Printed Online Alumni Form', description: 'Printed online alumni registration form from alumni.ui.edu.ng' },
    { code: 'dept_dues_receipts', label: 'Department Dues Receipts (100L to Final Year)', description: 'Department association dues receipts for every session' },
    { code: 'course_forms', label: 'Course Registration Forms (100L to Final Year)', description: 'Approved course forms for each year from 100L to final year' },
    { code: 'dept_signoff', label: 'Departmental Clearance Slip / Sign-off', description: 'Academic department clearance confirmation slip' },
    { code: 'faculty_dues_receipts', label: 'Faculty Dues Receipts (100L to Final Year)', description: 'Faculty association dues receipts for every academic session' },
    { code: 'sports_clearance_slip', label: 'Sports Council Clearance Slip', description: 'Official Sports Council clearance sign-off' },
    { code: 'library_clearance_slip', label: 'Library Clearance Slip', description: 'Stamped Kenneth Dike Library clearance slip' },
    { code: 'hall_clearance_slip', label: 'Hall Clearance Slip', description: 'Signed and stamped Hall of Residence clearance slip' },
    { code: 'faculty_clearance_slip', label: 'Faculty Clearance Slip', description: 'Signed and stamped clearance form from Faculty Office' },
    { code: 'lodgings_clearance_slip', label: 'Lodgings Clearance Slip', description: 'Student Affairs Lodgings sign-off' },
    { code: 'bursar_clearance_slip', label: 'Bursary Clearance Letter / Slip', description: 'Official Bursary clearance letter' },
    { code: 'graduation_fee_receipt', label: 'Graduation Fee Receipt', description: 'Official receipt for graduation and convocation' },
    { code: 'statement_of_result', label: 'Statement of Result (2 Photocopies)', description: 'Two photocopies of student personal statement of result' },
  ];

  for (const dt of docTypes) {
    await query(
      `INSERT INTO document_types (code, label, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description)`,
      [dt.code, dt.label, dt.description]
    );
  }

  // Fetch all document types mapped by code
  const allDocTypes = await query('SELECT id, code FROM document_types');
  const docIdByCode = new Map(allDocTypes.map((d) => [d.code, d.id]));

  // Fetch all clearance stages mapped by code
  const stages = await query('SELECT id, code, stage_name FROM clearance_stages ORDER BY stage_order');
  const stageIdByCode = new Map(stages.map((s) => [s.code, s.id]));

  console.log('[seedSectionDocuments] Configuring exact document requirements for all 10 sections...');

  // Exact specification from user request:
  const sectionRequirements = {
    // 1. Library (KDL): KDL ID
    library: [
      { code: 'kdl_id_card', mandatory: true },
    ],

    // 2. Hall and Maintenance: School fee receipts (100L to final); room clearance; passport photo; school ID; off-campus form
    hall: [
      { code: 'school_fee_receipts', mandatory: true },
      { code: 'room_clearance', mandatory: true },
      { code: 'passport_photo', mandatory: true },
      { code: 'school_id', mandatory: true },
      { code: 'off_campus_form', mandatory: false },
      { code: 'maintenance_clearance', mandatory: true },
    ],

    // 3. Jaja Clinic: Jaja card
    clinic: [
      { code: 'jaja_card', mandatory: true },
    ],

    // 4. Alumni: ₦1,000 bank teller; printed online alumni form
    alumni: [
      { code: 'alumni_receipt', mandatory: true },
      { code: 'alumni_form', mandatory: true },
    ],

    // 5. Department: Department dues receipts (100L to final); course forms (100L to final); department clearance
    department: [
      { code: 'dept_dues_receipts', mandatory: true },
      { code: 'course_forms', mandatory: true },
      { code: 'dept_signoff', mandatory: true },
    ],

    // 6. Sports: School ID; Hall, Alumni and Library clearances
    sports: [
      { code: 'school_id', mandatory: true },
      { code: 'hall_clearance_slip', mandatory: true },
      { code: 'alumni_receipt', mandatory: true },
      { code: 'library_clearance_slip', mandatory: true },
    ],

    // 7. Faculty: Faculty dues receipts (100L to final); course forms (100L to final); Department, Sports, Library, Alumni, Hall clearances
    faculty: [
      { code: 'faculty_dues_receipts', mandatory: true },
      { code: 'course_forms', mandatory: true },
      { code: 'dept_signoff', mandatory: true },
      { code: 'sports_clearance_slip', mandatory: true },
      { code: 'library_clearance_slip', mandatory: true },
      { code: 'alumni_receipt', mandatory: true },
      { code: 'hall_clearance_slip', mandatory: true },
    ],

    // 8. Lodgings: School ID, Hall, Library, Dept, Faculty clearances, Lodgings slip
    lodgings: [
      { code: 'school_id', mandatory: true },
      { code: 'hall_clearance_slip', mandatory: true },
      { code: 'library_clearance_slip', mandatory: true },
      { code: 'dept_signoff', mandatory: true },
      { code: 'faculty_clearance_slip', mandatory: true },
      { code: 'lodgings_clearance_slip', mandatory: true },
    ],

    // 9. Bursary: Jaja clearance with passport photo; graduation receipt; Alumni receipt; all school fee receipts; 2 photocopies of statement of result; plus earlier clearances
    bursar: [
      { code: 'jaja_card', mandatory: true },
      { code: 'passport_photo', mandatory: true },
      { code: 'graduation_fee_receipt', mandatory: true },
      { code: 'alumni_receipt', mandatory: true },
      { code: 'school_fee_receipts', mandatory: true },
      { code: 'statement_of_result', mandatory: true },
      { code: 'library_clearance_slip', mandatory: true },
      { code: 'hall_clearance_slip', mandatory: true },
      { code: 'dept_signoff', mandatory: true },
      { code: 'sports_clearance_slip', mandatory: true },
      { code: 'faculty_clearance_slip', mandatory: true },
      { code: 'lodgings_clearance_slip', mandatory: true },
    ],

    // 10. Student Affairs: Bursary clearance; graduation receipt; school fee receipts 100L to final; 2 photocopies of statement of result; all earlier clearances
    student_affairs: [
      { code: 'bursar_clearance_slip', mandatory: true },
      { code: 'graduation_fee_receipt', mandatory: true },
      { code: 'school_fee_receipts', mandatory: true },
      { code: 'statement_of_result', mandatory: true },
      { code: 'jaja_card', mandatory: true },
      { code: 'library_clearance_slip', mandatory: true },
      { code: 'hall_clearance_slip', mandatory: true },
      { code: 'alumni_receipt', mandatory: true },
      { code: 'dept_signoff', mandatory: true },
      { code: 'sports_clearance_slip', mandatory: true },
      { code: 'faculty_clearance_slip', mandatory: true },
      { code: 'lodgings_clearance_slip', mandatory: true },
    ],
  };

  // Clear existing mapping to seed the exact clean list
  await query('DELETE FROM stage_requirements');

  let count = 0;
  for (const [stageCode, reqList] of Object.entries(sectionRequirements)) {
    const stageId = stageIdByCode.get(stageCode);
    if (!stageId) continue;

    for (const req of reqList) {
      const docTypeId = docIdByCode.get(req.code);
      if (!docTypeId) {
        console.warn(`Doc code "${req.code}" not found!`);
        continue;
      }

      await query(
        `INSERT INTO stage_requirements (stage_id, document_type_id, is_mandatory)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_mandatory = VALUES(is_mandatory)`,
        [stageId, docTypeId, req.mandatory ? 1 : 0]
      );
      count++;
    }
  }

  console.log(`[seedSectionDocuments] Successfully seeded ${count} stage document requirements across all 10 clearance sections! 🎉`);
}

seedSectionDocuments()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Error seeding section documents:', err);
    pool.end();
    process.exit(1);
  });

