/**
 * Exercises the per-stage upload -> submit flow the student dashboard now uses.
 *   node scripts/check-upload-flow.js
 */
const http = require('http');

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

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
          resolve({ status: res.statusCode, body: { raw: raw.slice(0, 200) } });
        }
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    if (payload) r.write(payload);
    r.end();
  });
}

/** Minimal multipart/form-data upload of a tiny in-memory PDF. */
function uploadFile(documentTypeId, token, filename = 'test-doc.pdf') {
  return new Promise((resolve) => {
    const boundary = `----check${Date.now()}`;
    const fileBody = Buffer.from('%PDF-1.4\n% smoke-test document\n%%EOF\n');

    const parts = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="document_type_id"\r\n\r\n${documentTypeId}\r\n`
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: application/pdf\r\n\r\n`
      ),
      fileBody,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const r = http.request(
      {
        host: 'localhost',
        port: 5000,
        path: '/api/student/documents',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': parts.length,
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') });
          } catch {
            resolve({ status: res.statusCode, body: { raw: raw.slice(0, 200) } });
          }
        });
      }
    );
    r.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    r.write(parts);
    r.end();
  });
}

(async () => {
  const login = await req('/api/auth/login', 'POST', {
    email: 'anjoola@student.ui.edu.ng',
    password: 'Password123!',
  });
  const token = login.body?.data?.token;
  check('student login', !!token);
  if (!token) return report();

  // --- Stage 1 (Library): one mandatory document, no payment, no prerequisites ---
  let byStage = await req('/api/student/documents/by-stage', 'GET', null, token);
  const library = (byStage.body?.data?.stages || []).find((s) => s.code === 'library');
  const requirement = library?.required_documents?.[0];
  check('library requirement found', !!requirement, requirement?.label);
  if (!requirement) return report();

  // Submitting before uploading must fail on the missing mandatory document.
  const premature = await req(
    `/api/student/submit/${library.stage_id}`,
    'POST',
    { document_ids: [] },
    token
  );
  check('submit blocked while document missing', premature.status === 400, `status ${premature.status}`);

  // Upload against that specific requirement.
  const uploaded = await uploadFile(requirement.document_type_id, token);
  check('per-stage upload accepted', uploaded.status === 201, `status ${uploaded.status}`);
  const docId = uploaded.body?.data?.document?.id;
  check('upload returned a document id', !!docId);

  // The by-stage view should now show it under the library stage.
  byStage = await req('/api/student/documents/by-stage', 'GET', null, token);
  const libraryAfter = (byStage.body?.data?.stages || []).find((s) => s.code === 'library');
  const attachedNow = libraryAfter?.required_documents?.[0]?.documents || [];
  check('document appears under its stage', attachedNow.some((d) => d.id === docId));
  check('stage reports ready', libraryAfter?.all_mandatory_uploaded === true);
  check('uploaded_count incremented', libraryAfter?.uploaded_count === 1, `got ${libraryAfter?.uploaded_count}`);

  // Now submit with the uploaded document attached.
  const submit = await req(
    `/api/student/submit/${library.stage_id}`,
    'POST',
    { document_ids: attachedNow.map((d) => d.id) },
    token
  );
  check('submit succeeds once uploaded', submit.status === 200, `status ${submit.status}`);

  // Post-submission the document is locked and cannot be deleted.
  byStage = await req('/api/student/documents/by-stage', 'GET', null, token);
  const libraryLocked = (byStage.body?.data?.stages || []).find((s) => s.code === 'library');
  const lockedDoc = (libraryLocked?.required_documents?.[0]?.documents || []).find((d) => d.id === docId);
  check('document flagged locked after submit', lockedDoc?.is_locked === true);
  check('stage now pending', libraryLocked?.status === 'pending', libraryLocked?.status);

  const del = await req(`/api/student/documents/${docId}`, 'DELETE', null, token);
  check('locked document cannot be deleted', del.status === 409, `status ${del.status}`);

  // The officer should see the submission with the document attached.
  const officerLogin = await req('/api/auth/login', 'POST', {
    email: 'library@ui.edu.ng',
    password: 'Password123!',
  });
  const officerToken = officerLogin.body?.data?.token;
  const queue = await req('/api/officer/pending-requests', 'GET', null, officerToken);
  const mine = (queue.body?.data?.requests || []).find((r) => r.matric_number);
  check('officer sees the submission', !!mine, mine?.full_name);
  check('officer sees attached document', (mine?.documents || []).length > 0, `${mine?.documents?.length} docs`);

  report();
})();

function report() {
  console.log('\n=========== UPLOAD FLOW ===========');
  results.forEach((r) =>
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  );
  const failed = results.filter((r) => !r.ok).length;
  console.log('-----------------------------------');
  console.log(`  ${results.length - failed} passed, ${failed} failed`);
  console.log('===================================\n');
}
