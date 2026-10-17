/**
 * Verifies the notification pipeline end to end: that decisions, submissions,
 * payments, certificates and account changes actually notify someone, and that
 * both the in-app inbox and the email channel receive them.
 *
 * The server is expected to run with SMTP unconfigured (simulated email), where
 * outgoing messages are logged to the server console and recorded as delivered
 * in the notifications table — which is exactly what this script asserts.
 *
 *   node scripts/check-notifications.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query } = require('../config/db');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

// Suffix keeps repeat runs from colliding on unique columns.
const RUN = Date.now().toString().slice(-6);
const STARTED_AT = new Date();
const STUDENT_EMAIL = `check.student.${RUN}@student.ui.edu.ng`;
const STUDENT_PASSWORD = 'CheckPass123!';
const REJECTION_REASON = `Verification rejection ${RUN}`;

// The officer inbox check only counts rows from this run.
const recent = (n) =>
  Boolean(n.created_at) &&
  new Date(String(n.created_at).replace(' ', 'T')).getTime() >= STARTED_AT.getTime() - 60_000;

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

async function login(email, password = SEED_PASSWORD) {
  const res = await call('POST', '/auth/login', { body: { email, password } });
  if (!res.data?.token) throw new Error(`Login failed for ${email}: ${res.message}`);
  return res.data.token;
}

/** Minimal multipart/form-data upload of a tiny in-memory PDF. */
function upload(documentTypeId, token) {
  return new Promise((resolve) => {
    const boundary = `----notif${Date.now()}`;
    const fileBody = Buffer.from('%PDF-1.4\n% notification check document\n%%EOF\n');

    const parts = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="document_type_id"\r\n\r\n${documentTypeId}\r\n`
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notif-check.pdf"\r\n` +
          `Content-Type: application/pdf\r\n\r\n`
      ),
      fileBody,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    fetch(`${BASE}/student/documents`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, Authorization: `Bearer ${token}` },
      body: parts,
    })
      .then(async (res) => resolve({ status: res.status, ok: res.ok, ...(await res.json().catch(() => ({}))) }))
      .catch((error) => resolve({ status: 0, ok: false, message: error.message }));
  });
}

