/**
 * Paystack Payment Integration with Local Fallback.
 *
 * When Paystack is configured (PAYSTACK_SECRET_KEY in server/.env), real
 * payments are initialized using Paystack's Transaction Initialize API.
 * The student is redirected to Paystack's official hosted checkout to pay
 * via debit/credit card, bank transfer, USSD, or mobile money.
 *
 * Upon payment completion, Paystack redirects back to the frontend callback URL
 * and notifies the server via webhook. The transaction is verified against
 * Paystack's verify API before the clearance stage is unlocked.
 */
const axios = require('axios');
const crypto = require('crypto');
const { query, queryOne } = require('../config/db');
const { config } = require('../config/env');
const { ApiError } = require('../utils/apiResponse');
const { notifyUser } = require('../utils/sendSMS');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Tell the student their fee has settled (or failed).
 */
async function notifyPayment(studentId, stageId, outcome, reference) {
  const [student, stage] = await Promise.all([
    queryOne('SELECT id, email, phone_number FROM users WHERE id = ?', [studentId]),
    queryOne('SELECT stage_name, payment_amount FROM clearance_stages WHERE id = ?', [stageId]),
  ]);
  if (!student || !stage) return;

  const amount = `₦${Number(stage.payment_amount).toLocaleString('en-NG')}`;
  const settled = outcome === 'success';

  await notifyUser({
    userId: student.id,
    phone: student.phone_number,
    email: student.email,
    title: settled ? `Payment Confirmed: ${stage.stage_name}` : `Payment Failed: ${stage.stage_name}`,
    message: settled
      ? `We have confirmed your payment of ${amount} for ${stage.stage_name} (Reference: ${reference}).\n\nThis stage is now unlocked, and you can proceed to upload your required clearance documents and submit for officer review.`
      : `Your payment of ${amount} for ${stage.stage_name} (Reference: ${reference}) was not completed successfully. If your account was debited, please contact the University Bursary with your reference number.`,
    stageId,
    subject: `UI Clearance: Payment ${settled ? 'Confirmed' : 'Failed'} (${stage.stage_name})`,
    actionUrl: settled
      ? `https://unibadan-final-year-clearance.vercel.app/student/stages/${stageId}`
      : 'https://unibadan-final-year-clearance.vercel.app/student',
    actionText: settled ? 'Upload Clearance Documents' : 'Return to Portal',
  });
}

/**
 * Initiate a payment for a clearance stage using Paystack.
 */
