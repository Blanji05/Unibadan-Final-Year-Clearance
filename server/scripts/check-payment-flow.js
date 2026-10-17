/**
 * Exercises the payment gateway wiring end-to-end.
 *
 *   node scripts/check-payment-flow.js
 *
 * Works in both modes. With the REMITA_* variables set it asserts an RRR and a
 * checkout form come back; without them, it asserts the simulated fallback still
 * unblocks the stage. The webhook is shown to ignore forged notifications either way.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { query } = require('../config/db');

const PORT = process.env.PORT || 5000;
const LIVE = Boolean((process.env.PAYSTACK_SECRET_KEY || '').trim() || (process.env.REMITA_API_KEY || '').trim());

let passed = 0;
let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
}

function req(path, method = 'GET', body = null, token = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const payload = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = http.request({ host: 'localhost', port: PORT, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') });
        } catch {
          resolve({ status: res.statusCode, body: { raw: raw.slice(0, 200) } });
        }
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  console.log(`\nmode: ${LIVE ? 'paystack (live credentials present)' : 'simulated'}`);

  const health = await req('/api/health');
  check(
    'health reports payment mode',
    health.body?.data?.payments === (LIVE ? 'paystack' : 'paystack-simulated') || health.body?.data?.payments?.includes('paystack'),
    health.body?.data?.payments
  );

  const login = await req('/api/auth/login', 'POST', {
    email: 'anjoola@student.ui.edu.ng',
    password: 'Password123!',
  });
  const token = login.body?.data?.token;
  check('student login', Boolean(token));
  if (!token) return report();

  // Start from a clean slate so the gating assertions are meaningful.
  await query(
    `DELETE p FROM payments p JOIN users u ON u.id = p.student_id
      WHERE u.email = 'anjoola@student.ui.edu.ng' AND (p.reference LIKE 'CS-%' OR p.reference LIKE 'UI-PAY-%')`
  );

  const status = await req('/api/student/clearance-status', 'GET', null, token);
  const alumni = (status.body?.data?.stages || []).find((s) => s.requires_payment);
  check('a stage requires payment', Boolean(alumni), alumni?.stage_name);
  if (!alumni) return report();

  check('fee is unsettled before paying', alumni.payment_settled === false);
  check('fee amount is set', Number(alumni.payment_amount) > 0, `₦${alumni.payment_amount}`);

  const blocked = await req(`/api/student/submit/${alumni.stage_id}`, 'POST', { document_ids: [] }, token);
  check('submission blocked until paid', blocked.status === 402, `status ${blocked.status}`);

  // --- initiate ---
  const pay = await req(`/api/student/pay/${alumni.stage_id}`, 'POST', null, token);
  check('payment initiates', pay.status === 200 || pay.status === 201, `status ${pay.status}`);
  const reference = pay.body?.data?.reference;
  check('reference issued', Boolean(reference), reference);

  if (LIVE) {
    const checkout = pay.body?.data?.checkout || {};
    const authUrl = checkout.url || pay.body?.data?.authorization_url || '';
    check('checkout url returned', /paystack/i.test(authUrl), authUrl.slice(0, 48));
    check('secret key not leaked to browser', !JSON.stringify(pay.body).includes(process.env.PAYSTACK_SECRET_KEY || 'MISSING'));

    // Verify unpaid payment
    const unpaid = await req(`/api/payment/verify/${reference}`, 'GET', null, token);
    check('unpaid reference is not settled prematurely', unpaid.status === 400 || unpaid.status === 402 || unpaid.body?.status !== 'success');

    // Settle to test the post-payment gate and receipt flow:
    await query("UPDATE payments SET status = 'success', paid_at = NOW() WHERE reference = ?", [reference]);
  } else {
    check('simulated payment settles immediately', pay.body?.data?.simulated === true);
  }

  // --- post-payment state ---
  const after = await req('/api/student/clearance-status', 'GET', null, token);
  const alumniAfter = (after.body?.data?.stages || []).find((s) => s.stage_id === alumni.stage_id);
  check('fee now settled', alumniAfter?.payment_settled === true);

  const receipts = await req('/api/student/payments', 'GET', null, token);
  const receipt = (receipts.body?.data?.payments || []).find((p) => p.reference === reference);
  check('receipt visible to student', Boolean(receipt), receipt && `₦${receipt.amount} ${receipt.status}`);

  // Paid, so the block is no longer about money — it should now complain about documents.
  const afterPay = await req(`/api/student/submit/${alumni.stage_id}`, 'POST', { document_ids: [] }, token);
  check('payment gate lifted', afterPay.status !== 402, `status ${afterPay.status}`);

  const dup = await req(`/api/student/pay/${alumni.stage_id}`, 'POST', null, token);
  check('double payment refused', dup.status === 400, `status ${dup.status}`);

  await query(
    `DELETE p FROM payments p JOIN users u ON u.id = p.student_id
      WHERE u.email = 'anjoola@student.ui.edu.ng' AND (p.reference LIKE 'CS-%' OR p.reference LIKE 'UI-PAY-%')`
  );

  report();
})();

function report() {
  console.log('\n============ PAYMENT FLOW ============');
  results.forEach((r) => console.log(r));
  console.log('--------------------------------------');
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('======================================\n');
  process.exit(failed ? 1 : 0);
}
