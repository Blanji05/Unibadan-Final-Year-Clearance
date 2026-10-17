import { useCallback, useEffect, useMemo, useState } from 'react';
import { officerApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { realtime } from '../../services/realtime';
import { saveBlob } from '../../services/download';
import { IconFile, IconList, IconSearch } from '../../components/Icons';
import {
  EmptyState,
  SectionHeader,
  SkeletonList,
  StatCard,
  StatusBadge,
  formatDate,
} from '../../components/Ui';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

/** Decisions this officer has already made for their section. */
export default function OfficerHistory() {
  const { user } = useAuth();
  const [stage, setStage] = useState(null);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleDownloadSlip = async (row) => {
    try {
      const stageId = row.stage_id || stage?.id;
      setDownloadingId(`${row.student_id}-${stageId}`);
      const blob = await officerApi.studentSlip(row.student_id, stageId);
      saveBlob(blob, `UI-Clearance-Slip-${row.matric_number}.pdf`);
    } catch (err) {
      setError(err.message || 'Failed to download slip');
    } finally {
      setDownloadingId(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await officerApi.history();
      setStage(data.stage || null);
      setHistory(data.history || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubClear = realtime.on('clearance:update', () => load());
    const unsubQueue = realtime.on('queue:update', () => load());
    return () => {
      unsubClear();
      unsubQueue();
    };
  }, [load]);

  const safeHistory = useMemo(() => (Array.isArray(history) ? history : []), [history]);
  const approved = useMemo(() => safeHistory.filter((h) => h.status === 'approved').length, [safeHistory]);
  const rejected = useMemo(() => safeHistory.filter((h) => h.status === 'rejected').length, [safeHistory]);

  const visible = useMemo(() => {
    let list = filter === 'all' ? safeHistory : safeHistory.filter((h) => h.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (h) =>
          h.full_name?.toLowerCase().includes(q) ||
          h.matric_number?.toLowerCase().includes(q) ||
          h.department?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [safeHistory, filter, search]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <div className="stat-grid">
        <StatCard label="Total processed" value={safeHistory.length} icon={IconList} />
        <StatCard label="Approved" value={approved} tone="success" />
        <StatCard label="Rejected" value={rejected} tone={rejected ? 'danger' : 'default'} />
      </div>

      <div className="card">
        {user?.department ? (
          <div
            style={{
              background: '#fef7ee',
              border: '1px solid #e6decb',
              color: '#78350f',
              padding: '0.6rem 0.9rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontWeight: 500,
            }}
          >
            📍 <strong>Department History Scope:</strong> {user.department}
          </div>
        ) : user?.faculty ? (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              padding: '0.6rem 0.9rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontWeight: 500,
            }}
          >
            📍 <strong>Faculty History Scope:</strong> Faculty of {user.faculty.replace(/^Faculty of\s+/i, '')}
          </div>
        ) : user?.hall ? (
          <div
            style={{
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              padding: '0.6rem 0.9rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontWeight: 500,
            }}
          >
            🏛️ <strong>Hall of Residence History Scope:</strong> {user.hall}
          </div>
        ) : null}

        <SectionHeader
          title={
            user?.department
              ? `Department of ${user.department} — Decision History`
              : user?.faculty
              ? `Faculty of ${user.faculty.replace(/^Faculty of\s+/i, '')} — Decision History`
              : user?.hall
              ? `${user.hall} — Caution & Hall Decision History`
              : (stage ? `${stage.stage_name} review history` : 'Review history')
          }
          description="Log of real-time decisions recorded for graduating students"
        />

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: '0.75rem 0 1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search past decisions by student name or matric number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          {search && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSearch('')}
            >
              Clear
            </button>
          )}
        </div>

        <div className="tab-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`tab${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="tab-count">
                {f.key === 'all' ? history.length : f.key === 'approved' ? approved : rejected}
              </span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={IconList}
            title={history.length === 0 ? 'No clearance decisions recorded yet' : 'No matching records'}
            message={
              history.length === 0
                ? 'This section operates in real time. Once you review and approve or reject student submissions from the Review Queue, they will appear here automatically.'
                : 'Try a different filter or search term.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Matric number</th>
                  <th>Submitted</th>
                  <th>Reviewed</th>
                  <th>Remarks</th>
                  <th>Decision / Slip</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={`${row.student_id}-${row.reviewed_at}`}>
                    <td>{row.full_name}</td>
                    <td className="mono">{row.matric_number}</td>
                    <td>{formatDate(row.submitted_at)}</td>
                    <td>{formatDate(row.reviewed_at)}</td>
                    <td className="cell-wrap">{row.remarks || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <StatusBadge status={row.status} />
                        {row.status === 'approved' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            onClick={() => handleDownloadSlip(row)}
                            disabled={downloadingId === `${row.student_id}-${row.stage_id || stage?.id}`}
                            title="Download official signed section clearance slip"
                          >
                            <IconFile width={12} height={12} />
                            {downloadingId === `${row.student_id}-${row.stage_id || stage?.id}` ? '...' : 'Slip'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
