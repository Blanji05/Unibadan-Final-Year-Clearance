/**
 * End-to-end check for the newer features: PDF receipts, timeline/reminders,
 * admin exports + deadline, bulk review and password reset.
 *
 *   node scripts/check-features.js        (server must be running; honours PORT)
 *
 * It restores everything it touches (test payment, deadline, password).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { query, queryOne, pool } = require('../config/db');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const PASSWORD = 'Password123!';

let passed = 0;
let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  ok ? passed++ : failed++;
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const raw = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    type,
    raw,
    json: type.includes('json') ? JSON.parse(raw.toString() || '{}') : null,
  };
}

async function login(email, password = PASSWORD) {
  const res = await call('POST', '/auth/login', { body: { email, password } });
  return res.json?.data?.token;
}

async function issueResetToken(email) {
  const user = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
    [user.id, crypto.createHash('sha256').update(token).digest('hex')]
  );
  return token;
}

(async () => {
  const studentEmail = 'anjoola@student.ui.edu.ng';
  const student = await queryOne('SELECT id FROM users WHERE email = ?', [studentEmail]);

  const [adminT, studentT, otherT, officerT] = await Promise.all([
    login('admin@ui.edu.ng'),
    login(studentEmail),
    login('folake@student.ui.edu.ng'),
    login('library@ui.edu.ng'),
  ]);
  check('logins (admin, 2 students, officer)', Boolean(adminT && studentT && otherT && officerT));
  if (!(adminT && studentT && otherT && officerT)) return report();

  try {
    // ---- Receipts -----------------------------------------------------------
    await query('DELETE FROM payments WHERE student_id = ?', [student.id]);
    const stages = (await call('GET', '/student/clearance-status', { token: studentT })).json.data.stages;
    const alumni = stages.find((s) => s.requires_payment);
    await call('POST', `/student/pay/${alumni.stage_id}`, { token: studentT });
    await query("UPDATE payments SET status = 'success', paid_at = NOW() WHERE student_id = ? AND stage_id = ?", [student.id, alumni.stage_id]);

    const payments = (await call('GET', '/student/payments', { token: studentT })).json.data.payments;
    const paid = payments.find((p) => p.status === 'success');
    check('a settled payment exists to receipt', Boolean(paid));

    const receipt = await call('GET', `/student/payments/${paid.id}/receipt`, { token: studentT });
    check('receipt is a PDF', receipt.status === 200 && receipt.type.includes('application/pdf') && receipt.raw.subarray(0, 4).toString() === '%PDF', `status ${receipt.status}`);

    const stolen = await call('GET', `/student/payments/${paid.id}/receipt`, { token: otherT });
    check("another student cannot fetch the receipt", stolen.status === 404, `status ${stolen.status}`);

    const anon = await call('GET', `/student/payments/${paid.id}/receipt`);
    check('receipt requires login', anon.status === 401, `status ${anon.status}`);

    // ---- Timeline + deadline + reminders -----------------------------------
    const tl = await call('GET', '/student/timeline', { token: studentT });
    const events = tl.json?.data?.events || [];
    check('timeline returns events', tl.status === 200 && events.length > 0, `${events.length} events`);
    check('timeline lists the payment', events.some((e) => e.type === 'payment'));

    const noPerm = await call('PUT', '/admin/settings/deadline', { token: studentT, body: { deadline: '2099-01-01' } });
    check('students cannot set the deadline', noPerm.status === 403, `status ${noPerm.status}`);

    const target = new Date(Date.now() + 5 * 86400000);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const setRes = await call('PUT', '/admin/settings/deadline', { token: adminT, body: { deadline: iso } });
    check('admin sets the deadline', setRes.status === 200 && setRes.json.data.deadline === iso, `status ${setRes.status}`);

    const badDate = await call('PUT', '/admin/settings/deadline', { token: adminT, body: { deadline: 'soon' } });
    check('invalid deadline rejected', badDate.status === 422, `status ${badDate.status}`);

    const tl2 = (await call('GET', '/student/timeline', { token: studentT })).json.data;
    check('deadline reaches the student', tl2.deadline?.date === iso && tl2.deadline.days_left === 5, `days_left ${tl2.deadline?.days_left}`);
    check('deadline reminder generated', tl2.reminders.some((r) => r.type === 'deadline'));

    const sent = await call('POST', '/admin/send-reminders', { token: adminT });
    check('admin can send reminders', sent.status === 200 && sent.json.data.notified >= 1, sent.json?.data?.message);
    const forbidden = await call('POST', '/admin/send-reminders', { token: studentT });
    check('students cannot send reminders', forbidden.status === 403, `status ${forbidden.status}`);

    // ---- Exports -----------------------------------------------------------
    const stuCsv = await call('GET', '/admin/export/students.csv', { token: adminT });
    const stuText = stuCsv.raw.toString('utf8');
    check('students CSV', stuCsv.status === 200 && stuCsv.type.includes('text/csv') && (stuText.includes('Matric number') || stuText.toLowerCase().includes('matric')) && stuText.includes(studentEmail), `status ${stuCsv.status}`);
    check('students CSV has Excel BOM', stuText.charCodeAt(0) === 0xfeff);

    const payCsv = await call('GET', '/admin/export/payments.csv', { token: adminT });
    check('payments CSV includes the payment', payCsv.status === 200 && payCsv.raw.toString('utf8').includes(paid.reference));

    const csvDenied = await call('GET', '/admin/export/students.csv', { token: studentT });
    check('students cannot export', csvDenied.status === 403, `status ${csvDenied.status}`);

    // ---- Bulk review -------------------------------------------------------
    const none = await call('POST', '/officer/review-bulk', { token: officerT, body: { student_ids: [], decision: 'approved' } });
    check('bulk review needs a selection', none.status === 422, `status ${none.status}`);

    const noReason = await call('POST', '/officer/review-bulk', { token: officerT, body: { student_ids: [student.id], decision: 'rejected' } });
    check('bulk rejection needs a reason', noReason.status === 400, `status ${noReason.status}`);

    const ghost = await call('POST', '/officer/review-bulk', { token: officerT, body: { student_ids: [999999], decision: 'approved' } });
    check('bulk review reports per-student failures', ghost.status === 200 && ghost.json.data.failed.length === 1 && ghost.json.data.succeeded.length === 0);

    const studentBulk = await call('POST', '/officer/review-bulk', { token: studentT, body: { student_ids: [1], decision: 'approved' } });
    check('students cannot bulk review', studentBulk.status === 403, `status ${studentBulk.status}`);

    // ---- Registration removed + CSV import --------------------------------
    const reg = await call('POST', '/auth/register', { body: { full_name: 'X Y Z', email: 'x@y.test', password: 'Password1', matric_number: 'X1', department: 'd', faculty: 'f' } });
    check('self-registration is gone', reg.status === 404, `status ${reg.status}`);

    const importDenied = await call('POST', '/admin/students/import', { token: studentT, body: { csv: 'a,b' } });
    check('students cannot import', importDenied.status === 403, `status ${importDenied.status}`);

    const badHeader = await call('POST', '/admin/students/import', { token: adminT, body: { csv: 'name,phone\nJohn Doe,0801' } });
    check('import rejects a file without required columns', badHeader.status === 400, `status ${badHeader.status}`);

    const stamp = Date.now().toString().slice(-7);
    const csv = [
      'Full Name,Email,Matric No,Department,Faculty,Hall,Phone',
      `"Import, Test ${stamp}",import.${stamp}@student.ui.edu.ng,IMP${stamp},Physics,Science,Tedder,08011112222`,
      'Bad Email,not-an-email,IMP0001,Physics,Science,,',
      `Duplicate Person,${studentEmail},IMP${stamp}B,Physics,Science,,`,
    ].join('\r\n');
    const imp = await call('POST', '/admin/students/import', { token: adminT, body: { csv } });
    const d = imp.json?.data || {};
    check('import creates valid rows and reports bad ones', imp.status === 201 && d.created === 1 && d.failed?.length === 2, `created ${d.created}, failed ${d.failed?.length}`);
    check('failures carry a line number', d.failed?.map((f) => f.line).join(',') === '3,4');
    const pw = (d.credentials_csv || '').split(/\r?\n/)[1]?.split(',').pop();
    check('credentials CSV returned once', Boolean(pw) && d.credentials_csv.includes(`IMP${stamp}`));
    check('imported student can sign in with the generated password', Boolean(await login(`import.${stamp}@student.ui.edu.ng`, pw)));
    await query('DELETE FROM users WHERE email = ?', [`import.${stamp}@student.ui.edu.ng`]);
    // ---- Password reset ----------------------------------------------------
    const unknown = await call('POST', '/auth/forgot-password', { body: { email: 'nobody@nowhere.test' } });
    const known = await call('POST', '/auth/forgot-password', { body: { email: studentEmail } });
    check('forgot-password answers identically for unknown and known emails', unknown.status === 200 && known.status === 200 && unknown.json.data.message === known.json.data.message);

    const row = await queryOne('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?', [student.id]);
    check('a reset token was stored for the real account', row.n >= 1);

    const weak = await call('POST', '/auth/reset-password', { body: { token: await issueResetToken(studentEmail), password: 'short' } });
    check('weak new password rejected', weak.status === 422, `status ${weak.status}`);

    const bad = await call('POST', '/auth/reset-password', { body: { token: 'f'.repeat(64), password: 'Newpass123' } });
    check('unknown token rejected', bad.status === 400, `status ${bad.status}`);

    const t1 = await issueResetToken(studentEmail);
    const ok = await call('POST', '/auth/reset-password', { body: { token: t1, password: 'Temporary123' } });
    check('valid token resets the password', ok.status === 200, `status ${ok.status}`);
    check('new password works, old one does not', Boolean(await login(studentEmail, 'Temporary123')) && !(await login(studentEmail)));

    const reuse = await call('POST', '/auth/reset-password', { body: { token: t1, password: 'Another123' } });
    check('token cannot be reused', reuse.status === 400, `status ${reuse.status}`);

    const expired = await issueResetToken(studentEmail);
    await query("UPDATE password_resets SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE token_hash = ?", [crypto.createHash('sha256').update(expired).digest('hex')]);
    const late = await call('POST', '/auth/reset-password', { body: { token: expired, password: 'Another123' } });
    check('expired token rejected', late.status === 400, `status ${late.status}`);

    const t2 = await issueResetToken(studentEmail);
    await call('POST', '/auth/reset-password', { body: { token: t2, password: PASSWORD } });
    check('password restored', Boolean(await login(studentEmail)));
  } finally {
    await query('DELETE FROM payments WHERE student_id = ?', [student.id]);
    await query("DELETE FROM settings WHERE setting_key = 'clearance_deadline'");
    await query('DELETE FROM password_resets WHERE user_id = ?', [student.id]);
    await query("DELETE FROM notifications WHERE title = 'Clearance reminder'");
    await pool.end();
  }

  report();
})();

function report() {
  console.log('\n============ FEATURE CHECKS ============');
  results.forEach((r) => console.log(r));
  console.log('----------------------------------------');
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('========================================\n');
  process.exit(failed ? 1 : 0);
}
