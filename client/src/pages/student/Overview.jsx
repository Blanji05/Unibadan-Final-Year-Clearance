import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { realtime } from '../../services/realtime';
import {
  IconAward,
  IconCheck,
  IconClock,
  IconFile,
  IconLock,
  IconUpload,
} from '../../components/Icons';
import {
  EmptyState,
  ProgressBar,
  SectionHeader,
  SkeletonList,
  StatCard,
  StatusBadge,
  formatDate,
} from '../../components/Ui';

/**
 * Landing page for students: where things stand at a glance, plus what to do
 * next. Detailed per-stage work lives on the Stages tab.
 */
export default function Overview() {
  const { user } = useAuth();
  const [stages, setStages] = useState([]);
  const [progress, setProgress] = useState(null);
  const [profileStatus, setProfileStatus] = useState({ complete: true, missing: [] });
  const [docStages, setDocStages] = useState([]);
  const [timeline, setTimeline] = useState({ deadline: null, reminders: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [status, docs] = await Promise.all([
        studentApi.clearanceStatus(),
        studentApi.documentsByStage(),
      ]);
      setStages(status.stages || []);
      setProgress(status.progress || null);
      setProfileStatus({
        complete: status.profile_complete !== false,
        missing: status.missing_profile_fields || [],
      });
      setDocStages(docs || []);
      // The timeline is a nicety: if it fails the rest of the page still works.
      try {
        const t = await studentApi.timeline();
        setTimeline({
          deadline: t.deadline || null,
          reminders: t.reminders || [],
          events: t.events || [],
        });
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubClear = realtime.on('clearance:update', () => load());
    const unsubPay = realtime.on('payment:update', () => load());
    const unsubStages = realtime.on('stages:update', () => load());
    const unsubDocs = realtime.on('documents:update', () => load());
    return () => {
      unsubClear();
      unsubPay();
      unsubStages();
      unsubDocs();
    };
  }, [load]);

  if (loading) {
    return (
      <div className="stack">
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card skeleton-card" key={i} />
          ))}
        </div>
        <div className="card">
          <SkeletonList rows={4} />
        </div>
      </div>
    );
  }

  const approved = progress?.approved ?? stages.filter((s) => s.status === 'approved').length;
  const total = progress?.total ?? stages.length;
  const pending = stages.filter((s) => s.status === 'pending').length;
  const rejected = stages.filter((s) => s.status === 'rejected').length;
  const uploaded = docStages.reduce((sum, s) => sum + (s.uploaded_count || 0), 0);

  // What the student can act on right now: unlocked, not yet approved, not
  // already awaiting review.
  const actionable = stages.filter(
    (s) => s.prerequisites_met && s.status !== 'approved' && s.status !== 'pending'
  );

  const recent = [...stages]
    .filter((s) => s.status !== 'not_started' && s.updated_at)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  const allDone = total > 0 && approved === total;

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <div className="hero-card">
        <div>
          <h1>Welcome back, {user?.full_name?.split(' ')[0] || 'student'}</h1>
          <p>
            {allDone
              ? 'Every stage is approved — your clearance letter is ready to download.'
              : `You have ${total - approved} of ${total} stages left to complete.`}
          </p>
        </div>
        {allDone ? (
          <Link to="/student/certificate" className="btn btn-light">
            <IconAward width={16} height={16} /> Download letter
          </Link>
        ) : (
          <Link to={profileStatus.complete ? '/student/stages' : '/student/profile'} className="btn btn-light">
            {profileStatus.complete ? 'Continue clearance' : 'Complete Profile First'}
          </Link>
        )}
      </div>

      {!profileStatus.complete && (
        <div className="notice notice-warn" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb', padding: '1.25rem', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <strong style={{ fontSize: '1rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Mandatory Action: Complete Your Profile Before Starting Clearance
              </strong>
              <p style={{ margin: '0.35rem 0 0', color: '#78350f', fontSize: '0.88rem', lineHeight: 1.5 }}>
                To enable automatic <strong>SMS</strong>, <strong>WhatsApp</strong>, and <strong>Email</strong> clearance notifications and generate your verified clearance slips, you must complete your contact profile and upload your passport photograph.
              </p>
              {profileStatus.missing.length > 0 && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#b45309' }}>
                  Required: <strong>{profileStatus.missing.join(', ')}</strong>
                </div>
              )}
            </div>
            <Link to="/student/profile" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              Complete Profile Now &rarr;
            </Link>
          </div>
        </div>
      )}

      {timeline.reminders.length > 0 && (
        <div className="reminder-list" role="status">
          {timeline.reminders.map((r, i) => (
            <div key={`${r.type}-${i}`} className={`reminder reminder-${r.severity || 'info'}`}>
              {r.message}
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Approved" value={`${approved}/${total}`} tone="success" icon={IconCheck} />
        <StatCard label="Awaiting review" value={pending} tone="warning" icon={IconClock} />
        <StatCard
          label="Needs attention"
          value={rejected}
          tone={rejected ? 'danger' : 'default'}
          icon={IconLock}
        />
        <StatCard label="Documents uploaded" value={uploaded} icon={IconFile} />
      </div>

      <div className="card">
        <SectionHeader
          title="Overall progress"
          description="Stages are approved by each section officer in turn"
        />
        <ProgressBar value={approved} total={total} />
      </div>

      <div className="grid-2">
        <div className="card">
          <SectionHeader
            title="What to do next"
            description="Stages you can work on right now"
            action={
              <Link to="/student/stages" className="btn btn-secondary btn-sm">
                View all
              </Link>
            }
          />

          {actionable.length === 0 ? (
            <EmptyState
              icon={IconCheck}
              title={allDone ? 'All stages approved' : 'Nothing to action'}
              message={
                allDone
                  ? 'Head to the Clearance Letter tab to download your clearance letter.'
                  : 'Every unlocked stage is already awaiting review. Check back once an officer responds.'
              }
            />
          ) : (
            <ul className="mini-list">
              {actionable.slice(0, 5).map((stage) => (
                <li key={stage.stage_id}>
                  <div>
                    <strong>
                      {stage.stage_order}. {stage.stage_name}
                    </strong>
                    <p className="mini-meta">{stage.requires_payment && !stage.payment_settled ? 'Fee payment & upload required' : 'Upload requirements online'}</p>
                  </div>
                  <Link to={`/student/stages/${stage.stage_id}`} className="btn btn-primary btn-sm">
                    {stage.status === 'rejected' ? 'Fix' : 'Get Cleared'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <SectionHeader title="Recent activity" description="Latest updates on your stages" />

          {recent.length === 0 ? (
            <EmptyState
              icon={IconUpload}
              title="No activity yet"
              message="Once you submit your first stage, updates will appear here."
              action={
                <Link to="/student/stages" className="btn btn-primary btn-sm">
                  Start clearance
                </Link>
              }
            />
          ) : (
            <ul className="mini-list">
              {recent.map((stage) => (
                <li key={stage.stage_id}>
                  <div>
                    <strong>{stage.stage_name}</strong>
                    <p>{formatDate(stage.updated_at)}</p>
                  </div>
                  <StatusBadge status={stage.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <SectionHeader
          title="Clearance timeline"
          description={
            timeline.deadline
              ? `Deadline: ${formatDate(timeline.deadline.date)}`
              : 'Everything that has happened on your account'
          }
        />
        {timeline.events.length === 0 ? (
          <EmptyState
            icon={IconClock}
            title="Nothing yet"
            message="Submissions, decisions and payments will be listed here."
          />
        ) : (
          <ol className="timeline">
            {timeline.events.map((ev, i) => (
              <li key={`${ev.type}-${ev.at}-${i}`} className={`timeline-item timeline-${ev.type}`}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <strong>{ev.title}</strong>
                  {ev.detail && <p className="timeline-detail">{ev.detail}</p>}
                  <span className="mini-meta">{formatDate(ev.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
