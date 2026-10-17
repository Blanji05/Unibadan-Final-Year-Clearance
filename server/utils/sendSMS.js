/**
 * Notifications — in-app, SMS and email.
 *
 * Every notification is recorded in the `notifications` table once per channel
 * it actually touches: the in-app row is what the dashboard bell reads, while
 * the sms/email rows are the delivery audit trail. Dispatch failures are logged
 * and never block the clearance workflow itself.
 */
const axios = require('axios');
const { config } = require('../config/env');
const { query } = require('../config/db');
const { sendEmail } = require('./mailer');

const TERMII_URL = 'https://api.ng.termii.com/api/sms/send';

/** Normalise a Nigerian number to international format for Termii. */
function normalisePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

async function recordNotification(userId, channel, deliveryStatus, title, message, stageId) {
  try {
    await query(
      `INSERT INTO notifications (user_id, title, message, channel, delivery_status, stage_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, title, message, channel, deliveryStatus, stageId]
    );
  } catch (error) {
    console.error('[notify] could not record notification:', error.message);
  }
}

/**
 * Notify a user on every channel they have an address for.
 *
 * The in-app row is written first so the notification is never lost, then SMS
 * and email go out as best-effort enhancements. `subject` gives the email a
 * proper subject line; the inbox keeps the short `title`.
 */
async function notifyUser({ userId, phone, email, title, message, stageId = null, subject = null }) {
  await recordNotification(userId, 'in_app', 'sent', title, message, stageId);

  try {
    const { emitToUser } = require('../services/realtimeService');
    emitToUser(userId, 'notification:new', { title, message, stageId });
  } catch (err) {
    console.warn('[realtime] notif emit failed:', err.message);
  }

  if (phone) {
    let deliveryStatus = 'sent';

    if (config.termii.enabled) {
      try {
        await axios.post(
          TERMII_URL,
          {
            to: normalisePhone(phone),
            from: config.termii.senderId,
            sms: message,
            type: 'plain',
            channel: 'generic',
            api_key: config.termii.apiKey,
          },
          { timeout: 10000 }
        );
      } catch (error) {
        deliveryStatus = 'failed';
        console.warn('[sms] Termii send failed:', error.response?.data?.message || error.message);
      }
    } else {
      // Simulated mode - visible in the server log so the flow is demonstrable.
      console.log(`[sms:simulated] -> ${phone}: ${message}`);
    }

    await recordNotification(userId, 'sms', deliveryStatus, title, message, stageId);
  }

  if (email) {
    const outcome = await sendEmail({ to: email, subject: subject || title, text: message });
    await recordNotification(userId, 'email', outcome.status, title, message, stageId);
  }
}

module.exports = { notifyUser, normalisePhone };
