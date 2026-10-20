/**
 * Migration Script: University of Ibadan Final Year Clearance Guide & Requirements
 *
 * Configures the 10 real University of Ibadan clearance stages with authentic
 * step-by-step guidance, campus locations, and exact document requirements.
 */
const { query } = require('../config/db');

async function migrate() {
  console.log('[migrate-ui-guide] Updating University of Ibadan clearance stages...');

  const stagesData = [
    {
      id: 1,
      code: 'library',
      stage_name: 'Library Clearance',
      stage_order: 1,
      location: 'Kenneth Dike Library (KDL)',
      description: 'First clearance stage. Walk into Kenneth Dike Library (KDL) to obtain and complete the library clearance form. Present your KDL ID Card (submitted upon clearance). Clearance takes ~30 mins unless you have overdue books or outstanding fines to settle.',
      estimated_duration_days: 1,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 2,
      code: 'hall',
      stage_name: 'Caution and Hall Clearance',
      stage_order: 2,
      location: 'Student Hall of Residence & Maintenance Office',
      description: 'Required for all students regardless of hostel residency. Present all School Fee Receipts (100L to final year), Room Clearance, 1 Passport Photograph, School ID, and Off-Campus Form (if you resided off-campus in any session). Once verified, proceed to Maintenance for maintenance stamp.',
      estimated_duration_days: 2,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 3,
      code: 'clinic',
      stage_name: 'Jaja Clinic Clearance',
      stage_order: 3,
      location: 'University Health Services (Jaja Clinic)',
      description: 'Fastest stage (~15 minutes). Walk into Jaja Clinic and present your original Jaja Health Registration Card for verification and official clearance stamping.',
      estimated_duration_days: 1,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 4,
      code: 'alumni',
      stage_name: 'Alumni Association Clearance',
      stage_order: 4,
      location: null,
      description: 'Alumni association clearance. Verification of alumni registration and dues payment receipt for digital graduation records.',
      estimated_duration_days: 1,
      requires_payment: true,
      payment_amount: 1000.0,
    },
    {
      id: 5,
      code: 'department',
      stage_name: 'Departmental Clearance',
      stage_order: 5,
      location: 'Academic Department Office',
      description: 'Departmental verification confirming all academic coursework, project submission, and departmental dues are settled. You will need your departmental clearance slip for all subsequent stages.',
      estimated_duration_days: 2,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 6,
      code: 'sports',
      stage_name: 'Sports Clearance',
      stage_order: 6,
      location: 'Sports Council Office (Beside Faculty of Education)',
      description: 'Located beside Faculty of Education on the way to Social Sciences from KDL. Requirements: School ID Card, approved Hall Clearance, Alumni Clearance, and KDL Library Clearance.',
      estimated_duration_days: 1,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 7,
      code: 'faculty',
      stage_name: 'Faculty Clearance',
      stage_order: 7,
      location: 'Faculty Office',
      description: 'Verification at your Faculty Office (~30 minutes). Requires approved Departmental Clearance, Sports Clearance, KDL Library Clearance, Alumni Clearance, and Hall Clearance.',
      estimated_duration_days: 1,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 8,
      code: 'lodgings',
      stage_name: 'Lodgings Clearance',
      stage_order: 8,
      location: 'Student Affairs (Behind Central Admin)',
      description: 'Student Affairs verification of hall, lodgings, and preceding clearances before proceeding to Bursary.',
      estimated_duration_days: 1,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 9,
      code: 'bursar',
      stage_name: 'Bursar Clearance',
      stage_order: 9,
      location: 'Bursar Office',
      description: 'Thorough financial verification (minimum 2 days). Requirements: Jaja clearance with passport photograph, Graduation Receipt, Alumni receipt, Hall & Maintenance clearance, Sports clearance, All school fee receipts (100L to finals), Faculty & Departmental clearance, Lodgings clearance, Library clearance, and 2 photocopies of personal statement of result (from Examinations Office).',
      estimated_duration_days: 3,
      requires_payment: false,
      payment_amount: 0.0,
    },
    {
      id: 10,
      code: 'student_affairs',
      stage_name: 'Student Affairs Division Clearance (Final)',
      stage_order: 10,
      location: 'Student Affairs Division (Central Admin)',
      description: 'Final University Clearance. Requirements: Bursar clearance, Graduation receipt, Jaja clearance, Alumni clearance, Sports clearance, Caution & Hall clearance, Library clearance, All school fee receipts (100L to finals), Departmental clearance, Faculty clearance, Lodgings clearance, and 2 photocopies of statement of result. All original documents must be presented.',
      estimated_duration_days: 2,
      requires_payment: false,
      payment_amount: 0.0,
    },
  ];

  for (const s of stagesData) {
    await query(
      `INSERT INTO clearance_stages (id, code, stage_name, stage_order, location, description, estimated_duration_days, requires_payment, payment_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         stage_name = VALUES(stage_name),
         stage_order = VALUES(stage_order),
         location = VALUES(location),
         description = VALUES(description),
         estimated_duration_days = VALUES(estimated_duration_days),
         requires_payment = VALUES(requires_payment),
         payment_amount = VALUES(payment_amount)`,
      [s.id, s.code, s.stage_name, s.stage_order, s.location, s.description, s.estimated_duration_days, s.requires_payment, s.payment_amount]
    );
  }

  console.log('[migrate-ui-guide] Updating document types taxonomy...');
  const docTypes = [
    { id: 1, code: 'kdl_id_card', label: 'KDL Library ID Card', description: 'Kenneth Dike Library identification card' },
    { id: 2, code: 'school_fee_receipts', label: 'School Fee Receipts (100L - Final Year)', description: 'All session fee receipts from 100L through final year' },
    { id: 3, code: 'passport_photo', label: 'Passport Photograph', description: 'Recent colour passport photograph' },
    { id: 4, code: 'school_id', label: 'School Identity Card', description: 'University of Ibadan student ID card' },
    { id: 5, code: 'off_campus_form', label: 'Off-Campus Form', description: 'Required for any academic session student resided off campus' },
    { id: 6, code: 'room_clearance', label: 'Room Clearance Form', description: 'Hall room clearance sign-off' },
    { id: 7, code: 'jaja_card', label: 'Jaja Health Card', description: 'University Health Services clinic card' },
    { id: 8, code: 'alumni_form', label: 'Alumni Registration Form', description: 'Digital Alumni Registration Form' },
    { id: 9, code: 'alumni_receipt', label: 'Alumni Payment Receipt (₦1,000)', description: 'Bank teller or Remita receipt for the ₦1,000 alumni dues' },
    { id: 10, code: 'dept_signoff', label: 'Departmental Clearance Slip', description: 'Academic department clearance confirmation and dues sign-off' },
    { id: 11, code: 'graduation_fee_receipt', label: 'Graduation Fee Receipt', description: 'Official receipt for graduation / convocation fee' },
    { id: 12, code: 'statement_of_result', label: 'Statement of Result (Personal Copy - 2 Photocopies)', description: 'Two photocopies of personal copy from Examinations Office (not sponsor copy)' },
    { id: 13, code: 'maintenance_clearance', label: 'Hall Maintenance Clearance', description: 'Stamped maintenance sign-off slip from hall maintenance unit' },
    { id: 14, code: 'library_clearance_slip', label: 'Library Clearance Slip', description: 'Stamped Kenneth Dike Library clearance form' },
    { id: 15, code: 'hall_clearance_slip', label: 'Hall Clearance Slip', description: 'Signed and stamped Hall of Residence clearance slip' },
    { id: 16, code: 'sports_clearance_slip', label: 'Sports Council Clearance Slip', description: 'Official Sports Council clearance sign-off' },
    { id: 17, code: 'faculty_clearance_slip', label: 'Faculty Clearance Slip', description: 'Signed and stamped clearance form from Faculty Office' },
    { id: 18, code: 'lodgings_clearance_slip', label: 'Lodgings Clearance Slip', description: 'Student Affairs Lodgings sign-off' },
    { id: 19, code: 'bursar_clearance_slip', label: 'Bursar Clearance Letter', description: 'Official Bursary clearance letter' },
  ];

  for (const dt of docTypes) {
    await query(
      `INSERT INTO document_types (id, code, label, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description)`,
      [dt.id, dt.code, dt.label, dt.description]
    );
  }

  console.log('[migrate-ui-guide] Mapping stage document requirements per UI steps...');
  // Clear default stage requirements mapping to establish the exact UI guide
  await query('DELETE FROM stage_requirements');

  const stageReqMap = [
    // Step 1: Library (KDL)
    { stage_id: 1, doc_id: 1, is_mandatory: true }, // KDL ID card

    // Step 2: Hall & Caution
    { stage_id: 2, doc_id: 2, is_mandatory: true }, // School fee receipts (100L - Final)
    { stage_id: 2, doc_id: 6, is_mandatory: true }, // Room clearance
    { stage_id: 2, doc_id: 3, is_mandatory: true }, // One passport photo
    { stage_id: 2, doc_id: 4, is_mandatory: true }, // School ID
    { stage_id: 2, doc_id: 13, is_mandatory: true }, // Maintenance clearance
    { stage_id: 2, doc_id: 5, is_mandatory: false }, // Off campus form (optional if stayed in hostel)

    // Step 3: Jaja Clinic
    { stage_id: 3, doc_id: 7, is_mandatory: true }, // Jaja card

    // Step 4: Alumni Office
    { stage_id: 4, doc_id: 9, is_mandatory: true }, // Alumni receipt / teller (₦1,000)
    { stage_id: 4, doc_id: 8, is_mandatory: true }, // Alumni online form

    // Step 5: Departmental
    { stage_id: 5, doc_id: 10, is_mandatory: true }, // Departmental signoff / clearance

    // Step 6: Sports Council
    { stage_id: 6, doc_id: 4, is_mandatory: true }, // School ID
    { stage_id: 6, doc_id: 15, is_mandatory: true }, // Hall clearance
    { stage_id: 6, doc_id: 9, is_mandatory: true }, // Alumni receipt / clearance
    { stage_id: 6, doc_id: 14, is_mandatory: true }, // Library clearance

    // Step 7: Faculty Office
    { stage_id: 7, doc_id: 10, is_mandatory: true }, // Departmental clearance
    { stage_id: 7, doc_id: 16, is_mandatory: true }, // Sports clearance
    { stage_id: 7, doc_id: 14, is_mandatory: true }, // KDL Library clearance
    { stage_id: 7, doc_id: 9, is_mandatory: true }, // Alumni clearance
    { stage_id: 7, doc_id: 15, is_mandatory: true }, // Hall clearance

    // Step 8: Lodgings
    { stage_id: 8, doc_id: 4, is_mandatory: true }, // School ID
    { stage_id: 8, doc_id: 15, is_mandatory: true }, // Hall clearance
    { stage_id: 8, doc_id: 18, is_mandatory: true }, // Lodgings verification form

    // Step 9: Bursar Office
    { stage_id: 9, doc_id: 7, is_mandatory: true }, // Jaja clearance with passport
    { stage_id: 9, doc_id: 3, is_mandatory: true }, // Passport photo
    { stage_id: 9, doc_id: 11, is_mandatory: true }, // Graduation receipt
    { stage_id: 9, doc_id: 9, is_mandatory: true }, // Alumni receipt
    { stage_id: 9, doc_id: 15, is_mandatory: true }, // Hall clearance
    { stage_id: 9, doc_id: 13, is_mandatory: true }, // Maintenance clearance
    { stage_id: 9, doc_id: 16, is_mandatory: true }, // Sports clearance
    { stage_id: 9, doc_id: 2, is_mandatory: true }, // All school fee receipts (100L - final)
    { stage_id: 9, doc_id: 17, is_mandatory: true }, // Faculty clearance
    { stage_id: 9, doc_id: 10, is_mandatory: true }, // Department clearance
    { stage_id: 9, doc_id: 18, is_mandatory: true }, // Lodgings clearance
    { stage_id: 9, doc_id: 14, is_mandatory: true }, // Library clearance
    { stage_id: 9, doc_id: 12, is_mandatory: true }, // Statement of result (2 photocopies)

    // Step 10: Student Affairs Division (Final Clearance)
    { stage_id: 10, doc_id: 19, is_mandatory: true }, // Bursar clearance
    { stage_id: 10, doc_id: 11, is_mandatory: true }, // Graduation receipt
    { stage_id: 10, doc_id: 7, is_mandatory: true }, // Jaja clearance
    { stage_id: 10, doc_id: 9, is_mandatory: true }, // Alumni clearance
    { stage_id: 10, doc_id: 16, is_mandatory: true }, // Sports clearance
    { stage_id: 10, doc_id: 15, is_mandatory: true }, // Caution & Hall clearance
    { stage_id: 10, doc_id: 14, is_mandatory: true }, // Library clearance
    { stage_id: 10, doc_id: 2, is_mandatory: true }, // School fee receipts 100L to finals
    { stage_id: 10, doc_id: 10, is_mandatory: true }, // Department clearance
    { stage_id: 10, doc_id: 17, is_mandatory: true }, // Faculty clearance
    { stage_id: 10, doc_id: 18, is_mandatory: true }, // Lodgings clearance
    { stage_id: 10, doc_id: 12, is_mandatory: true }, // Statement of result (2 photocopies)
  ];

  for (const r of stageReqMap) {
    await query(
      `INSERT INTO stage_requirements (stage_id, document_type_id, is_mandatory)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_mandatory = VALUES(is_mandatory)`,
      [r.stage_id, r.doc_id, r.is_mandatory]
    );
  }

  console.log('[migrate-ui-guide] Migration completed successfully!');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate-ui-guide] Error:', err);
    process.exit(1);
  });

