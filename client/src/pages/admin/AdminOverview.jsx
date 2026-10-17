import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { realtime } from '../../services/realtime';
import {
  IconAward,
  IconCard,
  IconCheck,
  IconClipboard,
  IconClock,
  IconInbox,
  IconPlus,
  IconUsers,
} from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, StatCard, formatDate } from '../../components/Ui';

/** ₦ with thousands separators, no decimals — amounts here are whole naira. */
const naira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/** Turn `create_section` into `Create section` for the activity feed. */
const humanise = (action) => {
  const text = String(action).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Administrator landing page.
 *
 * Ordered by decreasing urgency: what is broken or waiting first, then the
 * system-wide totals, then the per-stage detail. The bottleneck panel is the
 * reason this page exists — it names the specific sections holding students up,
 * which is the finding the project set out to make visible.
 */
export default function AdminOverview() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [students, setStudents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [statsResult, studentsResult, logResult] = await Promise.allSettled([
        adminApi.analytics(),
        adminApi.students({ limit: 50 }),
        adminApi.activity(8),
      ]);
      if (statsResult.status === 'fulfilled') setAnalytics(statsResult.value);
      if (studentsResult.status === 'fulfilled') setStudents(studentsResult.value);
      if (logResult.status === 'fulfilled') setActivity(logResult.value);

      if (statsResult.status === 'rejected') {
        setError(statsResult.reason?.message || 'Failed to load analytics');
      } else {
        setError('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubQueue = realtime.on('queue:update', () => load());
    const unsubClear = realtime.on('clearance:update', () => load());
    const unsubPay = realtime.on('payment:update', () => load());
    const unsubStages = realtime.on('stages:update', () => load());
    const unsubUsers = realtime.on('users:update', () => load());
    return () => {
      unsubQueue();
      unsubClear();
      unsubPay();
      unsubStages();
      unsubUsers();
    };
  }, [load]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={5} />
      </div>
    );
  }

  const totals = analytics?.totals || {};
  const byStage = analytics?.by_stage || [];

  // MySQL returns aggregate counts as strings; coerce once here.
  const stages = byStage.map((s) => ({
    ...s,
    not_started: Number(s.not_started || 0),
    pending: Number(s.pending || 0),
    approved: Number(s.approved || 0),
    rejected: Number(s.rejected || 0),
  }));

  const pendingTotal = stages.reduce((sum, s) => sum + s.pending, 0);
  const rejectedTotal = stages.reduce((sum, s) => sum + s.rejected, 0);

  // Sections with a queue, worst first — the actual bottlenecks.
  const bottlenecks = stages.filter((s) => s.pending > 0).sort((a, b) => b.pending - a.pending);

  // Students who have started but not finished, ranked by how far along they are.
  const inProgress = students
    .map((s) => ({
      ...s,
      approved: Number(s.approved_stages || 0),
      total: Number(s.total_stages || 0),
    }))
    .filter((s) => s.approved > 0 && s.approved < s.total)
    .sort((a, b) => b.approved - a.approved);

  const cleared = Number(totals.fully_cleared || 0);
  const totalStudents = Number(totals.total_students || 0);
  const clearedPercent = totalStudents ? Math.round((cleared / totalStudents) * 100) : 0;

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <section className="hero-card">
        <div>
          <p className="hero-eyebrow">System administration</p>
          <h1>Welcome back, {user?.full_name?.split(' ')[0] || 'Admin'}</h1>
          <p>
            {pendingTotal === 0
              ? 'No submissions are waiting on any section right now.'
              : `${pendingTotal} submission${pendingTotal === 1 ? '' : 's'} waiting across ${
                  bottlenecks.length
                } section${bottlenecks.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Link to="/admin/students" className="btn btn-primary">
          Manage students
        </Link>
      </section>

      {/* 1. Headline figures ------------------------------------------------ */}
      <div className="stat-grid">
        <StatCard label="Students" value={totalStudents} icon={IconUsers} />
        <StatCard
          label="Fully cleared"
          value={cleared}
          hint={`${clearedPercent}% of students`}
          tone="success"
          icon={IconCheck}
        />
        <StatCard label="Awaiting review" value={pendingTotal} icon={IconInbox} />
        <StatCard label="Clearance letters issued" value={Number(totals.certificates_issued || 0)} icon={IconAward} />
        <StatCard label="Fees collected" value={naira(totals.total_collected)} icon={IconCard} />
        <StatCard
          label="Rejected submissions"
          value={rejectedTotal}
          hint={rejectedTotal ? 'Students must re-submit' : 'None outstanding'}
          tone={rejectedTotal ? 'danger' : 'default'}
          icon={IconClock}
        />
      </div>

      {/* 2. What needs attention ------------------------------------------- */}
      <div className="grid-2">
        <div className="card">
          <SectionHeader
            title="Where students are waiting"
            description="Sections with a review queue, longest first"
            action={
              <Link to="/admin/sections" className="btn btn-secondary btn-sm">
                Configure
              </Link>
            }
          />

          {bottlenecks.length === 0 ? (
            <EmptyState
              icon={IconCheck}
              title="No bottlenecks"
              message="Every section has cleared its queue."
            />
          ) : (
            <ul className="mini-list">
              {bottlenecks.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.stage_name}</strong>
                    <p className="mini-sub">
                      {s.pending} waiting
                      {s.avg_review_hours != null &&
                        ` · averages ${Number(s.avg_review_hours).toFixed(1)}h to decide`}
                    </p>
                  </div>
                  <span className="mini-meta">{s.approved} approved</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <SectionHeader title="Recent activity" description="Audited administrative actions" />

          {activity.length === 0 ? (
            <EmptyState
              icon={IconClipboard}
              title="Nothing logged yet"
              message="Overrides, account changes and section edits appear here."
            />
          ) : (
            <ul className="mini-list">
              {activity.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{humanise(entry.action)}</strong>
                    <p className="mini-sub">{entry.actor_name || 'System'}</p>
                  </div>
                  <span className="mini-meta">{formatDate(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 3. Per-stage detail ------------------------------------------------ */}
      <div className="card">
        <SectionHeader
          title="Clearance funnel"
          description="How students are distributed across the workflow, in stage order"
        />

        {stages.length === 0 ? (
          <EmptyState
            icon={IconClipboard}
            title="No sections configured"
            message="Add a clearance section to start the workflow."
            action={
              <Link to="/admin/sections" className="btn btn-primary btn-sm">
                Add a section
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Section</th>
                  <th>Distribution</th>
                  <th>Pending</th>
                  <th>Approved</th>
                  <th>Rejected</th>
                  <th>Avg. review</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => {
                  const total = s.not_started + s.pending + s.approved + s.rejected || 1;
                  return (
                    <tr key={s.id}>
                      <td className="cell-muted">{s.stage_order}</td>
                      <td>
                        <strong>{s.stage_name}</strong>
                      </td>
                      <td>
                        {/* Stacked bar: proportions read faster than four numbers. */}
                        <div className="funnel-bar" title={`${s.approved} approved of ${total}`}>
                          <span className="funnel-approved" style={{ width: `${(s.approved / total) * 100}%` }} />
                          <span className="funnel-pending" style={{ width: `${(s.pending / total) * 100}%` }} />
                          <span className="funnel-rejected" style={{ width: `${(s.rejected / total) * 100}%` }} />
                        </div>
                      </td>
                      <td>{s.pending || '—'}</td>
                      <td>{s.approved || '—'}</td>
                      <td>{s.rejected || '—'}</td>
                      <td className="cell-muted">
                        {s.avg_review_hours == null ? '—' : `${Number(s.avg_review_hours).toFixed(1)}h`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Students mid-clearance ------------------------------------------ */}
      <div className="card">
        <SectionHeader
          title="Students in progress"
          description="Started but not yet fully cleared, furthest along first"
          action={
            <Link to="/admin/students" className="btn btn-secondary btn-sm">
              View all {students.length}
            </Link>
          }
        />

        {inProgress.length === 0 ? (
          <EmptyState
            icon={IconUsers}
            title="No clearance underway"
            message={
              totalStudents === 0
                ? 'No students have been registered yet.'
                : 'No student has started their clearance.'
            }
            action={
              <Link to="/admin/students" className="btn btn-primary btn-sm">
                <IconPlus width={15} height={15} />
                Add a student
              </Link>
            }
          />
        ) : (
          <ul className="mini-list">
            {inProgress.slice(0, 6).map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.full_name}</strong>
                  <p className="mini-sub">
                    {s.matric_number}
                    {s.department ? ` · ${s.department}` : ''}
                  </p>
                </div>
                <span className="mini-meta">
                  {s.approved}/{s.total} cleared
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
