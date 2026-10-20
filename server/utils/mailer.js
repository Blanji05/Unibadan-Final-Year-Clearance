/**
 * Email transport.
 *
 * Supports:
 * 1. Brevo HTTP REST API (port 443 HTTPS - works 100% on Render without firewall blocks)
 * 2. Resend HTTP REST API (port 443 HTTPS)
 * 3. Standard SMTP via Nodemailer (e.g. custom host/port or Gmail)
 *
 * When no credentials are present, messages are logged to console.
 */
const axios = require('axios');
const nodemailer = require('nodemailer');
const { config } = require('../config/env');

function getTransporter(portOverride = null) {
  const isBrevo = config.mail.host?.includes('brevo') || config.mail.host?.includes('sendinblue');
  // Brevo port 2525 bypasses Render free-tier firewall blocks on port 587
  const port = portOverride || (isBrevo && (!config.mail.port || config.mail.port === 587) ? 2525 : (config.mail.port || 587));

  const transportConfig = config.mail.service
    ? {
        service: config.mail.service,
        auth: { user: config.mail.user, pass: config.mail.pass },
      }
    : {
        host: config.mail.host,
        port,
        secure: port === 465,
        auth: { user: config.mail.user, pass: config.mail.pass },
      };
  transportConfig.connectionTimeout = 12000;
  transportConfig.greetingTimeout = 12000;
  transportConfig.socketTimeout = 15000;
  return nodemailer.createTransport(transportConfig);
}

/**
 * Send email via Brevo's HTTPS API (Port 443).
 * Render's free tier never blocks port 443!
 */
async function sendViaBrevo({ apiKey, to, subject, text, html }) {
  const senderMatch = config.mail.from?.match(/<([^>]+)>/);
  const senderEmail = senderMatch ? senderMatch[1] : (config.mail.user || 'no-reply@clearance.ui.edu.ng');
  const senderName = 'University of Ibadan Clearance';

  const res = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html || text,
      textContent: text,
    },
    {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 12000,
    }
  );
  return { status: 'sent', messageId: res.data?.messageId || 'ok' };
}

/**
 * Send email via Resend's HTTPS API (Port 443).
 */
async function sendViaResend({ apiKey, to, subject, text, html }) {
  const from = config.mail.from || 'UI Clearance <onboarding@resend.dev>';
  const res = await axios.post(
    'https://api.resend.com/emails',
    {
      from,
      to: [to],
      subject,
      html: html || text,
      text,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    }
  );
  return { status: 'sent', messageId: res.data?.id || 'ok' };
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

  // 1. Brevo REST API (HTTPS port 443)
  const brevoKey =
    config.mail.brevoApiKey ||
    (config.mail.pass?.startsWith('xkeysib-') ? config.mail.pass : null) ||
    ((config.mail.host?.includes('brevo') || config.mail.host?.includes('sendinblue')) ? config.mail.pass : null);

  if (brevoKey) {
    try {
      const outcome = await sendViaBrevo({ apiKey: brevoKey, to, subject, text, html });
      console.log(`[email:sent] -> ${to} via Brevo HTTPS (msgId: ${outcome.messageId})`);
      return outcome;
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      console.warn('[email] Brevo HTTPS send failed:', errMsg);
      // Fall through to standard SMTP if SMTP host was also provided
      if (!config.mail.host) {
        return { status: 'failed', error: errMsg };
      }
    }
  }

  // 2. Resend REST API (HTTPS port 443)
  if (config.mail.resendApiKey) {
    try {
      const outcome = await sendViaResend({ apiKey: config.mail.resendApiKey, to, subject, text, html });
      console.log(`[email:sent] -> ${to} via Resend HTTPS (msgId: ${outcome.messageId})`);
      return outcome;
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      console.warn('[email] Resend HTTPS send failed:', errMsg);
      if (!config.mail.host) {
        return { status: 'failed', error: errMsg };
      }
    }
  }

  // 3. SMTP Transport (nodemailer)
  try {
    const info = await getTransporter().sendMail({
      from: config.mail.from,
      to,
      subject,
      text,
      html: html || text,
    });
    console.log(`[email:sent] -> ${to} via SMTP (msgId: ${info?.messageId || 'ok'})`);
    return { status: 'sent', messageId: info?.messageId };
  } catch (error) {
    // If failed on port 587 and host is Brevo, auto-retry on Brevo port 2525
    if (config.mail.host?.includes('brevo') && config.mail.port !== 2525) {
      try {
        console.log('[email] Retrying Brevo SMTP on alternative unblocked port 2525...');
        const retryTransporter = getTransporter(2525);
        const retryInfo = await retryTransporter.sendMail({
          from: config.mail.from,
          to,
          subject,
          text,
          html: html || text,
        });
        console.log(`[email:sent] -> ${to} via Brevo SMTP port 2525 (msgId: ${retryInfo?.messageId || 'ok'})`);
        return { status: 'sent', messageId: retryInfo?.messageId };
      } catch (retryErr) {
        console.warn('[email] Brevo port 2525 retry failed:', retryErr.message);
      }
    }

    const isTimeout = error.message?.includes('timeout') || error.code === 'ETIMEDOUT';
    if (isTimeout) {
      console.warn(
        `[email] SMTP send failed: ${error.message}. Note: Render free tier blocks outbound SMTP ports 25, 465, and 587. For guaranteed delivery on Render, use port 2525 for Brevo.`
      );
    } else {
      console.warn('[email] SMTP send failed:', error.message);
    }
    return { status: 'failed', error: error.message };
  }
}

module.exports = { sendEmail };
