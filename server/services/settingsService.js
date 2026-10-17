/**
 * Small key/value store for admin-tunable settings.
 *
 * Today that is only the clearance deadline, kept as a YYYY-MM-DD string. A
 * missing or unparsable value means "no deadline set", never an error.
 */
const { query, queryOne } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');

const DEADLINE_KEY = 'clearance_deadline';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @returns {Promise<string|null>} the deadline as YYYY-MM-DD, or null. */
async function getDeadline() {
  const row = await queryOne('SELECT setting_value FROM settings WHERE setting_key = ?', [DEADLINE_KEY]);
  const value = row?.setting_value;
  return value && DATE_RE.test(value) ? value : null;
}

/** Set (or clear, with null/empty) the deadline. */
async function setDeadline(value) {
  if (!value) {
    await query('DELETE FROM settings WHERE setting_key = ?', [DEADLINE_KEY]);
    return null;
  }

  if (!DATE_RE.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new ApiError('Deadline must be a date in YYYY-MM-DD format.', 400);
  }

  await query(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [DEADLINE_KEY, value]
  );
  return value;
}

/**
 * Whole days from today until the deadline (negative once passed).
 * Compared as calendar dates so the time of day never tips the count.
 */
function daysUntil(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${deadline}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

module.exports = { getDeadline, setDeadline, daysUntil };

