/**
 * Email transport.
 *
 * SMTP is configured through environment variables. When they are absent the
 * message is logged to the console instead, so the whole flow stays
 * demonstrable without a mail account — the same graceful fallback the SMS
 * channel uses with Termii.
 */
const nodemailer = require('nodemailer');
const { config } = require('../config/env');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
    });
  }
  return transporter;
}

/**
 * Send an email. Resolves to the delivery outcome and never throws — a mail
 * outage must not take the clearance workflow down with it.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) return { status: 'failed', error: 'no recipient address' };

  if (!config.mail.enabled) {
    console.log(`[email:simulated] -> ${to}: ${subject}`);
    return { status: 'sent' };
  }

  try {
    await getTransporter().sendMail({ from: config.mail.from, to, subject, text, html: html || text });
    return { status: 'sent' };
  } catch (error) {
    console.warn('[email] send failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

module.exports = { sendEmail };
