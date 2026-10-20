import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi, paymentApi } from '../../services/api';
import { saveBlob } from '../../services/download';
import { realtime } from '../../services/realtime';
import { IconCard } from '../../components/Icons';
import {
  EmptyState,
  SectionHeader,
  SkeletonList,
  StatCard,
  StatusBadge,
  formatDate,
} from '../../components/Ui';

/**
 * Payment history only. Fees are paid from the Stages page, next to the stage
 * they unlock, and settle through Paystack in real time.
 */
export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setPayments((await studentApi.payments()) || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubPay = realtime.on('payment:update', () => load());
    const unsubClear = realtime.on('clearance:update', () => load());
    return () => {
      unsubPay();
      unsubClear();
    };
  }, [load]);

  const handleVerify = async (payment) => {
    setError('');
    setNotice('');
    setVerifyingId(payment.id);
    try {
      const res = await paymentApi.verify(payment.reference || payment.rrr);
      setNotice(res.message || 'Payment verified successfully.');
      await load();
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleCancel = async (payment) => {
    if (!window.confirm('Are you sure you want to cancel and remove this payment attempt?')) return;
    setError('');
    setNotice('');
    try {
      await studentApi.cancelPayment(payment.id);
      setNotice('Payment attempt cancelled and removed.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to cancel payment.');
    }
  };

  const downloadReceipt = async (payment) => {
    setError('');
    setNotice('');
    setDownloadingId(payment.id);
    try {
      const blob = await studentApi.receipt(payment.id);
      saveBlob(blob, `receipt-${payment.reference}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const successful = payments.filter((p) => p.status === 'success');
  const totalPaid = successful.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div className="stack">
      {notice && <div className="notice" style={{ borderLeft: '4px solid #10b981' }}>{notice}</div>}
      {error && <div className="error">{error}</div>}

      <div className="stat-grid">
        <StatCard
          label="Total paid"
          value={`₦${totalPaid.toLocaleString()}`}
          tone="success"
          icon={IconCard}
        />
        <StatCard label="Transactions" value={payments.length} />
      </div>

      <div className="card">
        <SectionHeader title="Payment history" description="Every live clearance fee transaction" />

        {payments.length === 0 ? (
          <EmptyState
            icon={IconCard}
            title="No payments yet"
            message="The Alumni stage requires a ₦1,000 fee. Once you pay it via Paystack, the receipt appears here."
            action={
              <Link to="/student/stages" className="btn btn-secondary btn-sm">
                Go to stages
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Gateway</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.stage_name || '—'}</td>
                    <td>₦{Number(p.amount).toLocaleString()}</td>
                    <td className="mono">{p.reference}</td>
                    <td className="mono">{p.gateway || 'Paystack'}</td>
                    <td>{formatDate(p.paid_at || p.created_at)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      {p.status === 'success' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => downloadReceipt(p)}
                          disabled={downloadingId === p.id}
                        >
                          {downloadingId === p.id ? 'Preparing…' : 'Download PDF'}
                        </button>
                      ) : p.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleVerify(p)}
                            disabled={verifyingId === p.id}
                            title="Verify and settle this pending transaction in real time"
                          >
                            {verifyingId === p.id ? 'Confirming…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCancel(p)}
                            style={{ color: '#dc2626' }}
                            title="Cancel and remove this attempt"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCancel(p)}
                          style={{ color: '#dc2626' }}
                          title="Delete record"
                        >
                          Delete
                        </button>
                      )}
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
