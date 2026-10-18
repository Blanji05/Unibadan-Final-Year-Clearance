/**
 * Clearance workflow service — enforces prerequisite gating, the core of this
 * project's research contribution vs. prior work that lacked it.
 */
const { query, queryOne, withTransaction } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');
const { notifyUser } = require('../utils/sendSMS');

/**
 * Create a clearance_status row for every active stage for a student.
 *
 * Accepts an optional existing connection so it can participate in the
 * caller's transaction (used during registration). INSERT IGNORE keeps it
 * safe to re-run if new stages are added later.
 */
async function initializeClearanceForStudent(studentId, conn = null) {
  const run = conn
    ? (sql, params) => conn.query(sql, params)
    : (sql, params) => query(sql, params);

  const [stages] = conn
    ? await conn.query('SELECT id FROM clearance_stages WHERE is_active = TRUE ORDER BY stage_order')
    : [await query('SELECT id FROM clearance_stages WHERE is_active = TRUE ORDER BY stage_order')];

  if (!stages.length) return 0;

  const values = stages.map((s) => [studentId, s.id, 'not_started']);
  await run(
    `INSERT IGNORE INTO clearance_status (student_id, stage_id, status) VALUES ${values.map(() => '(?, ?, ?)').join(', ')}`,
    values.flat()
  );

  return stages.length;
}


/**
 * Fetch a student's clearance progress across all stages.
 *
 * Returns an array of stage objects with status, prerequisites, and payment info.
 * The `can_submit` flag tells the frontend whether prerequisites are satisfied.
 */
