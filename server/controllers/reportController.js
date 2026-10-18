/**
 * Admin reports and reminders: CSV exports, the clearance deadline, and the
 * "nudge students" action.
 */
const { query } = require('../config/db');
const clearanceService = require('../services/clearanceService');
const settingsService = require('../services/settingsService');
const { importStudents: runStudentImport } = require('../services/studentImportService');
const { buildReminders } = require('../services/timelineService');
const { toCsv } = require('../utils/csv');
const { notifyUser } = require('../utils/sendSMS');
const { sendSuccess, asyncHandler } = require('../utils/apiResponse');

function sendCsv(res, filename, csv) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return res.send(csv);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** GET /api/admin/export/students.csv */
const exportStudents = asyncHandler(async (req, res) => {
  const { exportStudentProfilesCsv } = require('../services/studentImportService');
  const csv = await exportStudentProfilesCsv();
  return sendCsv(res, `students_profile_${stamp()}.csv`, csv);
});

/** GET /api/admin/export/payments.csv */
const exportPayments = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT p.reference, p.rrr, p.amount, p.status, p.gateway, p.paid_at, p.created_at,
            u.matric_number, u.full_name, s.stage_name
       FROM payments p
       JOIN users u ON u.id = p.student_id
       LEFT JOIN clearance_stages s ON s.id = p.stage_id
      ORDER BY p.created_at DESC`
  );

  const csv = toCsv(
    ['Reference', 'Channel Reference', 'Matric number', 'Student', 'Stage', 'Amount (NGN)', 'Status', 'Gateway', 'Paid at', 'Created at'],
    rows.map((r) => [
      r.reference, r.rrr, r.matric_number, r.full_name, r.stage_name, r.amount, r.status,
      r.gateway, r.paid_at, r.created_at,
    ])
  );

  return sendCsv(res, `payments-${stamp()}.csv`, csv);
});

/** GET /api/admin/settings */
const getSettings = asyncHandler(async (req, res) => {
  const deadline = await settingsService.getDeadline();
  return sendSuccess(res, {
    deadline,
    days_left: settingsService.daysUntil(deadline),
  });
});

/** PUT /api/admin/settings/deadline   { deadline: "YYYY-MM-DD" | null } */
const setDeadline = asyncHandler(async (req, res) => {
  const deadline = await settingsService.setDeadline(req.body.deadline || null);

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, details) VALUES (?, 'set_clearance_deadline', 'settings', ?)`,
    [req.user.id, JSON.stringify({ deadline })]
  );

  try {
    const { broadcast } = require('../services/realtimeService');
    broadcast('clearance:update', { deadline });
  } catch (_) {}

  return sendSuccess(res, {
    deadline,
    days_left: settingsService.daysUntil(deadline),
    message: deadline ? `Deadline set to ${deadline}.` : 'Deadline cleared.',
  });
});

/**
 * POST /api/admin/send-reminders
 *
 * Nudges every active student who still has something actionable (deadline
 * approaching, a rejection to fix, an unpaid fee, ...). Students with nothing
 * to act on are skipped so the message stays worth reading.
 */
const sendReminders = asyncHandler(async (req, res) => {
  const [students, deadline] = await Promise.all([
    query(
      `SELECT id, full_name, email, phone_number FROM users
        WHERE role = 'student' AND is_active = TRUE`
    ),
    settingsService.getDeadline(),
  ]);

  let notified = 0;
  let skipped = 0;

  for (const student of students) {
    const stages = await clearanceService.getStudentClearanceStatus(student.id);
    const reminders = buildReminders(stages, deadline);

    if (!reminders.length) {
      skipped += 1;
      continue;
    }

    // notifications.message is capped at 500 characters.
    const summary = reminders.map((r) => r.message).join(' ');
    const message = summary.length > 480 ? `${summary.slice(0, 477)}...` : summary;

    await notifyUser({
      userId: student.id,
      phone: student.phone_number,
      email: student.email,
      title: 'Clearance Deadline Reminder',
      message: `Dear ${student.full_name},\n\nYou have outstanding clearance items requiring your attention:\n\n${summary}\n\nPlease log in to your portal to complete your pending clearance stages as soon as possible before the university deadline.`,
      subject: 'Important Reminder: Outstanding University of Ibadan Clearance',
      actionUrl: 'https://unibadan-final-year-clearance.vercel.app/student',
      actionText: 'Complete Your Clearance Now',
    });
    notified += 1;
  }

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, details) VALUES (?, 'send_reminders', 'notifications', ?)`,
    [req.user.id, JSON.stringify({ notified, skipped })]
  );

  try {
    const { emitToRole } = require('../services/realtimeService');
    emitToRole('admin', 'clearance:update', {});
  } catch (_) {}

  return sendSuccess(res, {
    notified,
    skipped,
    message: `Reminder sent to ${notified} student${notified === 1 ? '' : 's'}; ${skipped} had nothing outstanding.`,
  });
});

/**
 * POST /api/admin/students/import   { csv: "<file text>" }
 */
const importStudents = asyncHandler(async (req, res) => {
  const result = await runStudentImport(req.user.id, req.body.csv);
  try {
    const { broadcast } = require('../services/realtimeService');
    broadcast('users:update', {});
    broadcast('clearance:update', {});
  } catch (_) {}
  return sendSuccess(res, {
    ...result,
    message: `Imported ${result.created} of ${result.total} student${result.total === 1 ? '' : 's'}${
      result.failed.length ? `; ${result.failed.length} row${result.failed.length === 1 ? '' : 's'} skipped` : ''
    }.`,
  }, 201);
});

module.exports = { importStudents, exportStudents, exportPayments, getSettings, setDeadline, sendReminders };