(async () => {
  console.log('\nNotification pipeline\n');

  const health = await call('GET', '/health');
  check('server is up', health.ok);
  if (!health.ok) {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(1);
  }

  const emailMode = health.data?.email;
  check('health reports the email mode', typeof emailMode === 'string', emailMode);
  const livePaymentMode = health.data?.payments === 'remita' || health.data?.payments === 'paystack';

  const anon = await call('GET', '/notifications');
  check('notifications require authentication', anon.status === 401, `status ${anon.status}`);

  // --- Account-creation welcome (students are created by the admin) --------------
  const adminToken = await login('admin@ui.edu.ng');
  const registered = await call('POST', '/admin/students', {
    token: adminToken,
    body: {
      full_name: `Notif Student ${RUN}`,
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD,
      matric_number: `NTF${RUN}`,
      department: 'Computer Science',
      faculty: 'Computing',
      hall: 'Independence Hall',
      phone_number: '08030000000',
    },
  });
  check('an admin can create a student', registered.ok, registered.message);

  const studentToken = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
  const studentId = registered.data?.id;

  let inbox = await call('GET', '/notifications', { token: studentToken });
  check('the inbox is reachable', inbox.ok, inbox.message);
  check('registration lands in the inbox', inbox.data?.notifications?.some((n) => n.title === 'Welcome to UI Clearance'));
  check('the welcome message counts as unread', (inbox.data?.unread || 0) >= 1);

  let emails = await call('GET', '/notifications?channel=email', { token: studentToken });
  check('the welcome email was dispatched', emails.data?.notifications?.some((n) => n.title === 'Welcome to UI Clearance'));
  check(
    'email delivery is recorded as sent',
    emails.data?.notifications?.every((n) => n.delivery_status === 'sent'),
    JSON.stringify(emails.data?.notifications?.map((n) => n.delivery_status))
  );

  // --- Submission notice to the section officer ---------------------------------
  const byStage = await call('GET', '/student/documents/by-stage', { token: studentToken });
  const library = byStage.data?.stages?.find((s) => s.code === 'library');
  const requirement = library?.required_documents?.[0];
  check('library has a document requirement', Boolean(requirement), requirement?.label);

  const uploaded = await upload(requirement.document_type_id, studentToken);
  check('the required document uploads', uploaded.status === 201, `status ${uploaded.status}`);
  const docId = uploaded.data?.document?.id;

  const submitted = await call('POST', `/student/submit/${library.stage_id}`, {
    token: studentToken,
    body: { document_ids: [docId] },
  });
  check('the stage submits', submitted.ok, submitted.message);

  const officerToken = await login('library@ui.edu.ng');
  const officerInbox = await call('GET', '/notifications', { token: officerToken });
  check(
    'the officer is notified of the submission',
    officerInbox.data?.notifications?.some((n) => n.title === 'New submission: Library Clearance' && recent(n))
  );

  const officerEmails = await call('GET', '/notifications?channel=email', { token: officerToken });
  check(
    'the submission notice emails the officer too',
    officerEmails.data?.notifications?.some((n) => n.title === 'New submission: Library Clearance' && recent(n))
  );

  // --- Rejection notice, with the reason ---------------------------------------
  const rejected = await call('PATCH', `/officer/review/${studentId}/${library.stage_id}`, {
    token: officerToken,
    body: { decision: 'rejected', remarks: REJECTION_REASON },
  });
  check('the officer can reject', rejected.ok, rejected.message);

  inbox = await call('GET', '/notifications', { token: studentToken });
  check(
    'the rejection reaches the inbox',
    inbox.data?.notifications?.some((n) => n.title === 'Library Clearance rejected' && recent(n))
  );

  emails = await call('GET', '/notifications?channel=email', { token: studentToken });
  const rejectEmail = emails.data?.notifications?.find(
    (n) => n.title === 'Library Clearance rejected' && recent(n)
  );
  check('the rejection email goes out', Boolean(rejectEmail));
  check('the rejection reason travels with the email', Boolean(rejectEmail?.message?.includes(REJECTION_REASON)));

  // --- Override approval ---------------------------------------------------------
  const overridden = await call('PATCH', `/admin/override/${studentId}/${library.stage_id}`, {
    token: adminToken,
    body: { status: 'approved', remarks: 'Cleared in person — verification run' },
  });
  check('admin can override a stage', overridden.ok, overridden.message);

  emails = await call('GET', '/notifications?channel=email', { token: studentToken });
  check(
    'the override emails the student',
    emails.data?.notifications?.some((n) => n.title === 'Library Clearance approved' && recent(n))
  );

  // --- Finish the remaining stages so a certificate can be issued ----------------
  const sections = (await call('GET', '/admin/sections', { token: adminToken })).data?.sections || [];
  for (const section of sections.filter((s) => s.id !== library.stage_id)) {
    const r = await call('PATCH', `/admin/override/${studentId}/${section.id}`, {
      token: adminToken,
      body: { status: 'approved', remarks: 'Verification run' },
    });
    if (!r.ok) check(`override approves ${section.code}`, false, r.message);
  }
  check('every remaining stage is approved', sections.length > 1);

  // --- Certificate ready -----------------------------------------------------------
  const cert = await call('POST', `/admin/generate-certificate/${studentId}`, { token: adminToken });
  check('the certificate is issued once everything is approved', cert.ok, cert.message);

  emails = await call('GET', '/notifications?channel=email', { token: studentToken });
  check(
    'the clearance letter email goes out',
    emails.data?.notifications?.some((n) => (n.title === 'Clearance letter ready' || n.title === 'Clearance certificate ready') && recent(n))
  );

  // --- Payment receipt (simulated mode settles instantly) ----------------------------
  if (!livePaymentMode) {
    const alumni = sections.find((s) => s.code === 'alumni');
    const pay = await call('POST', `/student/pay/${alumni.id}`, { token: studentToken });
    check('payment initiates', pay.ok, pay.message);

    emails = await call('GET', '/notifications?channel=email', { token: studentToken });
    check(
      'the payment receipt emails out',
      emails.data?.notifications?.some((n) => n.title?.startsWith('Payment received') && recent(n))
    );
  } else {
    check('payment receipt left to payment flow checks (live gateway mode settles via webhook/verify)', true);
  }

  // --- Security notice on password reset ----------------------------------------------
  const reset = await call('POST', `/admin/users/${studentId}/reset-password`, {
    token: adminToken,
    body: { password: 'ResetPass456!' },
  });
  check('admin can reset the password', reset.ok, reset.message);

  emails = await call('GET', '/notifications?channel=email', { token: studentToken });
  check(
    'the password-change notice emails out',
    emails.data?.notifications?.some((n) => n.title === 'Your password was changed' && recent(n))
  );

  const reLogin = await call('POST', '/auth/login', { body: { email: STUDENT_EMAIL, password: 'ResetPass456!' } });
  check('the reset password works', Boolean(reLogin.data?.token));

  // --- SMS channel is audited alongside email ------------------------------------------
  const sms = await call('GET', '/notifications?channel=sms', { token: studentToken });
  check('sms attempts are recorded for the student', (sms.data?.notifications?.length || 0) >= 1);

  // --- Inbox housekeeping ----------------------------------------------------------------
  const before = await call('GET', '/notifications', { token: studentToken });
  const marked = await call('PATCH', '/notifications/read-all', { token: studentToken });
  check('mark-all-read succeeds', marked.ok, marked.message);

  const after = await call('GET', '/notifications', { token: studentToken });
  check('the inbox empties of unread items', after.data?.unread === 0, `was ${before.data?.unread}`);
  check(
    'read items keep their content',
    (after.data?.notifications?.length || 0) >= (before.data?.notifications?.length || 0)
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await cleanup(studentId);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(`\nAborted: ${err.message}\n`);
  process.exit(1);
});

/**
 * The API refuses to delete a student who already holds a certificate, so the
 * run removes its own student straight from the database — the same cascade the
 * API relies on clears the certificate, documents, payments and notifications.
 * The submission notice planted in the seeded officer's inbox goes too.
 */
async function cleanup(studentId) {
  try {
    if (studentId) {
      await query('DELETE FROM users WHERE id = ?', [studentId]);
      console.log('Cleanup: verification student removed.');
    }
    await query('DELETE FROM notifications WHERE created_at >= ? AND title LIKE ?', [
      STARTED_AT,
      'New submission:%',
    ]);
    console.log('Cleanup: officer inbox restored.');
  } catch (error) {
    console.warn(`Cleanup failed (run  npm run cleanup:test-data  afterwards): ${error.message}`);
  }
}
