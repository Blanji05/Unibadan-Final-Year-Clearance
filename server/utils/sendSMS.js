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

function buildEmailTemplate({ title, message, actionUrl, actionText }) {
  const portalUrl = actionUrl || 'https://unibadan-final-year-clearance.vercel.app';
  const btnText = actionText || 'Open Clearance Portal';

  const lowerTitle = (title || '').toLowerCase();
  let badgeColor = '#15803d'; // Green
  let badgeBg = '#dcfce7';
  let badgeLabel = 'CLEARANCE NOTIFICATION';

  if (lowerTitle.includes('reject') || lowerTitle.includes('failed')) {
    badgeColor = '#b91c1c'; // Red
    badgeBg = '#fee2e2';
    badgeLabel = 'ACTION REQUIRED';
  } else if (lowerTitle.includes('remind') || lowerTitle.includes('deadline')) {
    badgeColor = '#b45309'; // Amber
    badgeBg = '#fef3c7';
    badgeLabel = 'CLEARANCE REMINDER';
  } else if (lowerTitle.includes('approv') || lowerTitle.includes('ready') || lowerTitle.includes('success')) {
    badgeColor = '#15803d'; // Green
    badgeBg = '#dcfce7';
    badgeLabel = 'STAGE APPROVED';
  } else if (lowerTitle.includes('welcome') || lowerTitle.includes('password') || lowerTitle.includes('account')) {
    badgeColor = '#0369a1'; // Blue
    badgeBg = '#e0f2fe';
    badgeLabel = 'ACCOUNT UPDATE';
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc;">
      <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #15803d;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">University of Ibadan</h1>
          <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 13px;">Online Final Year Clearance System</p>
        </div>

        <!-- Content Area -->
        <div style="padding: 32px 24px;">
          
          <div style="margin-bottom: 20px;">
            <span style="background-color: ${badgeBg}; color: ${badgeColor}; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">
              ${badgeLabel}
            </span>
          </div>

          <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px 0; font-weight: 600;">
            ${title}
          </h2>

          <div style="background-color: #f8fafc; border-left: 4px solid ${badgeColor}; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 28px;">
            <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-line;">
              ${message}
            </p>
          </div>

          <div style="text-align: center; margin: 32px 0 20px 0;">
            <a href="${portalUrl}" target="_blank" style="background-color: #15803d; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(21, 128, 61, 0.2);">
              ${btnText}
            </a>
          </div>

          <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
            Direct portal link: <a href="${portalUrl}" style="color: #0284c7; text-decoration: underline;">${portalUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            This is an automated notification from the University of Ibadan Clearance Portal.<br>
            Please do not reply directly to this email.
          </p>
        </div>

      </div>
    </div>
  `;
}

/**
 * Notify a user on every channel they have an address for.
 *
 * The in-app row is written first so the notification is never lost, then SMS
 * and email go out as best-effort enhancements. `subject` gives the email a
 * proper subject line; the inbox keeps the short `title`.
 */
async function notifyUser({
  userId,
  phone,
  email,
  title,
  message,
  stageId = null,
  subject = null,
  html = null,
  actionUrl = null,
  actionText = null,
}) {
  await recordNotification(userId, 'in_app', 'sent', title, message, stageId);

  try {
    const { emitToUser } = require('../services/realtimeService');
    emitToUser(userId, 'notification:new', { title, message, stageId });
  } catch (err) {
    console.warn('[realtime] notif emit failed:', err.message);
  }

  if (phone) {
    const normalised = normalisePhone(phone);

    // 1. SMS Dispatch (Termii generic channel)
    let smsStatus = 'sent';
    if (config.termii.enabled) {
      try {
        await axios.post(
          TERMII_URL,
          {
            to: normalised,
            from: config.termii.senderId,
            sms: message,
            type: 'plain',
            channel: 'generic',
            api_key: config.termii.apiKey,
          },
          { timeout: 10000 }
        );
      } catch (error) {
        smsStatus = 'failed';
        console.warn('[sms] Termii SMS failed:', error.response?.data?.message || error.message);
      }
    } else {
      console.log(`[sms:simulated] -> ${phone}: ${message}`);
    }
    await recordNotification(userId, 'sms', smsStatus, title, message, stageId);

    // 2. WhatsApp Dispatch (Termii WhatsApp channel)
    let waStatus = 'sent';
    const waText = `*${title}*\n\n${message}\n\n*UI Online Clearance Portal:*\nhttps://unibadan-final-year-clearance.vercel.app`;
    if (config.termii.enabled) {
      try {
        await axios.post(
          TERMII_URL,
          {
            to: normalised,
            from: config.termii.senderId,
            sms: waText,
            type: 'plain',
            channel: 'whatsapp',
            api_key: config.termii.apiKey,
          },
          { timeout: 10000 }
        );
      } catch (error) {
        waStatus = 'failed';
        console.warn('[whatsapp] Termii WhatsApp failed:', error.response?.data?.message || error.message);
      }
    } else {
      console.log(`[whatsapp:simulated] -> ${phone}: ${message}`);
    }
    await recordNotification(userId, 'whatsapp', waStatus, title, message, stageId);
  }

  if (email) {
    const emailHtml = html || buildEmailTemplate({ title, message, actionUrl, actionText });
    const outcome = await sendEmail({ to: email, subject: subject || title, text: message, html: emailHtml });
    await recordNotification(userId, 'email', outcome.status, title, message, stageId);
  }
}

function buildWhatsAppUrl(phone, title, message) {
  const digits = normalisePhone(phone);
  if (!digits) return null;
  const text = `*${title}*\n\n${message}\n\nUI Clearance Portal: https://unibadan-final-year-clearance.vercel.app`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

module.exports = { notifyUser, normalisePhone, buildWhatsAppUrl };