async function getStudentClearanceStatus(studentId) {
  // Retrieve student academic attributes for routing
  const student = await queryOne(
    'SELECT id, full_name, matric_number, department, faculty, hall, phone_number, email FROM users WHERE id = ?',
    [studentId]
  );

  // All stages with current status
  const stages = await query(
    `SELECT cs.id AS clearance_status_id, cs.student_id, cs.stage_id, cs.status,
            cs.officer_id, cs.remarks, cs.submitted_at, cs.reviewed_at, cs.updated_at,
            stage.code, stage.stage_name, stage.stage_order, stage.location, stage.description,
            stage.estimated_duration_days, stage.requires_payment, stage.payment_amount,
            officer.full_name AS officer_name
       FROM clearance_status cs
       JOIN clearance_stages stage ON cs.stage_id = stage.id
       LEFT JOIN users officer ON cs.officer_id = officer.id
      WHERE cs.student_id = ?
      ORDER BY stage.stage_order`,
    [studentId]
  );

  // Look up dedicated officer for student's department if applicable
  let deptOfficer = null;
  if (student?.department) {
    const cleanFac = student.faculty ? student.faculty.replace(/^Faculty of\s+/i, '').trim() : '';
    deptOfficer = await queryOne(
      `SELECT id, full_name, email, phone_number FROM users 
        WHERE role = 'officer' AND section_code = 'department' 
          AND (LOWER(TRIM(department)) = LOWER(TRIM(?))
            OR LOWER(TRIM(department)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
            OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(department)), '%'))
          AND is_active = TRUE 
        ORDER BY 
          CASE WHEN LOWER(TRIM(department)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
          CASE WHEN ? != '' AND (LOWER(TRIM(faculty)) = LOWER(TRIM(?)) OR LOWER(TRIM(faculty)) = LOWER(CONCAT('faculty of ', TRIM(?)))) THEN 0 ELSE 1 END,
          id ASC
        LIMIT 1`,
      [student.department, student.department, student.department, student.department, cleanFac, cleanFac, cleanFac]
    );
  }

  // Look up dedicated officer for student's faculty if applicable
  let facOfficer = null;
  if (student?.faculty) {
    const cleanFac = student.faculty.replace(/^Faculty of\s+/i, '').trim();
    facOfficer = await queryOne(
      `SELECT id, full_name, email, phone_number FROM users 
        WHERE role = 'officer' AND section_code = 'faculty' 
          AND (LOWER(TRIM(faculty)) = LOWER(TRIM(?))
            OR LOWER(TRIM(faculty)) = LOWER(CONCAT('faculty of ', TRIM(?)))
            OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(faculty)), '%'))
          AND is_active = TRUE LIMIT 1`,
      [cleanFac, cleanFac, cleanFac]
    );
  }

  // Look up dedicated officer for student's hall of residence if applicable
  let hallOfficer = null;
  if (student?.hall) {
    hallOfficer = await queryOne(
      `SELECT id, full_name, email, phone_number FROM users 
        WHERE role = 'officer' AND section_code = 'hall' 
          AND (LOWER(TRIM(hall)) = LOWER(TRIM(?))
            OR LOWER(TRIM(hall)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
            OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(hall)), '%'))
          AND is_active = TRUE LIMIT 1`,
      [student.hall, student.hall, student.hall]
    );
  }

  // Load the prerequisite graph for all stages
  const prereqs = await query(
    `SELECT stage_id, prerequisite_stage_id FROM stage_prerequisites`
  );
  const prereqMap = prereqs.reduce((acc, p) => {
    if (!acc[p.stage_id]) acc[p.stage_id] = [];
    acc[p.stage_id].push(p.prerequisite_stage_id);
    return acc;
  }, {});

  // Load required document types per stage
  const stageReqs = await query(
    `SELECT sr.stage_id, dt.id AS document_type_id, dt.code AS doc_code, dt.label AS doc_label,
            sr.is_mandatory
       FROM stage_requirements sr
       JOIN document_types dt ON sr.document_type_id = dt.id
      ORDER BY sr.stage_id`
  );
  const reqMap = stageReqs.reduce((acc, r) => {
    if (!acc[r.stage_id]) acc[r.stage_id] = [];
    acc[r.stage_id].push({
      document_type_id: r.document_type_id,
      code: r.doc_code,
      label: r.doc_label,
      is_mandatory: Boolean(r.is_mandatory),
    });
    return acc;
  }, {});

  // Check payment status for stages that require it
  const payments = await query(
    `SELECT stage_id, status, reference, paid_at FROM payments WHERE student_id = ? AND status = 'success'`,
    [studentId]
  );
  const paidStages = new Set(payments.map((p) => p.stage_id));

  // Build the status index for prerequisite checks
  const statusIndex = stages.reduce((acc, s) => {
    acc[s.stage_id] = s.status;
    return acc;
  }, {});

  // Map stage IDs to basic info for detailed prerequisite reporting
  const stageNameMap = stages.reduce((acc, s) => {
    acc[s.stage_id] = { id: s.stage_id, stage_order: s.stage_order, stage_name: s.stage_name };
    return acc;
  }, {});

  // Determine `can_submit` and personalize stage details for each stage
  const result = stages.map((s) => {
    const stagePrereqs = prereqMap[s.stage_id] || [];
    const allPrereqsApproved = stagePrereqs.every((pId) => statusIndex[pId] === 'approved');
    const paymentSatisfied = s.requires_payment ? paidStages.has(s.stage_id) : true;

    const prerequisite_details = stagePrereqs.map((pId) => ({
      id: pId,
      stage_order: stageNameMap[pId]?.stage_order || pId,
      stage_name: stageNameMap[pId]?.stage_name || `Stage ${pId}`,
      status: statusIndex[pId] || 'not_started',
      is_approved: statusIndex[pId] === 'approved',
    }));

    let stage_name = s.stage_name;
    let location = null;
    let description = s.description;
    let assigned_officer = null;

    if (s.code === 'department') {
      if (student?.department) {
        stage_name = `Departmental Clearance — ${student.department}`;
        description = `Online clearance endorsement by the ${student.department} Departmental Clearance Officer. Verifies departmental dues, project submission, and departmental requirements.`;
      }
      if (deptOfficer) {
        assigned_officer = {
          id: deptOfficer.id,
          name: deptOfficer.full_name,
          email: deptOfficer.email,
        };
      }
    } else if (s.code === 'faculty') {
      if (student?.faculty) {
        const cleanFac = student.faculty.replace(/^Faculty of\s+/i, '').trim();
        stage_name = `Faculty Clearance — Faculty of ${cleanFac}`;
        description = `Online Dean's Office clearance for Faculty of ${cleanFac}. Final academic check, verification of department clearance and prerequisite sign-offs.`;
      }
      if (facOfficer) {
        assigned_officer = {
          id: facOfficer.id,
          name: facOfficer.full_name,
          email: facOfficer.email,
        };
      }
    } else if (s.code === 'hall') {
      if (student?.hall) {
        stage_name = `Caution and Hall Clearance — ${student.hall}`;
        description = `Hostel and maintenance clearance for residents of ${student.hall}. Verification of room clearance, caution deposit, school fee receipts, and maintenance inspection.`;
      }
      if (hallOfficer) {
        assigned_officer = {
          id: hallOfficer.id,
          name: hallOfficer.full_name,
          email: hallOfficer.email,
        };
      }
    }

    return {
      ...s,
      stage_name,
      location,
      description,
      assigned_officer,
      officer_name: s.officer_name || assigned_officer?.name || null,
      student_department: student?.department || null,
      student_faculty: student?.faculty || null,
      student_hall: student?.hall || null,
      requires_payment: Boolean(s.requires_payment),
      payment_amount: Number(s.payment_amount),
      payment_settled: paymentSatisfied,
      prerequisites: stagePrereqs,
      prerequisites_met: allPrereqsApproved,
      prerequisite_details,
      can_submit: allPrereqsApproved && paymentSatisfied && s.status !== 'approved',
      required_documents: reqMap[s.stage_id] || [],
    };
  });

  return result;
}

