/**
 * Inspects GET /api/student/documents/by-stage against a running server.
 *
 * Handy for eyeballing how the 10 stages map to their required documents and
 * which requirements are shared across stages.
 *
 *   node scripts/check-by-stage.js
 */
const http = require('http');

const PORT = process.env.PORT || 5000;

function req(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = http.request({ host: 'localhost', port: PORT, path, method, headers }, (res) => {
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
  if (!token) {
    console.log('LOGIN FAILED:', login.status, JSON.stringify(login.body).slice(0, 200));
    console.log('Is the server running on port ' + PORT + '?');
    return;
  }

  const res = await req('/api/student/documents/by-stage', 'GET', null, token);
  console.log('status:', res.status);

  const stages = res.body?.data?.stages || [];
  console.log('stages returned:', stages.length, '\n');

  stages.forEach((s) => {
    const reqs = s.required_documents || [];
    const shared = reqs.filter((r) => r.is_shared).length;
    console.log(
      `  ${String(s.stage_order).padStart(2)}. ${s.stage_name.padEnd(42)} ` +
        `reqs=${String(reqs.length).padStart(2)} uploaded=${s.uploaded_count} ` +
        `shared=${shared} status=${s.status} ready=${s.all_mandatory_uploaded}`
    );
  });

  const sample = stages.find((s) => (s.required_documents || []).length > 0);
  console.log('\nsample requirement shape:');
  console.log(JSON.stringify(sample?.required_documents?.[0], null, 2));
})();
