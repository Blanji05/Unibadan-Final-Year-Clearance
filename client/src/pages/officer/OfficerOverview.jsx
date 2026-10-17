import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { officerApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { realtime } from '../../services/realtime';
import { IconCheck, IconClipboard, IconClock, IconInbox, IconX } from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, StatCard, StatusBadge, formatDate } from '../../components/Ui';

/**
 * Officer landing page.
 *
 * Answers "what needs my attention right now?" — queue size, how long the
 * oldest submission has waited, and what this section has decided recently —
 * then links out to the pages that do the actual work.
 */
export default function OfficerOverview() {
  const { user } = useAuth();
  const [stage, setStage] = useState(null);
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [requiredCount, setRequiredCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [queue, past, reqs] = await Promise.all([
        officerApi.pending(),
        officerApi.history(),
        officerApi.requirements(),
      ]);
      setStage(queue.stage || null);
      setPending(queue.requests || []);
      setHistory(past.history || []);
      setRequiredCount((reqs.requirements || []).filter((r) => r.is_required).length);
      setError('');
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
    const unsubStages = realtime.on('stages:update', () => load());
    const unsubDocs = realtime.on('documents:update', () => load());
    return () => {
      unsubQueue();
      unsubClear();
      unsubStages();
      unsubDocs();
    };
  }, [load]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const approved = history.filter((h) => h.status === 'approved').length;
  const rejected = history.filter((h) => h.status === 'rejected').length;

  // Submissions arrive oldest-first, so the head of the queue is the longest wait.
  const oldest = pending[0]?.submitted_at;
  const waitingDays = oldest
    ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000)
    : null;

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <section className="hero-card">
        <div>
          <p className="hero-eyebrow">
            {user?.department
              ? `Department Clearance • Faculty of ${user.faculty || 'UI'}`
              : user?.faculty
              ? `Faculty Clearance • ${user.faculty}`
              : user?.hall
              ? `Caution & Hall Clearance • ${user.hall}`
              : (stage?.stage_name || 'Clearance Section')}
          </p>
          <h1 style={{ marginBottom: '0.4rem' }}>
            {user?.department
              ? `Department of ${user.department}`
              : user?.faculty
              ? `Faculty of ${user.faculty.replace(/^Faculty of\s+/i, '')}`
              : user?.hall
              ? `${user.hall}`
              : (stage?.stage_name || `Welcome, ${user?.full_name?.split(' ')[0] || 'Officer'}`)}
          </h1>
          <p style={{ maxWidth: '680px' }}>
            {user?.department
              ? `Clearance portal for the Department of ${user.department}. Submissions from graduating students in this department appear directly in your review queue.`
              : user?.faculty
              ? `Clearance portal for the Faculty of ${user.faculty.replace(/^Faculty of\s+/i, '')}. Submissions from students across all departments in this faculty appear in your queue.`
              : user?.hall
              ? `Caution and Hall Clearance portal for ${user.hall}. Submissions from graduating students residing in ${user.hall} appear directly in your review queue.`
              : (stage?.description || 'Review graduating student clearance submissions and issue approvals in real time.')}
          </p>
          <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#e2e8f0' }}>
            {pending.length === 0
              ? '✅ Your review queue is currently clear — zero pending submissions.'
              : `⏳ ${pending.length} student submission${pending.length === 1 ? '' : 's'} waiting for your review.`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignSelf: 'flex-start' }}>
          {pending.length > 0 && (
            <Link to="/officer/queue" className="btn btn-primary">
              Review queue ({pending.length})
            </Link>
          )}
          <Link to="/officer/students" className="btn btn-secondary btn-sm" style={{ textAlign: 'center' }}>
            Student lookup
          </Link>
          <Link to="/officer/directory" className="btn btn-secondary btn-sm" style={{ textAlign: 'center' }}>
            Staff directory
          </Link>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard label="Awaiting review" value={pending.length} icon={IconInbox} />
        <StatCard
          label="Longest wait"
          value={waitingDays === null ? '—' : waitingDays === 0 ? 'Today' : `${waitingDays}d`}
          hint={oldest ? `Since ${formatDate(oldest)}` : 'No queue'}
          icon={IconClock}
        />
        <StatCard label="Approved" value={approved} tone="success" icon={IconCheck} />
        <StatCard label="Rejected" value={rejected} tone="danger" icon={IconX} />
      </div>

      <div className="grid-2">
        <div className="card">
          <SectionHeader
            title="Next in queue"
            description="Oldest submissions first"
            action={
              pending.length > 0 && (
                <Link to="/officer/queue" className="btn btn-secondary btn-sm">
                  View all
                </Link>
              )
            }
          />

          {pending.length === 0 ? (
            <EmptyState
              icon={IconCheck}
              title="All caught up"
              message="No students are waiting on your section right now."
            />
          ) : (
            <ul className="mini-list">
              {pending.slice(0, 5).map((req) => (
                <li key={req.clearance_status_id}>
                  <div>
                    <strong>{req.full_name}</strong>
                    <p className="mini-sub">
                      {req.matric_number} · {req.documents?.length || 0} document
                      {req.documents?.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="mini-meta">{formatDate(req.submitted_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <SectionHeader
            title="Document checklist"
            description="What your section asks students to upload"
            action={
              <Link to="/officer/requirements" className="btn btn-secondary btn-sm">
                Manage
              </Link>
            }
          />

          <div className="callout">
            <IconClipboard width={20} height={20} />
            <div>
              <strong>
                {requiredCount === 0
                  ? 'No documents requested'
                  : `${requiredCount} document${requiredCount === 1 ? '' : 's'} requested`}
              </strong>
              <p>
                {requiredCount === 0
                  ? 'Students can submit to your section without uploading anything. Add a requirement so you receive the paperwork you need.'
                  : 'Students upload these before they can submit to your section.'}
              </p>
            </div>
          </div>

          <SectionHeader title="Recent decisions" />
          {history.length === 0 ? (
            <EmptyState
              icon={IconClock}
              title="No decisions yet"
              message="Approvals and rejections you make in the Review Queue will appear here in real time."
            />
          ) : (
            <ul className="mini-list">
              {history.slice(0, 5).map((h, i) => (
                <li key={`${h.student_id}-${i}`}>
                  <div>
                    <strong>{h.full_name}</strong>
                    <p className="mini-sub">{h.matric_number}</p>
                  </div>
                  <StatusBadge status={h.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
