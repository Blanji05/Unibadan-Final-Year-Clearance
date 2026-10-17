/**
 * End-to-end smoke test against a running server.
 * Walks the student -> officer -> admin flow and prints a pass/fail report.
 *
 *   node scripts/e2e-check.js
 */
const http = require('http');

const PASS = [];
const FAIL = [];

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
        let parsed = {};
        try {
          parsed = JSON.parse(raw || '{}');
        } catch {
          parsed = { parseError: raw.slice(0, 200) };
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    if (payload) r.write(payload);
    r.end();
  });
}

function check(name, condition, detail = '') {
  (condition ? PASS : FAIL).push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const login = async (email) => {
  const res = await req('/api/auth/login', 'POST', { email, password: 'Password123!' });
  return res.body?.data?.token || null;
};

(async () => {
  // --- Health ---
  const health = await req('/api/health');
  check('health endpoint', health.status === 200, `status ${health.status}`);
  if (health.status !== 200) return report();

  // --- Auth for all three roles ---
  const studentToken = await login('anjoola@student.ui.edu.ng');
  const officerToken = await login('library@ui.edu.ng');
  const adminToken = await login('admin@ui.edu.ng');
  check('student login', !!studentToken);
  check('officer login', !!officerToken);
  check('admin login', !!adminToken);
  if (!studentToken || !officerToken || !adminToken) return report();

  // --- Student: clearance status shape ---
  const status = await req('/api/student/clearance-status', 'GET', null, studentToken);
  const stages = status.body?.data?.stages || [];
  check('student sees 10 stages', stages.length === 10, `got ${stages.length}`);

  const library = stages.find((s) => s.code === 'library');
  const alumni = stages.find((s) => s.code === 'alumni');
  const sports = stages.find((s) => s.code === 'sports');

  check('new fields exposed', library && 'payment_settled' in library && 'prerequisites_met' in library);
  check('stage 1 has no prerequisites', library?.prerequisites?.length === 0);
  check('alumni requires payment', alumni?.requires_payment === true && alumni?.payment_settled === false);
  check(
    'sports is gated behind prerequisites',
    sports?.prerequisites?.length > 0 && sports?.can_submit === false,
    `${sports?.prerequisites?.length} prereqs`
  );

  // --- Prerequisite enforcement (the core research contribution) ---
  const jumpAhead = await req(`/api/student/submit/${sports?.stage_id}`, 'POST', { document_ids: [] }, studentToken);
  check('out-of-order submission blocked', jumpAhead.status === 403, `status ${jumpAhead.status}`);

  // --- Payment gating ---
  const payGated = await req(`/api/student/submit/${alumni?.stage_id}`, 'POST', { document_ids: [] }, studentToken);
  check('unpaid stage blocked', payGated.status === 402, `status ${payGated.status}`);

  // --- Missing mandatory documents rejected ---
  const noDocs = await req(`/api/student/submit/${library?.stage_id}`, 'POST', { document_ids: [] }, studentToken);
  check('submission without documents rejected', noDocs.status === 400, `status ${noDocs.status}`);

  // --- Document vault ---
  const types = await req('/api/student/document-types', 'GET', null, studentToken);
  check('document types available', (types.body?.data?.document_types || []).length > 0);

  // --- Payment initiation for the alumni stage ---
  const pay = await req(`/api/student/pay/${alumni?.stage_id}`, 'POST', null, studentToken);
  check('payment initiates', pay.status === 200 || pay.status === 201, `status ${pay.status}`);

  // --- Officer scoping ---
  const queue = await req('/api/officer/pending-requests', 'GET', null, officerToken);
  check('officer sees own section only', queue.body?.data?.stage?.code === 'library', queue.body?.data?.stage?.code);

  const officerAsAdmin = await req('/api/admin/students', 'GET', null, officerToken);
  check('officer blocked from admin routes', officerAsAdmin.status === 403, `status ${officerAsAdmin.status}`);

  // --- Admin ---
  const analytics = await req('/api/admin/analytics', 'GET', null, adminToken);
  check('admin analytics', !!analytics.body?.data?.totals);
  const users = await req('/api/admin/users', 'GET', null, adminToken);
  check('admin user list', (users.body?.data?.users || []).length > 0);
  const adminStages = await req('/api/admin/stages', 'GET', null, adminToken);
  check('admin stage config', (adminStages.body?.data?.stages || []).length === 10);

  // --- Certificate gating ---
  const cert = await req('/api/student/certificate', 'GET', null, studentToken);
  check('certificate withheld until cleared', !cert.body?.data?.certificate);

  // --- Unauthenticated access ---
  const noAuth = await req('/api/student/clearance-status');
  check('unauthenticated request rejected', noAuth.status === 401, `status ${noAuth.status}`);

  report();
})();

function report() {
  console.log('\n================ E2E RESULTS ================');
  PASS.forEach((p) => console.log(`  PASS  ${p}`));
  FAIL.forEach((f) => console.log(`  FAIL  ${f}`));
  console.log('---------------------------------------------');
  console.log(`  ${PASS.length} passed, ${FAIL.length} failed`);
  console.log('=============================================\n');
  process.exit(FAIL.length ? 1 : 0);
}