/**
 * Check whether a student can submit a given stage, enforcing prerequisites.
 * Throws if prerequisites are not met — this is the gating mechanism.
 */
async function assertCanSubmitStage(studentId, stageId) {
  const stage = await queryOne('SELECT id, code, stage_name, requires_payment FROM clearance_stages WHERE id = ?', [
    stageId,
  ]);
  if (!stage) throw new ApiError('Clearance stage not found.', 404);

  const status = await queryOne(
    'SELECT id, status FROM clearance_status WHERE student_id = ? AND stage_id = ?',
    [studentId, stageId]
  );
  if (!status) throw new ApiError('Clearance status record not found.', 404);
  if (status.status === 'approved') {
    throw new ApiError('This stage has already been approved.', 400);
  }

  // Prerequisite check
  const prereqs = await query('SELECT prerequisite_stage_id FROM stage_prerequisites WHERE stage_id = ?', [stageId]);
  if (prereqs.length) {
    const prereqIds = prereqs.map((p) => p.prerequisite_stage_id);
    const placeholders = prereqIds.map(() => '?').join(',');
    const unapproved = await query(
      `SELECT stage_id FROM clearance_status
        WHERE student_id = ? AND stage_id IN (${placeholders}) AND status != 'approved'`,
      [studentId, ...prereqIds]
    );

    if (unapproved.length) {
      const names = await query(
        `SELECT stage_name FROM clearance_stages WHERE id IN (${unapproved.map(() => '?').join(',')})`,
        unapproved.map((u) => u.stage_id)
      );
      throw new ApiError(
        `You must complete these stages first: ${names.map((n) => n.stage_name).join(', ')}.`,
        403
      );
    }
  }

  // Payment check
  if (stage.requires_payment) {
    const paid = await queryOne(
      'SELECT id FROM payments WHERE student_id = ? AND stage_id = ? AND status = "success"',
      [studentId, stageId]
    );
    if (!paid) {
      throw new ApiError(`Payment is required for ${stage.stage_name} before you can submit.`, 402);
    }
  }

  return { clearanceStatusId: status.id, stage };
}

/**
 * Submit documents for a stage. Writes clearance_status + submission_documents
 * atomically. The `documentIds` array references documents already in the vault.
 */
