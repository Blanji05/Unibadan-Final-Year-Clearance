/**
 * Verifies the flat /student/documents endpoint reports `is_locked` correctly.
 *
 * The documents page renders a Remove button from this flag, so if it were
 * missing the UI would offer to delete a file the API refuses to delete.
 *
 * Flow: upload -> expect is_locked false -> submit it to a stage ->
 * expect is_locked true -> confirm delete is actually refused -> clean up.
 */
const http = require('http');

const HOST = 'localhost';
const PORT = 5000;

function request(method, path, { token, json, multipart } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let body;
    if (json) {
      body = Buffer.from(JSON.stringify(json));
      headers['Content-Type'] = 'application/json';
    } else if (multipart) {
      const boundary = '----check' + Date.now();
      const parts = [];
      for (const [name, value] of Object.entries(multipart.fields || {})) {
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
          )
        );
      }
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${multipart.filename}"\r\n` +
            `Content-Type: ${multipart.contentType}\r\n\r\n`
        ),
        multipart.content,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      );
      body = Buffer.concat(parts);
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    }

    if (body) headers['Content-Length'] = body.length;

    const req = http.request({ host: HOST, port: PORT, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// A tiny but structurally valid PDF, so the upload passes MIME validation.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n'
);

const results = [];
const check = (label, ok, note = '') =>
  results.push({ ok, text: `${label}${note ? ` — ${note}` : ''}` });

(async () => {
  const login = await request('POST', '/api/auth/login', {
    json: { email: 'anjoola@student.ui.edu.ng', password: 'Password123!' },
  });
  const token = login.body?.data?.token;
  if (!token) throw new Error('could not log in as the seeded student');

  // Library (stage 1) has no prerequisites and needs no payment.
  const byStage = await request('GET', '/api/student/documents/by-stage', { token });
  const library = byStage.body.data.stages.find((s) => s.code === 'library');
  const requirement = library.required_documents[0];

  const uploaded = await request('POST', '/api/student/documents', {
    token,
    multipart: {
      fields: { document_type_id: String(requirement.document_type_id) },
      filename: 'is-locked-check.pdf',
      contentType: 'application/pdf',
      content: PDF,
    },
  });
  const docId = uploaded.body?.data?.document?.id;
  check('upload accepted', uploaded.status === 201 && !!docId, `status ${uploaded.status}`);
  if (!docId) throw new Error('upload failed: ' + JSON.stringify(uploaded.body));

  const before = await request('GET', '/api/student/documents', { token });
  const rowBefore = before.body.data.documents.find((d) => d.id === docId);
  check('field present on flat list', rowBefore && 'is_locked' in rowBefore);
  check('unsubmitted file is unlocked', rowBefore?.is_locked === false, `is_locked=${rowBefore?.is_locked}`);

  const submitted = await request('POST', `/api/student/submit/${library.stage_id}`, {
    token,
    json: { document_ids: [docId], remarks: 'is_locked verification' },
  });
  check('submitted to library stage', submitted.status === 200 || submitted.status === 201, `status ${submitted.status}`);

  const after = await request('GET', '/api/student/documents', { token });
  const rowAfter = after.body.data.documents.find((d) => d.id === docId);
  check('submitted file becomes locked', rowAfter?.is_locked === true, `is_locked=${rowAfter?.is_locked}`);

  // The flag must mirror what the API will actually allow.
  const refused = await request('DELETE', `/api/student/documents/${docId}`, { token });
  check('delete refused while locked', refused.status === 409, `status ${refused.status}`);

  console.log('\n============ is_locked CHECK ============');
  results.forEach((r) => console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.text}`));
  const failed = results.filter((r) => !r.ok).length;
  console.log('----------------------------------------');
  console.log(`  ${results.length - failed} passed, ${failed} failed`);
  console.log('========================================');
  console.log('\nNote: run scripts/cleanup-test-data.js to clear this test submission.');

  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('check failed:', err.message);
  process.exit(1);
});
