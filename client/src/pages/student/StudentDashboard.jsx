import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi, systemApi } from '../../services/api';
import { redirectToCheckout } from '../../services/checkout';
import DocumentRequirements from '../../components/DocumentRequirements';

export default function StudentDashboard() {
  const [stages, setStages] = useState([]);
  const [progress, setProgress] = useState(null);
  const [docStages, setDocStages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentMode, setPaymentMode] = useState(null);
  const [openStageId, setOpenStageId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [status, docs, pays] = await Promise.all([
      studentApi.clearanceStatus(),
      studentApi.documentsByStage(),
      studentApi.payments(),
    ]);
    setStages(status.stages || []);
    setProgress(status.progress || null);
    setDocStages(docs);
    setPayments(pays || []);
  }, []);

  // Whether real Remita checkout is wired up. Without this the "payment"
  // settles instantly with no redirect, which looks broken unless we say so.
  useEffect(() => {
    systemApi
      .health()
      .then((h) => setPaymentMode(h.payments))
      .catch(() => setPaymentMode(null));
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
  }, [load]);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Document requirements for a stage, with the student's uploads attached.
  const docsForStage = (stageId) =>
    docStages.find((d) => d.stage_id === stageId)?.required_documents || [];

  // The settled receipt for a stage, so a paid fee shows proof rather than the
  // Pay button simply disappearing with nothing in its place.
  const receiptFor = (stageId) =>
    payments.find((p) => p.stage_id === stageId && p.status === 'success');

  const handleSubmit = async (stage) => {
    setError('');
    setNotice('');

    // Everything the student uploaded against this stage's requirements is what
    // gets attached to the submission.
    const documentIds = docsForStage(stage.stage_id).flatMap((req) =>
      (req.documents || []).map((d) => d.id)
    );

    try {
      setBusy(true);
      const res = await studentApi.submitStage(stage.stage_id, documentIds, null);
      setNotice(res.message || `${stage.stage_name} submitted.`);
      setOpenStageId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async (stage) => {
    setError('');
    setNotice('');
    try {
      setBusy(true);
      const res = await studentApi.pay(stage.stage_id);
      // With Paystack configured the API returns an authorization URL; without it the
      // payment is simulated server-side and we just refresh.
      if (redirectToCheckout(res)) return;
      setNotice(
        res.simulated
          ? 'Demo mode: payment recorded without a real charge.'
          : res.message || 'Payment recorded.'
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-loading">Loading clearance status…</div>;

  const approved = progress?.approved ?? stages.filter((s) => s.status === 'approved').length;
  const total = progress?.total ?? stages.length;
  const percent = total ? Math.round((approved / total) * 100) : 0;

  return (
    <div>
      <div className="dashboard-header">
        <h1>My Clearance Progress</h1>
        <p>Upload documents and submit each stage for approval</p>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {paymentMode === 'simulated' && (
        <div className="banner-warning">
          <strong>Demo payment mode.</strong> Paystack test mode is active — clicking Pay settles
          the fee instantly for testing.
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: '0.5rem' }}>Overall Progress</h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          {approved} of {total} stages approved ({percent}%)
        </p>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        {approved === total && total > 0 && (
          <p style={{ marginTop: '1rem' }}>
            All stages approved — <Link to="/student/certificate">download your clearance letter</Link>.
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem' }}>Clearance Stages</h2>
        <ul className="stage-list">
          {stages.map((stage) => {
            const isOpen = openStageId === stage.stage_id;
            const needsPayment = stage.requires_payment && !stage.payment_settled;
            const requirements = docsForStage(stage.stage_id);
            const mandatoryMissing = requirements.filter(
              (r) => r.is_mandatory && (r.documents || []).length === 0
            );
            const locked = !stage.prerequisites_met;
            const receipt = receiptFor(stage.stage_id);

            return (
              <li key={stage.stage_id} className="stage-item stage-item-column">
                <div className="stage-row">
                  <div style={{ flex: 1 }}>
                    <strong>
                      {stage.stage_order}. {stage.stage_name}
                    </strong>
                    {stage.remarks && (
                      <p
                        style={{
                          fontSize: '0.9rem',
                          margin: '0.3rem 0 0',
                          color: stage.status === 'rejected' ? '#c00' : '#555',
                        }}
                      >
                        {stage.status === 'rejected' ? 'Reason: ' : 'Note: '}
                        {stage.remarks}
                      </p>
                    )}
                    {stage.status !== 'approved' && locked && (
                      <p style={{ fontSize: '0.85rem', color: '#999', margin: '0.3rem 0 0' }}>
                        Locked until earlier stages are approved
                      </p>
                    )}
                    {stage.status !== 'approved' && !locked && needsPayment && (
                      <p style={{ fontSize: '0.85rem', color: '#cc7a00', margin: '0.3rem 0 0' }}>
                        Payment required before you can submit
                      </p>
                    )}
                    {stage.requires_payment && receipt && (
                      <p style={{ fontSize: '0.85rem', color: '#2e7d32', margin: '0.3rem 0 0' }}>
                        Fee paid — ₦{Number(receipt.amount).toLocaleString()} · ref {receipt.reference}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={`status-badge status-${stage.status}`}>
                      {String(stage.status).replace('_', ' ')}
                    </span>

                    {needsPayment && stage.status !== 'approved' && (
                      <button className="btn btn-warning" onClick={() => handlePay(stage)} disabled={busy}>
                        Pay ₦{Number(stage.payment_amount || 0).toLocaleString()}
                        {paymentMode === 'simulated' ? ' (demo)' : ''}
                      </button>
                    )}

                    {stage.status !== 'approved' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setOpenStageId(isOpen ? null : stage.stage_id)}
                      >
                        {isOpen ? 'Close' : 'Documents'}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="submit-panel">
                    <DocumentRequirements requirements={requirements} onChanged={refresh} />

                    {stage.status === 'pending' ? (
                      <p style={{ fontSize: '0.9rem', color: '#cc7a00', marginTop: '0.8rem' }}>
                        Already submitted — waiting for the section officer to review.
                      </p>
                    ) : locked ? (
                      <p style={{ fontSize: '0.9rem', color: '#999', marginTop: '0.8rem' }}>
                        You can upload now, but this stage stays locked until the stages it depends
                        on are approved.
                      </p>
                    ) : (
                      <>
                        {mandatoryMissing.length > 0 && (
                          <p style={{ fontSize: '0.9rem', color: '#c00', marginTop: '0.8rem' }}>
                            Still required: {mandatoryMissing.map((r) => r.label).join(', ')}
                          </p>
                        )}
                        <button
                          className="btn btn-primary-sm"
                          style={{ marginTop: '0.8rem' }}
                          onClick={() => handleSubmit(stage)}
                          disabled={busy || needsPayment || mandatoryMissing.length > 0}
                        >
                          {busy
                            ? 'Submitting…'
                            : stage.status === 'rejected'
                              ? 'Resubmit for review'
                              : 'Submit for review'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