async function submitStage(studentId, stageId, documentIds = [], remarks = null) {
  const { clearanceStatusId, stage } = await assertCanSubmitStage(studentId, stageId);

  // Coerce to integers so the ids can never carry SQL, then confirm every
  // document actually belongs to this student - otherwise a student could
  // attach another student's uploads to their own submission.
  const ids = [...new Set((documentIds || []).map(Number).filter(Number.isInteger))];

  if (ids.length) {
    const owned = await query(
      `SELECT id FROM documents WHERE student_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [studentId, ...ids]
    );
    if (owned.length !== ids.length) {
      throw new ApiError('One or more selected documents could not be found in your document vault.', 400);
    }
  }

  // Every mandatory document type for this stage must be covered.
  const missing = await query(
    `SELECT dt.label
       FROM stage_requirements sr
       JOIN document_types dt ON dt.id = sr.document_type_id
      WHERE sr.stage_id = ? AND sr.is_mandatory = TRUE
        AND sr.document_type_id NOT IN (
          SELECT document_type_id FROM documents
           WHERE student_id = ? ${ids.length ? `AND id IN (${ids.map(() => '?').join(',')})` : 'AND 1 = 0'}
        )`,
    ids.length ? [stageId, studentId, ...ids] : [stageId, studentId]
  );
  if (missing.length) {
    throw new ApiError(
      `Missing required document(s): ${missing.map((m) => m.label).join(', ')}.`,
      400
    );
  }

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE clearance_status
          SET status = 'pending', submitted_at = NOW(), remarks = ?, officer_id = NULL, reviewed_at = NULL
        WHERE id = ?`,
      [remarks, clearanceStatusId]
    );

    // Rebuild the attachment set so a resubmission after rejection replaces the
    // previous selection instead of colliding with uq_submission_doc.
    await conn.execute('DELETE FROM submission_documents WHERE clearance_status_id = ?', [clearanceStatusId]);

    if (ids.length) {
      await conn.execute(
        `INSERT INTO submission_documents (clearance_status_id, document_id) VALUES ${ids.map(() => '(?, ?)').join(', ')}`,
        ids.flatMap((docId) => [clearanceStatusId, docId])
      );
    }
  });

  // Tell the section's officers a submission is waiting for them, so nobody has
  // to keep refreshing the queue to notice new work.
  const student = await queryOne(
    'SELECT full_name, matric_number, department, faculty, hall FROM users WHERE id = ?',
    [studentId]
  );

  let officersSql = `SELECT id, email, phone_number FROM users WHERE role = 'officer' AND section_code = ? AND is_active = TRUE`;
  const officersParams = [stage.code];

  if (stage.code === 'department' && student?.department) {
    officersSql += ` AND (LOWER(TRIM(department)) = LOWER(TRIM(?))
                     OR LOWER(TRIM(department)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
                     OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(department)), '%'))`;
    officersParams.push(student.department, student.department, student.department);
  } else if (stage.code === 'faculty' && student?.faculty) {
    const cleanFac = student.faculty.replace(/^Faculty of\s+/i, '').trim();
    officersSql += ` AND (LOWER(TRIM(faculty)) = LOWER(TRIM(?))
                     OR LOWER(TRIM(faculty)) = LOWER(CONCAT('faculty of ', TRIM(?)))
                     OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(faculty)), '%'))`;
    officersParams.push(cleanFac, cleanFac, cleanFac);
  } else if (stage.code === 'hall' && student?.hall) {
    officersSql += ` AND (LOWER(TRIM(hall)) = LOWER(TRIM(?))
                     OR LOWER(TRIM(hall)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
                     OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(hall)), '%'))`;
    officersParams.push(student.hall, student.hall, student.hall);
  }

  const officers = await query(officersSql, officersParams);

  let displayStageName = stage.stage_name;
  if (stage.code === 'department' && student?.department) {
    displayStageName = `Departmental Clearance (${student.department})`;
  } else if (stage.code === 'faculty' && student?.faculty) {
    displayStageName = `Faculty Clearance (${student.faculty})`;
  } else if (stage.code === 'hall' && student?.hall) {
    displayStageName = `Caution & Hall Clearance (${student.hall})`;
  }

  for (const officer of officers) {
    await notifyUser({
      userId: officer.id,
      phone: officer.phone_number,
      email: officer.email,
      title: `New submission: ${displayStageName}`,
      message: `${student?.full_name || 'A student'} (${student?.matric_number || '—'}) submitted ${displayStageName} for review.`,
      stageId,
      subject: `UI Clearance: new ${displayStageName} submission`,
    });
  }

  // Notify student that their submission has been officially received
  const studentUser = await queryOne('SELECT id, full_name, email, phone_number FROM users WHERE id = ?', [studentId]);
  if (studentUser && studentUser.email) {
    await notifyUser({
      userId: studentId,
      phone: studentUser.phone_number,
      email: studentUser.email,
      title: `Submission Received: ${displayStageName}`,
      message: `Hello ${studentUser.full_name},\n\nYour clearance submission for ${displayStageName} has been successfully received and placed in the clearance officer review queue.\n\nYou will be notified via email immediately once the officer reviews and updates your clearance status.`,
      stageId,
      subject: `UI Clearance Submission Confirmed: ${displayStageName}`,
      actionUrl: 'https://unibadan-final-year-clearance.vercel.app/student',
      actionText: 'Track Clearance Status',
    });
  }

  try {
    const { emitToRole, emitToUser } = require('./realtimeService');
    for (const officer of officers) {
      emitToUser(officer.id, 'queue:update', { stageId, studentId });
      emitToUser(officer.id, 'clearance:update', { stageId, studentId, status: 'pending' });
    }
    if (stage.code !== 'department' && stage.code !== 'faculty' && stage.code !== 'hall') {
      emitToRole('officer', 'queue:update', { stageId, studentId });
      emitToRole('officer', 'clearance:update', { stageId, studentId, status: 'pending' });
    }
    emitToRole('admin', 'queue:update', { stageId, studentId });
    emitToRole('admin', 'clearance:update', { stageId, studentId, status: 'pending' });
    emitToUser(studentId, 'clearance:update', { stageId, status: 'pending' });
  } catch (err) {
    console.warn('[realtime] submit emit failed:', err.message);
  }

  return { message: `${displayStageName} submitted successfully. Awaiting officer review.` };
}


