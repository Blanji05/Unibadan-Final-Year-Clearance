/**
 * Shows the exact fields the dashboard uses to decide whether to render the
 * "Pay ₦..." button for each stage.
 *
 *   node scripts/check-pay-button.js
 */
const http = require('http');

function req(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = http.request({ host: 'localhost', port: 5000, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') });
        } catch {
          resolve({ status: res.statusCode, body: { raw: raw.slice(0, 300) } });
        }
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  const login = await req('/api/auth/login', 'POST', {
    email: 'anjoola@student.ui.edu.ng',
    password: 'Password123!',
  });
  const token = login.body?.data?.token;
  if (!token) return console.log('LOGIN FAILED:', login.status, login.body);

  const res = await req('/api/student/clearance-status', 'GET', null, token);
  const stages = res.body?.data?.stages || [];

  console.log('\nstage                      requires_payment  amount  settled  -> shows button?');
  stages.forEach((s) => {
    const shows = s.requires_payment && !s.payment_settled && s.status !== 'approved';
    console.log(
      `  ${s.stage_name.padEnd(26)} ${String(s.requires_payment).padEnd(16)} ` +
        `${String(s.payment_amount).padEnd(7)} ${String(s.payment_settled).padEnd(8)} ${shows ? 'YES' : 'no'}`
    );
  });
  console.log('');
})();
