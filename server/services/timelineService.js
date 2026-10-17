/**
 * Student timeline and reminders.
 *
 * The timeline is assembled from data the system already records (stage
 * submissions/decisions and settled payments), and reminders are derived on
 * request from current state - nothing here needs a scheduler or extra storage.
 */
const { query, queryOne } = require('../config/db');
const clearanceService = require('./clearanceService');
const { getDeadline, daysUntil } = require('./settingsService');

const DAY_MS = 86400000;
const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

/**
 * Reminders for one student, most urgent first. Shared by the timeline endpoint
 * and the admin "send reminders" action so both say the same thing.
 */
function buildReminders(stages, deadline) {
  const reminders = [];
  const incomplete = stages.some((s) => s.status !== 'approved');
  const daysLeft = daysUntil(deadline);

  if (deadline && incomplete) {
    if (daysLeft < 0) {
      reminders.push({
        type: 'deadline',
        severity: 'danger',
        message: `The clearance deadline passed ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago. Finish your remaining stages as soon as possible.`,
      });
    } else if (daysLeft <= 14) {
      reminders.push({
        type: 'deadline',
        severity: daysLeft <= 3 ? 'danger' : 'warning',
        message:
          daysLeft === 0
            ? 'The clearance deadline is today.'
            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left until the clearance deadline.`,
      });
    }
  }

  for (const s of stages) {
    if (s.status === 'rejected') {
      reminders.push({
        type: 'rejected',
        severity: 'danger',
        stage_id: s.stage_id,
        message: `${s.stage_name} was rejected${s.remarks ? `: ${s.remarks}` : '.'} Fix the issue and resubmit.`,
      });
    }
  }

  for (const s of stages) {
    if (s.status === 'pending' && s.submitted_at) {
      const waited = Math.floor((Date.now() - new Date(s.submitted_at).getTime()) / DAY_MS);
      if (waited > s.estimated_duration_days) {
        reminders.push({
          type: 'slow_review',
          severity: 'info',
          stage_id: s.stage_id,
          message: `${s.stage_name} has been awaiting review for ${waited} day${waited === 1 ? '' : 's'} (expected ${s.estimated_duration_days}). Consider following up with the assigned clearance officer.`,
        });
      }
    }
  }

  for (const s of stages) {
    if (s.requires_payment && !s.payment_settled && s.status !== 'approved') {
      reminders.push({
        type: 'payment',
        severity: 'warning',
        stage_id: s.stage_id,
        message: `${s.stage_name} needs a ${naira(s.payment_amount)} payment before you can submit it.`,
      });
    }
  }

  return reminders;
}

/** The student's chronological history plus current reminders and deadline. */
async function getStudentTimeline(studentId) {
  const [stages, deadline, student, payments] = await Promise.all([
    clearanceService.getStudentClearanceStatus(studentId),
    getDeadline(),
    queryOne('SELECT created_at FROM users WHERE id = ?', [studentId]),
    query(
      `SELECT p.amount, p.paid_at, s.stage_name
         FROM payments p LEFT JOIN clearance_stages s ON s.id = p.stage_id
        WHERE p.student_id = ? AND p.status = 'success' AND p.paid_at IS NOT NULL`,
      [studentId]
    ),
  ]);

  const events = [];

  if (student?.created_at) {
    events.push({ type: 'registered', at: student.created_at, title: 'Account created' });
  }

  for (const s of stages) {
    if (s.submitted_at) {
      events.push({
        type: 'submitted',
        at: s.submitted_at,
        title: `Submitted ${s.stage_name}`,
        stage_id: s.stage_id,
      });
    }
    if (s.reviewed_at && (s.status === 'approved' || s.status === 'rejected')) {
      events.push({
        type: s.status,
        at: s.reviewed_at,
        title: `${s.stage_name} ${s.status}`,
        detail: [s.officer_name && `By ${s.officer_name}`, s.remarks].filter(Boolean).join(' - ') || null,
        stage_id: s.stage_id,
      });
    }
  }

  for (const p of payments) {
    events.push({
      type: 'payment',
      at: p.paid_at,
      title: `Paid ${naira(p.amount)}${p.stage_name ? ` for ${p.stage_name}` : ''}`,
    });
  }

  events.sort((a, b) => new Date(b.at) - new Date(a.at));

  const daysLeft = daysUntil(deadline);
  return {
    deadline: deadline ? { date: deadline, days_left: daysLeft, overdue: daysLeft < 0 } : null,
    reminders: buildReminders(stages, deadline),
    events: events.slice(0, 40),
  };
}

module.exports = { getStudentTimeline, buildReminders };