/**
 * Officer approves or rejects a stage.
 */
async function reviewStage(officerId, studentId, stageId, decision, remarks) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError('Decision must be "approved" or "rejected".', 400);
  }

  const status = await queryOne(
    'SELECT id, status FROM clearance_status WHERE student_id = ? AND stage_id = ?',
    [studentId, stageId]
  );
  if (!status) throw new ApiError('Clearance status record not found.', 404);
  if (status.status !== 'pending') {
    throw new ApiError('Only pending submissions can be reviewed.', 400);
  }

  if (decision === 'approved') {
    const officer = await queryOne('SELECT id, full_name, signature_url, title FROM users WHERE id = ?', [officerId]);
    if (!officer?.full_name || officer.full_name.trim().length < 2) {
      throw new ApiError('You must set your official name in your profile before approving student clearance.', 400);
    }
    if (!officer?.signature_url) {
      throw new ApiError('You must upload your official signature in your profile before approving student clearance.', 400);
    }

    const crypto = require('crypto');
    const slipRef = `UI-SLIP-${stageId}-${studentId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    await query(
      `UPDATE clearance_status
          SET status = ?, officer_id = ?, remarks = ?, reviewed_at = NOW(),
              officer_name_snapshot = ?, officer_signature_snapshot = ?, slip_reference = ?
        WHERE id = ?`,
      [decision, officerId, remarks, officer.full_name, officer.signature_url, slipRef, status.id]
    );
  } else {
    await query(
      `UPDATE clearance_status
          SET status = ?, officer_id = ?, remarks = ?, reviewed_at = NOW()
        WHERE id = ?`,
      [decision, officerId, remarks, status.id]
    );
  }

  try {
    const { emitToRole, emitToUser } = require('./realtimeService');
    emitToUser(studentId, 'clearance:update', { stageId, status: decision, remarks });
    emitToRole('officer', 'queue:update', { stageId, studentId });
    emitToRole('admin', 'queue:update', { stageId, studentId });
    emitToRole('officer', 'clearance:update', { stageId, studentId, status: decision });
    emitToRole('admin', 'clearance:update', { stageId, studentId, status: decision });
  } catch (err) {
    console.warn('[realtime] review emit failed:', err.message);
  }

  // Send email notification to student on approval or rejection
  try {
    const student = await queryOne('SELECT full_name, email, matric_number FROM users WHERE id = ?', [studentId]);
    const stage = await queryOne('SELECT stage_name FROM clearance_stages WHERE id = ?', [stageId]);
    const officer = await queryOne('SELECT full_name, title FROM users WHERE id = ?', [officerId]);

    if (student?.email) {
      const isApproved = decision === 'approved';
      const stageName = stage?.stage_name || 'Section Clearance';
      const officerName = officer?.full_name || 'Section Clearance Officer';

      const subject = isApproved
        ? `[UI Clearance] APPROVED: ${stageName}`
        : `[UI Clearance] ACTION REQUIRED: ${stageName} Returned`;

      const textMessage = isApproved
        ? `Dear ${student.full_name},\n\n` +
          `Congratulations! Your clearance for ${stageName} has been officially APPROVED by ${officerName}.\n\n` +
          `Officer Remarks: ${remarks || 'Cleared all requirements and fulfilled non-indebtedness obligations.'}\n\n` +
          `You can now log into the University of Ibadan Clearance Portal to download your official signed Section Clearance Slip (PDF) and proceed with any subsequent stages.\n\n` +
          `Best regards,\n` +
          `University of Ibadan Clearance Management System`
        : `Dear ${student.full_name},\n\n` +
          `Your clearance submission for ${stageName} was reviewed and returned with corrections required.\n\n` +
          `Reviewing Officer: ${officerName}\n` +
          `Reason / Remarks: ${remarks || 'Please check your uploaded documents and resubmit.'}\n\n` +
          `Action Required:\n` +
          `Please log into your clearance portal, review the officer's feedback, replace or cancel the affected documents, and resubmit.\n\n` +
          `Best regards,\n` +
          `University of Ibadan Clearance Management System`;

      const htmlMessage = isApproved
        ? `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #002147; padding: 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">UNIVERSITY OF IBADAN</h2>
              <p style="margin: 5px 0 0; font-size: 13px; color: #f59e0b;">Student Clearance Management System</p>
            </div>
            <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
              <h3 style="color: #047857; margin-top: 0;">✓ Clearance Section Approved</h3>
              <p>Dear <strong>${student.full_name}</strong> (${student.matric_number || ''}),</p>
              <p>Your clearance application for <strong>${stageName}</strong> has been officially verified and <strong>APPROVED</strong>.</p>
              <div style="background-color: #f8fafc; border-left: 4px solid #047857; padding: 12px 16px; margin: 16px 0;">
                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;"><strong>Endorsed By:</strong> ${officerName}</p>
                <p style="margin: 0; font-size: 13px; color: #334155;"><strong>Officer Remarks:</strong> ${remarks || 'All requirements fulfilled.'}</p>
              </div>
              <p>You can now log into your student portal to download your official digitally-signed <strong>Section Clearance Slip (PDF)</strong> and proceed with subsequent clearance sections.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">University of Ibadan, Ibadan, Oyo State, Nigeria</p>
            </div>
          </div>`
        : `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #002147; padding: 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">UNIVERSITY OF IBADAN</h2>
              <p style="margin: 5px 0 0; font-size: 13px; color: #f59e0b;">Student Clearance Management System</p>
            </div>
            <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
              <h3 style="color: #dc2626; margin-top: 0;">⚠ Action Required: Clearance Section Returned</h3>
              <p>Dear <strong>${student.full_name}</strong> (${student.matric_number || ''}),</p>
              <p>Your submission for <strong>${stageName}</strong> was reviewed and returned with corrections needed.</p>
              <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
                <p style="margin: 0 0 6px; font-size: 13px; color: #991b1b;"><strong>Reviewed By:</strong> ${officerName}</p>
                <p style="margin: 0; font-size: 13px; color: #7f1d1d;"><strong>Reason / Remarks:</strong> ${remarks || 'Please replace or cancel invalid documents and resubmit.'}</p>
              </div>
              <p>Please log into your portal to replace or cancel the affected documents, update your submission, and resubmit for review.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">University of Ibadan, Ibadan, Oyo State, Nigeria</p>
            </div>
          </div>`;

      const { sendEmail } = require('../utils/mailer');
      await sendEmail({
        to: student.email,
        subject,
        text: textMessage,
        html: htmlMessage,
      });
    }
  } catch (emailErr) {
    console.warn('[reviewStage] email notification error:', emailErr.message);
  }

  return { message: `Stage ${decision}.` };
}

