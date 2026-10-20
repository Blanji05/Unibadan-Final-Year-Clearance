import { useCallback, useEffect, useMemo, useState } from 'react';
import { officerApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { realtime } from '../../services/realtime';
import { saveBlob } from '../../services/download';
import { IconEye, IconFile, IconList, IconSearch, IconX } from '../../components/Icons';
import DocumentPreviewModal from '../../components/DocumentPreviewModal';
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

const QUICK_MESSAGE_TEMPLATES = [
  {
    title: 'Verification Follow-up',
    subject: 'Clearance Document Verification Note',
    text: 'Please be advised that your clearance record has been verified. Ensure you keep copies of all official documents and clearance slips for your academic file.',
  },
  {
    title: 'Document Update Required',
    subject: 'Action Required: Additional Documentation Requested',
    text: 'During our records review, an additional update or document replacement was identified as necessary. Please log into your clearance portal to review the remarks and update accordingly.',
  },
  {
    title: 'Physical Desk Notice',
    subject: 'Section Clearance Physical Verification Notice',
    text: 'Please visit the section office with your original credentials and physical receipts for routine verification and final clearance endorsement.',
  },
];

const QUICK_REVOKE_REASONS = [
  'Discrepancy identified in registry or section clearance record.',
  'Outstanding library book, equipment, or property unreturned.',
  'Uploaded receipt / payment could not be reconciled with records.',
  'Uploaded document image is illegible or credential needs verification.',
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
  const [successNotice, setSuccessNotice] = useState('');

  // Modals state
  const [messageStudent, setMessageStudent] = useState(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');

  const [revokeStudent, setRevokeStudent] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  // Document preview lightbox
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewDocList, setPreviewDocList] = useState([]);

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

  // Handle open message modal
  const openMessageModal = (row) => {
    setMessageStudent(row);
    setMessageSubject(`Clearance Notification: ${stage?.stage_name || 'Section Clearance'}`);
    setMessageBody('');
    setMessageError('');
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageBody.trim()) {
      setMessageError('Please enter a message for the student.');
      return;
    }
    setSendingMessage(true);
    setMessageError('');
    try {
      const res = await officerApi.sendMessage(messageStudent.student_id, {
        subject: messageSubject.trim(),
        message: messageBody.trim(),
        stage_id: messageStudent.stage_id || stage?.id,
      });
      setSuccessNotice(res.message || `Message sent successfully to ${messageStudent.full_name}.`);
      setMessageStudent(null);
      setTimeout(() => setSuccessNotice(''), 6000);
    } catch (err) {
      setMessageError(err.message || 'Failed to dispatch message.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle open revoke modal
  const openRevokeModal = (row) => {
    setRevokeStudent(row);
    setRevokeReason('');
    setRevokeError('');
  };

  const handleRevokeApproval = async (e) => {
    e.preventDefault();
    if (!revokeReason.trim() || revokeReason.trim().length < 5) {
      setRevokeError('Please provide a specific reason for revoking approval (at least 5 characters).');
      return;
    }
    setRevoking(true);
    setRevokeError('');
    try {
      const stageId = revokeStudent.stage_id || stage?.id;
      const res = await officerApi.revokeApproval(revokeStudent.student_id, stageId, revokeReason.trim());
      setSuccessNotice(
        res.message || `Clearance approval revoked for ${revokeStudent.full_name}. Student status set to Rejected and alerted.`
      );
      setRevokeStudent(null);
      load();
      setTimeout(() => setSuccessNotice(''), 6000);
    } catch (err) {
      setRevokeError(err.message || 'Failed to revoke clearance approval.');
    } finally {
      setRevoking(false);
    }
  };

  // Handle open preview
  const handlePreviewDocuments = (docs) => {
    if (!docs || !docs.length) return;
    setPreviewDoc(docs[0]);
    setPreviewDocList(docs);
  };

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
      {successNotice && <div className="notice notice-success">{successNotice}</div>}

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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={`${row.student_id}-${row.reviewed_at}`}>
                    <td>
                      <div>
                        <strong>{row.full_name}</strong>
                        {row.department && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.department}</div>
                        )}
                      </div>
                    </td>
                    <td className="mono">{row.matric_number}</td>
                    <td>{formatDate(row.submitted_at)}</td>
                    <td>{formatDate(row.reviewed_at)}</td>
                    <td className="cell-wrap">{row.remarks || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
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
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {row.documents && row.documents.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 7px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            onClick={() => handlePreviewDocuments(row.documents)}
                            title="Preview student uploaded documents"
                          >
                            <IconEye width={13} height={13} />
                            Docs ({row.documents.length})
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 7px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          onClick={() => openMessageModal(row)}
                          title="Send direct message / notice to student"
                        >
                          💬 Message
                        </button>
                        {row.status === 'approved' && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              padding: '2px 7px',
                              fontSize: '0.75rem',
                              color: '#dc2626',
                              borderColor: '#fca5a5',
                              background: '#fef2f2',
                            }}
                            onClick={() => openRevokeModal(row)}
                            title="Revoke / disapprove clearance with mandatory reasons"
                          >
                            ❌ Disapprove
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

      {/* Direct Message Modal */}
      {messageStudent && (
        <div className="doc-preview-backdrop" role="dialog" aria-modal="true">
          <div
            className="doc-preview-container"
            style={{ maxWidth: '580px', height: 'auto', maxHeight: '90vh' }}
          >
            <div className="doc-preview-header">
              <div className="doc-preview-title">
                <strong>💬 Send Message to Student</strong>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setMessageStudent(null)}
              >
                <IconX width={20} height={20} />
              </button>
            </div>

            <form onSubmit={handleSendMessage} style={{ padding: '1.25rem' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  Recipient: <strong>{messageStudent.full_name}</strong> ({messageStudent.matric_number})
                </div>
                {messageStudent.email && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Email: {messageStudent.email} · Phone: {messageStudent.phone_number || 'Registered'}
                  </div>
                )}
              </div>

              {messageError && <div className="error" style={{ marginBottom: '1rem' }}>{messageError}</div>}

              <div style={{ marginBottom: '0.85rem' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Subject:
                </label>
                <input
                  type="text"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="Subject line for email & alerts"
                  required
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Quick Templates:
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {QUICK_MESSAGE_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.title}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                      onClick={() => {
                        setMessageSubject(tmpl.subject);
                        setMessageBody(tmpl.text);
                      }}
                    >
                      {tmpl.title}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Message Content:
                </label>
                <textarea
                  rows={4}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Type your official message or instructions to the student..."
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
              </div>

              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  marginBottom: '1.25rem',
                }}
              >
                ⚡ <strong>Multi-Channel Dispatch:</strong> Message is delivered immediately to the student across In-App Notification, SMS, WhatsApp, and Official Email.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setMessageStudent(null)}
                  disabled={sendingMessage}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendingMessage || !messageBody.trim()}
                >
                  {sendingMessage ? 'Sending Alert...' : 'Send Message Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke / Disapprove Approval Modal */}
      {revokeStudent && (
        <div className="doc-preview-backdrop" role="dialog" aria-modal="true">
          <div
            className="doc-preview-container"
            style={{ maxWidth: '580px', height: 'auto', maxHeight: '90vh' }}
          >
            <div className="doc-preview-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <div className="doc-preview-title" style={{ color: '#991b1b' }}>
                <strong>⚠️ Disapprove & Revoke Clearance Approval</strong>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setRevokeStudent(null)}
              >
                <IconX width={20} height={20} />
              </button>
            </div>

            <form onSubmit={handleRevokeApproval} style={{ padding: '1.25rem' }}>
              <div
                style={{
                  background: '#fff1f2',
                  border: '1px solid #fecdd3',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  color: '#881337',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  Student: <strong>{revokeStudent.full_name}</strong> ({revokeStudent.matric_number})
                </div>
                <div style={{ marginTop: '0.4rem' }}>
                  Revoking approval will immediately transition clearance status to <strong>Rejected</strong>, invalidate any previously issued Section Clearance Slip, and alert the student with your mandatory feedback.
                </div>
              </div>

              {revokeError && <div className="error" style={{ marginBottom: '1rem' }}>{revokeError}</div>}

              <div style={{ marginBottom: '0.85rem' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Quick Disapproval Reasons:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {QUICK_REVOKE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', textAlign: 'left', padding: '4px 8px' }}
                      onClick={() => setRevokeReason(reason)}
                    >
                      • {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Mandatory Reason for Disapproval / Revocation:
                </label>
                <textarea
                  rows={4}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="State specifically why the approval is being revoked and what the student must correct or resubmit..."
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRevokeStudent(null)}
                  disabled={revoking}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  style={{ background: '#dc2626', borderColor: '#b91c1c', color: '#fff' }}
                  disabled={revoking || !revokeReason.trim()}
                >
                  {revoking ? 'Revoking Approval...' : 'Confirm Disapproval & Notify Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          docs={previewDocList}
          onClose={() => setPreviewDoc(null)}
          onSelectDoc={(d) => setPreviewDoc(d)}
        />
      )}
    </div>
  );
}