async function initiatePayment(studentId, stageId, origin = null) {
  const stage = await queryOne(
    'SELECT id, stage_name, requires_payment, payment_amount FROM clearance_stages WHERE id = ?',
    [stageId]
  );
  if (!stage) throw new ApiError('Stage not found.', 404);
  if (!stage.requires_payment) throw new ApiError('This stage does not require payment.', 400);

  // Check for existing successful payment
  const existing = await queryOne(
    "SELECT id, reference FROM payments WHERE student_id = ? AND stage_id = ? AND status = 'success'",
    [studentId, stageId]
  );
  if (existing) {
    throw new ApiError('You have already paid for this stage.', 400);
  }

  // Clear any abandoned pending checkout attempts
  await query("DELETE FROM payments WHERE student_id = ? AND stage_id = ? AND status = 'pending'", [
    studentId,
    stageId,
  ]);

  const user = await queryOne('SELECT email, full_name, phone_number FROM users WHERE id = ?', [studentId]);
  const reference = `UI-PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const amountInKobo = Math.round(Number(stage.payment_amount) * 100);

  // Derive dynamic client URL for Paystack redirect
  let frontendUrl = null;
  if (origin) {
    try {
      const parsed = new URL(origin);
      frontendUrl = `${parsed.protocol}//${parsed.host}`;
    } catch (_) {}
  }
  if (!frontendUrl) {
    frontendUrl = (config.clientOrigin && !config.clientOrigin.includes('localhost'))
      ? config.clientOrigin
      : 'https://unibadan-final-year-clearance.vercel.app';
  }
  const callbackUrl = `${frontendUrl}/payment/callback`;

  // If Paystack Secret Key is configured, initialize with Paystack API
  if (config.paystack.enabled) {
    try {
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: amountInKobo,
          reference,
          callback_url: callbackUrl,
          metadata: {
            student_id: studentId,
            student_name: user.full_name,
            stage_id: stageId,
            stage_name: stage.stage_name,
            custom_fields: [
              { display_name: 'Student Name', variable_name: 'student_name', value: user.full_name },
              { display_name: 'Clearance Stage', variable_name: 'stage_name', value: stage.stage_name },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const paystackData = response.data?.data;
      if (!paystackData?.authorization_url) {
        throw new Error('Paystack did not return an authorization URL.');
      }

      await query(
        `INSERT INTO payments (student_id, stage_id, amount, reference, rrr, status, gateway, authorization_url, paid_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 'paystack', ?, NULL)`,
        [studentId, stageId, stage.payment_amount, reference, paystackData.reference || reference, paystackData.authorization_url]
      );

      return {
        reference,
        amount: stage.payment_amount,
        authorization_url: paystackData.authorization_url,
        access_code: paystackData.access_code,
        checkout: {
          url: paystackData.authorization_url,
          method: 'GET',
        },
        simulated: false,
      };
    } catch (err) {
      console.error('[paystack:initiate] failed:', err.response?.data || err.message);
      const detail = err.response?.data?.message || err.message;
      throw new ApiError(`Paystack payment failed: ${detail}`, 400);
    }
  }

  // Fallback if no paystack key configured
  await query(
    `INSERT INTO payments (student_id, stage_id, amount, reference, rrr, status, gateway, authorization_url, paid_at)
     VALUES (?, ?, ?, ?, ?, 'success', 'paystack_demo', NULL, NOW())`,
    [studentId, stageId, stage.payment_amount, reference, reference]
  );
  await notifyPayment(studentId, stageId, 'success', reference);

  try {
    const { emitToUser, emitToRole } = require('./realtimeService');
    emitToUser(studentId, 'payment:update', { stageId, status: 'success' });
    emitToUser(studentId, 'clearance:update', { stageId });
    emitToRole('admin', 'payment:update', { stageId });
  } catch (_) {}

  return {
    reference,
    amount: stage.payment_amount,
    checkout: null,
    simulated: true,
    message: `Payment of ₦${Number(stage.payment_amount).toLocaleString('en-NG')} confirmed via Paystack Demo.`,
  };
}

/**
 * Verify a Paystack payment by reference.
 */
async function verifyPayment(reference) {
  const payment = await queryOne(
    `SELECT id, student_id, stage_id, amount, reference, rrr, status
       FROM payments WHERE reference = ? OR rrr = ?`,
    [reference, reference]
  );
  if (!payment) throw new ApiError('Payment record not found.', 404);
  if (payment.status === 'success') return { message: 'Payment already verified.', status: 'success' };

  if (config.paystack.enabled) {
    try {
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(payment.reference)}`,
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`,
          },
          timeout: 15000,
        }
      );

      const data = response.data?.data;
      if (data?.status === 'success') {
        const expectedKobo = Math.round(Number(payment.amount) * 100);
        if (data.amount < expectedKobo) {
          throw new ApiError('Paid amount is less than the required clearance fee. Contact Bursary.', 402);
        }

        await query("UPDATE payments SET status = 'success', paid_at = NOW() WHERE id = ?", [payment.id]);
        await notifyPayment(payment.student_id, payment.stage_id, 'success', payment.reference);

        try {
          const { emitToUser, emitToRole } = require('./realtimeService');
          emitToUser(payment.student_id, 'payment:update', { stageId: payment.stage_id, status: 'success' });
          emitToUser(payment.student_id, 'clearance:update', { stageId: payment.stage_id });
          emitToRole('admin', 'payment:update', { stageId: payment.stage_id });
        } catch (err) {
          console.warn('[realtime] payment emit failed:', err.message);
        }

        return { message: 'Payment verified successfully via Paystack.', status: 'success' };
      } else if (data?.status === 'abandoned' || data?.status === 'failed') {
        await query("UPDATE payments SET status = 'failed' WHERE id = ?", [payment.id]);
        await notifyPayment(payment.student_id, payment.stage_id, 'failed', payment.reference);
        throw new ApiError(data.gateway_response || 'Payment was not completed.', 402);
      } else {
        throw new ApiError('Payment is still pending on Paystack. Please complete payment.', 402);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error('[paystack:verify] failed:', err.response?.data || err.message);
      throw new ApiError('Could not verify Paystack payment: ' + (err.response?.data?.message || err.message), 503);
    }
  }

  // Simulated fallback
  await query("UPDATE payments SET status = 'success', paid_at = NOW() WHERE id = ?", [payment.id]);
  await notifyPayment(payment.student_id, payment.stage_id, 'success', payment.reference);
  return { message: 'Payment verified successfully.', status: 'success' };
}

/**
 * Handle Paystack webhook notification.
 */
async function handleWebhook(body, signatureHeader) {
  if (config.paystack.enabled && signatureHeader) {
    const hash = crypto
      .createHmac('sha512', config.paystack.secretKey)
      .update(typeof body === 'string' ? body : JSON.stringify(body))
      .digest('hex');

    if (hash !== signatureHeader) {
      throw new ApiError('Invalid Paystack webhook signature.', 401);
    }
  }

  const event = typeof body === 'string' ? JSON.parse(body) : body;
  if (event?.event === 'charge.success') {
    const reference = event.data?.reference;
    if (reference) {
      try {
        await verifyPayment(reference);
        return { message: 'Paystack charge processed successfully.' };
      } catch (err) {
        console.warn('[paystack:webhook] verify error:', err.message);
      }
    }
  }

  return { message: 'Event received.' };
}

/**
 * Get all payments for a student.
 */
async function getStudentPayments(studentId) {
  return await query(
    `SELECT p.id, p.stage_id, s.stage_name, p.amount, p.reference, p.rrr, p.status, p.gateway, p.paid_at, p.created_at
       FROM payments p
       LEFT JOIN clearance_stages s ON p.stage_id = s.id
      WHERE p.student_id = ?
      ORDER BY p.created_at DESC`,
    [studentId]
  );
}

/**
 * Everything needed to render a receipt. Scoped to the owning student.
 */
async function getReceipt(studentId, paymentId) {
  const payment = await queryOne(
    `SELECT p.id, p.amount, p.reference, p.rrr, p.status, p.gateway, p.paid_at, p.created_at,
            s.stage_name
       FROM payments p
       LEFT JOIN clearance_stages s ON p.stage_id = s.id
      WHERE p.id = ? AND p.student_id = ?`,
    [paymentId, studentId]
  );
  if (!payment) throw new ApiError('Payment not found.', 404);
  if (payment.status !== 'success') {
    throw new ApiError('A receipt is only available for successful payments.', 400);
  }

  const student = await queryOne('SELECT full_name, matric_number FROM users WHERE id = ?', [studentId]);
  return { student, payment };
}

module.exports = { initiatePayment, verifyPayment, handleWebhook, getStudentPayments, getReceipt };
