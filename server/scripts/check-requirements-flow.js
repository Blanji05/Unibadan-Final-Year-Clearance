/**
 * Verifies the officer-managed document requirement flow end to end.
 *
 * The premise being tested: a section officer decides what their own section
 * asks for, and that decision immediately changes what the student is required
 * to upload and what blocks their submission.
 *
 * Run against a running server:  node scripts/check-requirements-flow.js
 */
require('dotenv').config();

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;

// Every seeded account shares one password (see scripts/seed.js).
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, ...json };
}

async function login(email, password) {
  const res = await call('POST', '/auth/login', { body: { email, password } });
  if (!res.data?.token) throw new Error(`Login failed for ${email}: ${res.message}`);
  return res.data.token;
}

(async () => {
  console.log('\nOfficer-managed document requirements\n');

  // Library officer + a seeded student. Both come from scripts/seed.js.
  const officerToken = await login('library@ui.edu.ng', SEED_PASSWORD);
  const studentToken = await login('anjoola@student.ui.edu.ng', SEED_PASSWORD);

  // --- Officer reads their own section's checklist ---
  console.log('Officer checklist');
  const initial = await call('GET', '/officer/requirements', { token: officerToken });
  check('officer can read requirements', initial.ok, initial.message);
  check('response names the officer stage', Boolean(initial.data?.stage?.stage_name));
  check('every document type is listed', Array.isArray(initial.data?.requirements));

  const all = initial.data.requirements;
  const alreadyRequired = all.filter((r) => r.is_required);
  const spare = all.find((r) => !r.is_required);
  check('at least one document type is available to add', Boolean(spare));

  const stageId = initial.data.stage.id;

  // --- Adding a requirement ---
  console.log('\nAdding a requirement');
  const added = await call('POST', '/officer/requirements', {
    token: officerToken,
    body: { document_type_id: spare.document_type_id, is_mandatory: true },
  });
  check('officer can add a requirement', added.ok, added.message);

  const afterAdd = await call('GET', '/officer/requirements', { token: officerToken });
  const nowRequired = afterAdd.data.requirements.filter((r) => r.is_required);
  check(
    'requirement count increased by one',
    nowRequired.length === alreadyRequired.length + 1,
    `${alreadyRequired.length} -> ${nowRequired.length}`
  );

  const addedRow = afterAdd.data.requirements.find(
    (r) => r.document_type_id === spare.document_type_id
  );
  check('added requirement is marked mandatory', addedRow?.is_mandatory === true);

  // Adding the same type twice must update, not duplicate (upsert).
  const again = await call('POST', '/officer/requirements', {
    token: officerToken,
    body: { document_type_id: spare.document_type_id, is_mandatory: false },
  });
  check('re-adding the same type succeeds', again.ok, again.message);

  const afterToggle = await call('GET', '/officer/requirements', { token: officerToken });
  const toggledRows = afterToggle.data.requirements.filter(
    (r) => r.document_type_id === spare.document_type_id
  );
  check('no duplicate row was created', toggledRows.length === 1, `found ${toggledRows.length}`);
  check('mandatory flag was updated to optional', toggledRows[0]?.is_mandatory === false);

  // --- The student sees the officer's decision ---
  console.log('\nStudent view reflects the officer');
  await call('POST', '/officer/requirements', {
    token: officerToken,
    body: { document_type_id: spare.document_type_id, is_mandatory: true },
  });

  const studentReqs = await call('GET', '/student/requirements', { token: studentToken });
  check('student can read the checklist', studentReqs.ok, studentReqs.message);

  const studentRow = studentReqs.data.requirements.find(
    (r) => r.document_type_id === spare.document_type_id
  );
  check('newly requested document appears for the student', Boolean(studentRow));
  check(
    'checklist names the section that asked',
    studentRow?.required_by?.includes(initial.data.stage.stage_name),
    JSON.stringify(studentRow?.required_by)
  );
  check('document is flagged mandatory for the student', studentRow?.is_mandatory === true);

  // De-duplication: one row per document type, never one per stage.
  const ids = studentReqs.data.requirements.map((r) => r.document_type_id);
  check('checklist is de-duplicated by document type', new Set(ids).size === ids.length);

  // A shared document should name more than one section.
  const shared = studentReqs.data.requirements.find((r) => r.is_shared);
  if (shared) {
    const askedBy = [...shared.required_by, ...shared.optional_for];
    check('a shared document names every section that asked', askedBy.length > 1, JSON.stringify(askedBy));
  }

  // --- Requirements gate submission ---
  console.log('\nSubmission gating');
  const submit = await call('POST', `/student/submit/${stageId}`, {
    token: studentToken,
    body: { document_ids: [] },
  });
  const blocked = !submit.ok && /upload|require|missing/i.test(submit.message || '');
  check('submission is rejected while a required document is missing', blocked, submit.message);

  // --- Authorisation ---
  console.log('\nAuthorisation');
  const studentAttempt = await call('POST', '/officer/requirements', {
    token: studentToken,
    body: { document_type_id: spare.document_type_id, is_mandatory: true },
  });
  check('a student cannot edit requirements', studentAttempt.status === 403, `status ${studentAttempt.status}`);

  const bogus = await call('POST', '/officer/requirements', {
    token: officerToken,
    body: { document_type_id: 999999, is_mandatory: true },
  });
  check('unknown document type is rejected', bogus.status === 404, `status ${bogus.status}`);

  // --- Removal restores the original state ---
  console.log('\nRemoving a requirement');
  const removed = await call('DELETE', `/officer/requirements/${spare.document_type_id}`, {
    token: officerToken,
  });
  check('officer can remove a requirement', removed.ok, removed.message);

  const final = await call('GET', '/officer/requirements', { token: officerToken });
  check(
    'requirement count is back to its original value',
    final.data.requirements.filter((r) => r.is_required).length === alreadyRequired.length
  );

  const removeAgain = await call('DELETE', `/officer/requirements/${spare.document_type_id}`, {
    token: officerToken,
  });
  check('removing a requirement twice is reported clearly', removeAgain.status === 404, `status ${removeAgain.status}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nCheck aborted:', err.message, '\n');
  process.exit(1);
});