/**
 * Generate and return an authentic PDF clearance slip for a completed stage.
 */
async function getStageClearanceSlip(studentId, stageId) {
  const student = await queryOne(
    `SELECT id, full_name, matric_number, department, faculty, hall, phone_number, email, passport_url
       FROM users WHERE id = ?`,
    [studentId]
  );
  if (!student) throw new ApiError('Student record not found.', 404);

  const stage = await queryOne(
    `SELECT id, code, stage_name, stage_order, location, description FROM clearance_stages WHERE id = ?`,
    [stageId]
  );
  if (!stage) throw new ApiError('Clearance stage not found.', 404);

  const clearance = await queryOne(
    `SELECT id, student_id, stage_id, status, officer_id, remarks, reviewed_at,
            officer_name_snapshot, officer_signature_snapshot, slip_reference
       FROM clearance_status WHERE student_id = ? AND stage_id = ?`,
    [studentId, stageId]
  );
  if (!clearance) throw new ApiError('Clearance record not found for this section.', 404);
  if (clearance.status !== 'approved') {
    throw new ApiError(`Clearance slip is only available once ${stage.stage_name} has been approved by the section officer.`, 400);
  }

  // Personalize stage name if department, faculty, or hall
  if (stage.code === 'department' && student.department) {
    stage.stage_name = `Departmental Clearance — ${student.department}`;
  } else if (stage.code === 'faculty' && student.faculty) {
    const cleanFac = student.faculty.replace(/^Faculty of\s+/i, '').trim();
    stage.stage_name = `Faculty Clearance — Faculty of ${cleanFac}`;
  } else if (stage.code === 'hall' && student.hall) {
    stage.stage_name = `Caution and Hall Clearance — ${student.hall}`;
  }
  stage.location = null;

  // Officer details
  let officer = null;
  if (clearance.officer_id) {
    officer = await queryOne(
      `SELECT id, full_name, email, title, signature_url FROM users WHERE id = ?`,
      [clearance.officer_id]
    );
  }

  if (!clearance.slip_reference) {
    const crypto = require('crypto');
    clearance.slip_reference = `UI-SLIP-${stage.stage_order || stage.id}-${student.matric_number || student.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await query('UPDATE clearance_status SET slip_reference = ? WHERE id = ?', [clearance.slip_reference, clearance.id]);
  }

  const { generateClearanceSlipPDF } = require('../utils/generatePDF');
  const pdfBuffer = await generateClearanceSlipPDF({
    student,
    stage,
    clearance,
    officer: officer || {
      full_name: clearance.officer_name_snapshot || 'Section Clearance Officer',
      title: `${stage.stage_name} Officer`,
      signature_url: clearance.officer_signature_snapshot,
    },
  });

  return {
    pdfBuffer,
    fileName: `UI-Clearance-Slip-${stage.code}-${String(student.matric_number || student.id).replace(/\W/g, '')}.pdf`,
    filename: `UI-Clearance-Slip-${stage.code}-${String(student.matric_number || student.id).replace(/\W/g, '')}.pdf`,
    slipReference: clearance.slip_reference,
  };
}

/**
 * Admin override — directly set a stage status (for manual corrections).
 */
async function overrideStageStatus(adminId, studentId, stageId, newStatus, remarks) {
  const validStatuses = ['not_started', 'pending', 'approved', 'rejected'];
  if (!validStatuses.includes(newStatus)) {
    throw new ApiError(`Invalid status. Must be one of: ${validStatuses.join(', ')}.`, 400);
  }

  const status = await queryOne(
    'SELECT id FROM clearance_status WHERE student_id = ? AND stage_id = ?',
    [studentId, stageId]
  );
  if (!status) throw new ApiError('Clearance status record not found.', 404);

  await query(
    `UPDATE clearance_status SET status = ?, officer_id = ?, remarks = ?, reviewed_at = NOW() WHERE id = ?`,
    [newStatus, adminId, remarks, status.id]
  );

  // Audit log
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES (?, 'override_stage_status', 'clearance_status', ?, ?)`,
    [adminId, status.id, JSON.stringify({ studentId, stageId, newStatus, remarks })]
  );

  // An override that settles a stage is exactly the kind of change the student
  // would otherwise discover only by refreshing the dashboard.
  if (newStatus === 'approved' || newStatus === 'rejected') {
    const [student, stage] = await Promise.all([
      queryOne('SELECT id, email, phone_number FROM users WHERE id = ?', [studentId]),
      queryOne('SELECT stage_name FROM clearance_stages WHERE id = ?', [stageId]),
    ]);

    if (student && stage) {
      const title = `${stage.stage_name} ${newStatus}`;
      await notifyUser({
        userId: student.id,
        phone: student.phone_number,
        email: student.email,
        title,
        message:
          newStatus === 'approved'
            ? `Your ${stage.stage_name} has been cleared (administrative sign-off). You may proceed to the next stage.`
            : `Your ${stage.stage_name} was not cleared. ${remarks || 'Contact the administrator for details.'}`,
        stageId,
        subject: `UI Clearance: ${title}`,
      });
    }
  }

  try {
    const { emitToRole, emitToUser } = require('./realtimeService');
    emitToUser(studentId, 'clearance:update', { stageId, status: newStatus, remarks });
    emitToRole('officer', 'queue:update', { stageId, studentId });
    emitToRole('admin', 'queue:update', { stageId, studentId });
  } catch (err) {
    console.warn('[realtime] override emit failed:', err.message);
  }

  return { message: 'Stage status overridden.' };
}

module.exports = {
  initializeClearanceForStudent,
  getStudentClearanceStatus,
  assertCanSubmitStage,
  submitStage,
  reviewStage,
  getStageClearanceSlip,
  overrideStageStatus,
};


