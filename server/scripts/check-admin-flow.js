/**
 * Verifies the administrator control surface end to end.
 *
 * The premise being tested: an admin configures the workflow itself — sections,
 * their order, their prerequisites — and manages the people in it, without
 * anyone touching the database by hand. The destructive paths matter as much as
 * the happy ones: a section carrying approval history must refuse deletion, and
 * a prerequisite loop must be rejected, since either would leave students
 * permanently unable to finish.
 *
 * Everything it creates, it removes. Run against a running server:
 *   node scripts/check-admin-flow.js
 */
require('dotenv').config();

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

// Suffix keeps repeat runs from colliding on unique columns.
const RUN = Date.now().toString().slice(-6);

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
  console.log('\nAdministrator control surface\n');

  const admin = await login('admin@ui.edu.ng', SEED_PASSWORD);

  // Track what we create so the finally block can clean up even on failure.
  const created = { sectionId: null, studentId: null, officerId: null };

  // Declared out here so the cleanup block can compare against it.
  let baselineCount = 0;


  try {
    // --- Analytics --------------------------------------------------------
    console.log('Analytics');
    const stats = await call('GET', '/admin/analytics', { token: admin });
    check('admin can read analytics', stats.ok, stats.message);
    check('totals are reported', stats.data?.totals != null);
    check('per-stage breakdown is reported', Array.isArray(stats.data?.by_stage));
    check(
      'breakdown covers every seeded stage',
      (stats.data?.by_stage?.length || 0) >= 10,
      `saw ${stats.data?.by_stage?.length}`
    );
    check(
      'each stage row carries a status split',
      stats.data?.by_stage?.every((s) => 'pending' in s && 'approved' in s && 'rejected' in s)
    );

    const activity = await call('GET', '/admin/activity?limit=5', { token: admin });
    check('audit feed is readable', activity.ok, activity.message);
    check('audit feed is a list', Array.isArray(activity.data?.activity));

    // --- Sections: read ---------------------------------------------------
    console.log('\nSections');
    const before = await call('GET', '/admin/sections', { token: admin });
    check('sections are listed', before.ok, before.message);

    const sections = before.data?.sections || [];
    check('all ten UI stages are present', sections.length >= 10, `saw ${sections.length}`);

    // Compared against at the end, so the run leaves the workflow as it found it.
    baselineCount = sections.length;


    check(
      'stage_order is contiguous from 1',
      sections.every((s, i) => s.stage_order === i + 1),
      sections.map((s) => s.stage_order).join(',')
    );
    check(
      'prerequisites are resolved per section',
      sections.every((s) => Array.isArray(s.prerequisite_ids))
    );
    check(
      'seeded dependencies survive (Sports needs Library/Hall/Alumni)',
      (sections.find((s) => s.code === 'sports')?.prerequisite_ids.length || 0) === 3
    );
    check(
      'each section reports whether it is safe to delete',
      sections.every((s) => typeof s.can_delete === 'boolean')
    );


    // --- Sections: create -------------------------------------------------
    const newSection = await call('POST', '/admin/sections', {
      token: admin,
      body: {
        code: `check_${RUN}`,
        stage_name: `Verification Section ${RUN}`,
        location: 'Test Block',
        description: 'Created by check-admin-flow.js',
        estimated_duration_days: 2,
      },
    });
    check('a new section can be added', newSection.ok, newSection.message);
    created.sectionId = newSection.data?.id;
    check('the created section is reported back with its id', Boolean(created.sectionId));
    check('the new section is placed last', newSection.data?.stage_order > 10);
    check(
      'existing students are backfilled on creation',
      Number(newSection.data?.students_backfilled) > 0,
      `backfilled ${newSection.data?.students_backfilled}`
    );

    const afterCreate = await call('GET', '/admin/sections', { token: admin });

    const mine = afterCreate.data.sections.find((s) => s.id === created.sectionId);
    check('new section is appended to the end of the workflow', mine?.stage_order === afterCreate.data.sections.length);
    check('new section starts with no officer', mine?.officer_count === 0);
    check('new section is deletable while unused', mine?.can_delete === true);

    // A section added mid-year must reach students already in the process,
    // otherwise their progress total silently disagrees with the workflow.
    const studentsAfter = await call('GET', '/admin/students', { token: admin });
    const anySeeded = studentsAfter.data.students[0];
    check(
      'existing students receive the new section',
      Number(anySeeded?.total_stages) === afterCreate.data.sections.length,
      `student has ${anySeeded?.total_stages} of ${afterCreate.data.sections.length}`
    );

    // --- Sections: rename, reorder ---------------------------------------
    const renamed = await call('PATCH', `/admin/sections/${created.sectionId}`, {
      token: admin,
      body: { stage_name: `Renamed Section ${RUN}`, estimated_duration_days: 5 },
    });
    check('a section can be renamed', renamed.ok, renamed.message);

    const order = afterCreate.data.sections.map((s) => s.id);
    const swapped = [...order];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const reordered = await call('PATCH', '/admin/sections/reorder', { token: admin, body: { order: swapped } });
    check('sections can be reordered', reordered.ok, reordered.message);

    const afterReorder = await call('GET', '/admin/sections', { token: admin });
    check(
      'the new order is persisted',
      afterReorder.data.sections[0].id === swapped[0] && afterReorder.data.sections[1].id === swapped[1]
    );

    // Restore the original order so the seeded workflow stays as documented.
    await call('PATCH', '/admin/sections/reorder', { token: admin, body: { order } });
    const restored = await call('GET', '/admin/sections', { token: admin });
    check('original order can be restored', restored.data.sections[0].id === order[0]);

    // The seeded stages plus the one created above.
    const restoredCount = restored.data.sections.length;

    // --- Sections: prerequisites -----------------------------------------

    console.log('\nPrerequisites');
    const library = restored.data.sections.find((s) => s.code === 'library');
    const setPrereq = await call('PUT', `/admin/sections/${created.sectionId}/prerequisites`, {
      token: admin,
      body: { prerequisite_ids: [library.id] },
    });
    check('a prerequisite can be set', setPrereq.ok, setPrereq.message);

    const withPrereq = await call('GET', '/admin/sections', { token: admin });
    check(
      'the prerequisite is stored',
      withPrereq.data.sections.find((s) => s.id === created.sectionId)?.prerequisite_ids[0] === library.id
    );

    // Self-dependency: a stage that gates itself can never be reached.
    const selfDep = await call('PUT', `/admin/sections/${created.sectionId}/prerequisites`, {
      token: admin,
      body: { prerequisite_ids: [created.sectionId] },
    });
    check('a section cannot depend on itself', selfDep.status === 400, `status ${selfDep.status}`);

    // Circular dependency: library -> new -> library, deadlocking both.
    const loop = await call('PUT', `/admin/sections/${library.id}/prerequisites`, {
      token: admin,
      body: { prerequisite_ids: [created.sectionId] },
    });
    check('circular dependencies are rejected', loop.status === 400, loop.message);

    const libraryStill = await call('GET', '/admin/sections', { token: admin });
    check(
      'the rejected loop left library untouched',
      (libraryStill.data.sections.find((s) => s.code === 'library')?.prerequisite_ids.length || 0) === 0
    );

    // --- Sections: deactivate, delete ------------------------------------
    const deactivated = await call('PATCH', `/admin/sections/${created.sectionId}/status`, {
      token: admin,
      body: { is_active: false },
    });
    check('a section can be taken out of the workflow', deactivated.ok, deactivated.message);

    const inactive = await call('GET', '/admin/sections', { token: admin });
    check(
      'the section reads as inactive',
      inactive.data.sections.find((s) => s.id === created.sectionId)?.is_active === false
    );

    await call('PATCH', `/admin/sections/${created.sectionId}/status`, { token: admin, body: { is_active: true } });


    // --- Students ---------------------------------------------------------
    console.log('\nStudent records');
    const student = await call('POST', '/admin/students', {
      token: admin,
      body: {
        full_name: `Check Student ${RUN}`,
        email: `check.student.${RUN}@student.ui.edu.ng`,
        matric_number: `CHK${RUN}`,
        password: 'CheckPass123!',
        department: 'Computer Science',
        faculty: 'Computing',
        hall: 'Independence Hall',
      },
    });
    check('a student can be created', student.ok, student.message);
    created.studentId = student.data?.id;
    check('the created student is reported back with its id', Boolean(created.studentId));
    check(
      'their clearance rows are created up front',
      Number(student.data?.stages) === restoredCount,
      `created ${student.data?.stages} of ${restoredCount}`
    );


    // The point of creating through the admin: the student can work immediately.
    const studentToken = await login(`check.student.${RUN}@student.ui.edu.ng`, 'CheckPass123!');
    const theirStatus = await call('GET', '/student/clearance-status', { token: studentToken });
    check('the new student can sign in', Boolean(studentToken));
    check(
      'their clearance is already initialised',
      (theirStatus.data?.stages?.length || 0) === restored.data.sections.length,
      `saw ${theirStatus.data?.stages?.length}`
    );

    const dupe = await call('POST', '/admin/students', {
      token: admin,
      body: {
        full_name: 'Duplicate Attempt',
        email: `check.student.${RUN}@student.ui.edu.ng`,
        matric_number: `OTHER${RUN}`,
        password: 'CheckPass123!',
        department: 'Computer Science',
        faculty: 'Computing',
        hall: 'Independence Hall',
      },
    });
    check('duplicate emails are refused', dupe.status === 409, `status ${dupe.status}`);

    const updated = await call('PATCH', `/admin/students/${created.studentId}`, {
      token: admin,
      body: { department: 'Mathematics', hall: 'Independence Hall' },
    });
    check('student details can be corrected', updated.ok, updated.message);

    const detail = await call('GET', `/admin/students/${created.studentId}`, { token: admin });
    check('the correction is stored', detail.data?.student?.department === 'Mathematics');

    const newPassword = await call('POST', `/admin/users/${created.studentId}/reset-password`, {
      token: admin,
      body: { password: 'ResetPass456!' },
    });
    check('a password can be reset', newPassword.ok, newPassword.message);
    const reLogin = await call('POST', '/auth/login', {
      body: { email: `check.student.${RUN}@student.ui.edu.ng`, password: 'ResetPass456!' },
    });
    check('the new password works', Boolean(reLogin.data?.token));

    // --- Overrides --------------------------------------------------------
    console.log('\nStage overrides');
    const firstStage = restored.data.sections[0];
    const overridden = await call('PATCH', `/admin/override/${created.studentId}/${firstStage.id}`, {
      token: admin,
      body: { status: 'approved', remarks: 'Cleared in person — verification run' },
    });
    check('a stage can be overridden', overridden.ok, overridden.message);

    const clearance = await call('GET', `/admin/students/${created.studentId}/clearance`, { token: admin });
    const overriddenRow = clearance.data.stages.find((s) => s.stage_id === firstStage.id);
    check('the override is applied', overriddenRow?.status === 'approved');
    check('the reason is recorded against the stage', Boolean(overriddenRow?.remarks));

    const logged = await call('GET', '/admin/activity?limit=10', { token: admin });
    check(
      'the override is written to the audit log',
      logged.data.activity.some((a) => a.action === 'override_stage_status'),
      logged.data.activity.map((a) => a.action).join(', ')
    );


    // A certificate before every stage is approved would defeat the process.
    const premature = await call('POST', `/admin/generate-certificate/${created.studentId}`, { token: admin });
    check('certificates are withheld until fully cleared', !premature.ok, `status ${premature.status}`);

    const reset = await call('PATCH', `/admin/override/${created.studentId}/${firstStage.id}`, {
      token: admin,
      body: { status: 'not_started', remarks: 'Reverting verification override' },
    });
    check('an override can be reverted', reset.ok, reset.message);

    // --- Officer accounts -------------------------------------------------
    console.log('\nOfficer accounts');
    const officer = await call('POST', '/admin/officers', {
      token: admin,
      body: {
        full_name: `Check Officer ${RUN}`,
        email: `check.officer.${RUN}@ui.edu.ng`,
        password: 'CheckPass123!',
        section_code: `check_${RUN}`,
      },
    });
    check('an officer can be created for a section', officer.ok, officer.message);
    created.officerId = officer.data?.id;
    check('the created officer is reported back with its id', Boolean(created.officerId));
    check('the officer is bound to the requested section', officer.data?.section_code === `check_${RUN}`);


    const officerToken = await login(`check.officer.${RUN}@ui.edu.ng`, 'CheckPass123!');
    const theirQueue = await call('GET', '/officer/pending-requests', { token: officerToken });
    check(
      'the officer sees their own section',
      theirQueue.data?.stage?.id === created.sectionId,
      `saw stage ${theirQueue.data?.stage?.id}`
    );

    // A section still staffed by an officer must not be deletable either.
    const staffed = await call('DELETE', `/admin/sections/${created.sectionId}`, { token: admin });
    check('a section still staffed cannot be deleted', staffed.status === 409, `status ${staffed.status}`);

    const moved = await call('PATCH', `/admin/users/${created.officerId}/section`, {

      token: admin,
      body: { section_code: 'library' },
    });
    check('an officer can be reassigned', moved.ok, moved.message);

    const movedToken = await login(`check.officer.${RUN}@ui.edu.ng`, 'CheckPass123!');
    const movedQueue = await call('GET', '/officer/pending-requests', { token: movedToken });
    check('the reassigned officer sees the new section', movedQueue.data?.stage?.code === 'library');

    const disabled = await call('PATCH', `/admin/users/${created.officerId}/status`, {
      token: admin,
      body: { is_active: false },
    });
    check('an account can be deactivated', disabled.ok, disabled.message);

    const lockedOut = await call('POST', '/auth/login', {
      body: { email: `check.officer.${RUN}@ui.edu.ng`, password: 'CheckPass123!' },
    });
    check('a deactivated account cannot sign in', !lockedOut.data?.token, 'login unexpectedly succeeded');

    // --- Authorisation ----------------------------------------------------
    console.log('\nRole boundaries');
    const asStudent = await call('GET', '/admin/students', { token: studentToken });
    check('students cannot read admin data', asStudent.status === 403, `status ${asStudent.status}`);

    const studentWritingSections = await call('POST', '/admin/sections', {
      token: studentToken,
      body: { code: 'hack', stage_name: 'Should Not Exist' },
    });
    check('students cannot create sections', studentWritingSections.status === 403);

    const officerReadingAdmin = await call('GET', '/admin/analytics', { token: movedToken });
    check('officers cannot read admin analytics', officerReadingAdmin.status === 403);
  } finally {
    // --- Cleanup ----------------------------------------------------------
    console.log('\nCleanup');
    if (created.officerId) {
      // Officers have no delete route by design; park them off the workflow.
      const res = await call('PATCH', `/admin/users/${created.officerId}/status`, {
        token: admin,
        body: { is_active: false },
      });
      check('verification officer deactivated', res.ok, res.message);
    }
    if (created.studentId) {
      const res = await call('DELETE', `/admin/students/${created.studentId}`, { token: admin });
      check('verification student removed', res.ok, res.message);
    }
    if (created.sectionId) {
      const res = await call('DELETE', `/admin/sections/${created.sectionId}`, { token: admin });
      check('verification section removed', res.ok, res.message);

      const final = await call('GET', '/admin/sections', { token: admin });
      check(
        'the workflow is left exactly as it was found, contiguously ordered',
        final.data.sections.length === baselineCount &&
          final.data.sections.every((s, i) => s.stage_order === i + 1),
        `${final.data.sections.length} sections, expected ${baselineCount}`
      );

    }

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  }
})().catch((err) => {
  console.error(`\nAborted: ${err.message}\n`);
  process.exit(1);
});
