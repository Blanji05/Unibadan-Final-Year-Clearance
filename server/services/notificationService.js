/**
 * Reading notifications back.
 *
 * The in-app rows are the inbox; the sms/email rows in the same table are the
 * delivery audit trail and are only shown when explicitly asked for by channel.
 */
const { query } = require('../config/db');

const ALLOWED_CHANNELS = ['in_app', 'sms', 'email', 'whatsapp'];

/** Latest notifications for a user, with their unread count. */
async function listForUser(userId, channel = 'in_app') {
  // Interpolated only after whitelisting — it selects between the inbox and a
  // delivery-audit view, it is never free-form user input.
  const which = ALLOWED_CHANNELS.includes(channel) ? channel : 'in_app';

  const notifications = await query(
    `SELECT n.id, n.title, n.message, n.channel, n.delivery_status, n.stage_id, n.read_at, n.created_at,
            s.stage_name
       FROM notifications n
       LEFT JOIN clearance_stages s ON s.id = n.stage_id
      WHERE n.user_id = ? AND n.channel = ?
      ORDER BY n.created_at DESC
      LIMIT 50`,
    [userId, which]
  );

  const [counts] = await query(
    `SELECT COUNT(*) AS unread FROM notifications
      WHERE user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
    [userId]
  );

  return { notifications, unread: Number(counts.unread) };
}

/** Mark one in-app notification as read. Ownership is checked in the WHERE. */
async function markRead(userId, notificationId) {
  await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE id = ? AND user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
    [notificationId, userId]
  );
  return { message: 'Notification marked as read.' };
}

/** Mark every in-app notification as read. */
async function markAllRead(userId) {
  const result = await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
    [userId]
  );
  return { message: `Marked ${result.affectedRows} notification(s) as read.` };
}

module.exports = { listForUser, markRead, markAllRead };
