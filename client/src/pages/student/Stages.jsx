import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../services/api';
import { redirectToCheckout } from '../../services/checkout';
import { saveBlob } from '../../services/download';
import { realtime } from '../../services/realtime';
import { IconCard, IconChevronRight, IconClipboard, IconFile, IconLock } from '../../components/Icons';
import { SectionHeader, SkeletonList, StatusBadge } from '../../components/Ui';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'pending', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved' },
  { key: 'locked', label: 'Locked' },
];

/**
 * Clearance Stages List
 *
 * Displays all clearance stages with status and direct "Get Cleared" navigation
 * buttons to each stage's dedicated clearance page.
 */
export default function Stages() {
  const [stages, setStages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [docStages, setDocStages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [payingStageId, setPayingStageId] = useState(null);
  const [downloadingSlipId, setDownloadingSlipId] = useState(null);
  const [profileStatus, setProfileStatus] = useState({ complete: true, missing: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [status, pays, docs] = await Promise.all([
      studentApi.clearanceStatus(),
      studentApi.payments(),
      studentApi.documentsByStage(),
    ]);
    setStages(status.stages || []);
    setProfileStatus({
      complete: status.profile_complete !== false,
      missing: status.missing_profile_fields || [],
    });
    setPayments(pays || []);
    setDocStages(docs || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();

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

  const receiptFor = (stageId) =>
    payments.find((p) => p.stage_id === stageId && p.status === 'success');

  const handlePay = async (stage) => {
    setError('');
    setNotice('');
    setPayingStageId(stage.stage_id);

    try {
      setBusy(true);
      const res = await studentApi.pay(stage.stage_id);
      if (redirectToCheckout(res)) return;
      setNotice(res.message || 'Payment processed successfully.');
      await load();
    } catch (err) {
      setError(err.message || 'Payment initiation failed');
    } finally {
      setBusy(false);
      setPayingStageId(null);
    }
  };

  const handleDownloadSlip = async (stage) => {
    setError('');
    setNotice('');
    try {
      setDownloadingSlipId(stage.stage_id);
      const blob = await studentApi.clearanceSlip(stage.stage_id);
      const cleanName = (stage.stage_name || 'stage').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      saveBlob(blob, `UI-Clearance-Slip-${cleanName}.pdf`);
    } catch (err) {
      setError(err.message || 'Failed to download clearance slip');
    } finally {
      setDownloadingSlipId(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={6} />
      </div>
    );
  }

  const counts = {
    all: stages.length,
    available: stages.filter(
      (s) => s.prerequisites_met && s.status !== 'approved' && s.status !== 'pending'
    ).length,
    pending: stages.filter((s) => s.status === 'pending').length,
    approved: stages.filter((s) => s.status === 'approved').length,
    locked: stages.filter((s) => !s.prerequisites_met && s.status !== 'approved').length,
  };

  const visible = stages.filter((stage) => {
    if (filter === 'all') return true;
    if (filter === 'approved') return stage.status === 'approved';
    if (filter === 'pending') return stage.status === 'pending';
    if (filter === 'locked') return !stage.prerequisites_met && stage.status !== 'approved';
    return stage.prerequisites_met && stage.status !== 'approved' && stage.status !== 'pending';
  });

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {!profileStatus.complete && (
        <div className="notice notice-warn" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb', padding: '1.25rem', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <strong style={{ fontSize: '1rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Mandatory Action: Complete Your Profile Before Starting Clearance
              </strong>
              <p style={{ margin: '0.35rem 0 0', color: '#78350f', fontSize: '0.88rem', lineHeight: 1.5 }}>
                To enable automatic <strong>SMS</strong>, <strong>WhatsApp</strong>, and <strong>Email</strong> clearance alerts and generate your verified clearance slips, you must complete your contact profile and upload your passport photograph.
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

      <div className="card">
        <SectionHeader
          title="Clearance stages"
          description="Click Get Cleared on any stage to upload requirements, settle fees, and obtain clearance"
        />

        <div className="tab-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`tab${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="tab-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <ul className="stage-list">
          {visible.map((stage) => {
            const needsPayment = stage.requires_payment && !stage.payment_settled;
            const locked = !stage.prerequisites_met;
            const receipt = receiptFor(stage.stage_id);

            const stageDocs = docStages.find((d) => d.stage_id === stage.stage_id);
            const reqs = stageDocs?.required_documents || [];
            const uploadedCount = reqs.filter((r) => (r.documents || []).length > 0).length;
            const totalCount = reqs.length;
            const mandatoryCount = reqs.filter((r) => r.is_mandatory).length;
            const mandatoryUploadedCount = reqs.filter(
              (r) => r.is_mandatory && (r.documents || []).length > 0
            ).length;
            const allUploaded = totalCount > 0 && uploadedCount === totalCount;
            const mandatoryMet = mandatoryCount === mandatoryUploadedCount;

            return (
              <li key={stage.stage_id} className="stage-item">
                <div className="stage-row">
                  <div className="stage-main">
                    <span className={`stage-num${stage.status === 'approved' ? ' done' : ''}`}>
                      {stage.stage_order}
                    </span>
                    <div>
                      <strong>{stage.stage_name}</strong>
                      {stage.assigned_officer && (
                        <p className="stage-officer-hint" style={{ fontSize: '0.8rem', color: '#0284c7', margin: '2px 0' }}>
                          👤 Assigned Officer: {stage.assigned_officer.name}
                        </p>
                      )}

                      {stage.remarks && (
                        <p className={stage.status === 'rejected' ? 'stage-note bad' : 'stage-note'}>
                          {stage.status === 'rejected' ? 'Reason: ' : 'Note: '}
                          {stage.remarks}
                        </p>
                      )}

                      {stage.status !== 'approved' && locked && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px 10px', marginTop: '6px' }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <IconLock width={13} height={13} /> Sequential Order Enforced — Clearance Locked
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#991b1b' }}>
                            Requires previous approval for:{' '}
                            <strong>
                              {(stage.prerequisite_details || [])
                                .filter((p) => !p.is_approved)
                                .map((p) => p.stage_name)
                                .join(', ') || 'Earlier clearance stages'}
                            </strong>
                          </p>
                        </div>
                      )}

                      {stage.status !== 'approved' && !locked && needsPayment && (
                        <p className="stage-note warn">Payment required before you can submit</p>
                      )}

                      {stage.requires_payment && receipt && (
                        <p className="stage-note good">
                          Fee paid — ₦{Number(receipt.amount).toLocaleString()} · ref {receipt.reference}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="stage-actions">
                    <StatusBadge status={stage.status} />

                    {needsPayment && stage.status !== 'approved' && !locked && (
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => handlePay(stage)}
                        disabled={busy || payingStageId === stage.stage_id}
                        title="Pay clearance fee via Paystack"
                      >
                        <IconCard width={14} height={14} />
                        {payingStageId === stage.stage_id
                          ? 'Processing...'
                          : `Pay ₦${Number(stage.payment_amount || 0).toLocaleString()}`}
                      </button>
                    )}

                    {/* Dedicated clearance actions */}
                    {stage.status === 'approved' ? (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleDownloadSlip(stage)}
                          disabled={downloadingSlipId === stage.stage_id}
                          title="Download official signed Section Clearance Slip"
                        >
                          <IconFile width={14} height={14} />
                          {downloadingSlipId === stage.stage_id ? 'Downloading...' : 'Slip'}
                        </button>
                        <Link
                          to={`/student/stages/${stage.stage_id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          View
                        </Link>
                      </div>
                    ) : stage.status === 'pending' ? (
                      <Link
                        to={`/student/stages/${stage.stage_id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Check Status
                      </Link>
                    ) : stage.status === 'rejected' ? (
                      <Link
                        to={`/student/stages/${stage.stage_id}`}
                        className="btn btn-danger btn-sm"
                      >
                        Fix & Get Cleared <IconChevronRight width={14} height={14} />
                      </Link>
                    ) : locked ? (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span
                          className="btn btn-secondary btn-sm"
                          style={{
                            opacity: 0.75,
                            cursor: 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#f1f5f9',
                            color: '#64748b',
                            borderColor: '#cbd5e1',
                          }}
                          title="Clearance locked: Complete prerequisite clearance stages first"
                        >
                          <IconLock width={13} height={13} /> Locked
                        </span>
                        <Link
                          to={`/student/stages/${stage.stage_id}`}
                          className="btn btn-secondary btn-sm"
                          title="View required prerequisite clearance stages"
                        >
                          View
                        </Link>
                      </div>
                    ) : (
                      <Link
                        to={`/student/stages/${stage.stage_id}`}
                        className="btn btn-primary btn-sm"
                      >
                        Get Cleared <IconChevronRight width={14} height={14} />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Per-Section Required Documents Display */}
                <div className="stage-requirements-box">
                  <div className="stage-requirements-header">
                    <div className="stage-requirements-title-group">
                      <IconClipboard width={14} height={14} />
                      <span className="stage-requirements-title">Required Documents</span>
                      <span className="stage-requirements-count-badge">
                        {totalCount > 0 ? `${uploadedCount}/${totalCount} uploaded` : 'None required'}
                      </span>
                    </div>
                    {totalCount > 0 && (
                      <div className="stage-requirements-status-indicator">
                        {allUploaded ? (
                          <span className="stage-req-badge-complete">✓ All Requirements Uploaded</span>
                        ) : mandatoryMet ? (
                          <span className="stage-req-badge-ready">✓ Mandatory Ready</span>
                        ) : (
                          <span className="stage-req-badge-pending">
                            {mandatoryCount - mandatoryUploadedCount} required missing
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {totalCount > 0 ? (
                    <div className="stage-requirements-grid">
                      {reqs.map((req) => {
                        const isUploaded = (req.documents || []).length > 0;
                        return (
                          <Link
                            key={req.document_type_id}
                            to={`/student/stages/${stage.stage_id}`}
                            className={`stage-req-item ${isUploaded ? 'item-uploaded' : 'item-missing'}`}
                            title={`Click to snap or upload: ${req.label}`}
                          >
                            <div className="stage-req-item-left">
                              <span
                                className={`stage-req-bullet ${
                                  isUploaded ? 'bullet-done' : 'bullet-todo'
                                }`}
                              >
                                {isUploaded ? '✓' : '•'}
                              </span>
                              <span className="stage-req-label">{req.label}</span>
                              {req.is_mandatory ? (
                                <span className="stage-req-tag tag-mandatory">Required</span>
                              ) : (
                                <span className="stage-req-tag tag-optional">Optional</span>
                              )}
                            </div>
                            <div className="stage-req-item-right">
                              {isUploaded ? (
                                <span className="stage-req-status-text text-uploaded">
                                  Uploaded ({req.documents.length})
                                </span>
                              ) : (
                                <span className="stage-req-status-text text-missing">
                                  Not uploaded
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="stage-requirements-empty">
                      No specific documents required for this section.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {visible.length === 0 && (
          <p className="muted-center">No stages match this filter.</p>
        )}
      </div>
    </div>
  );
}
