import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { paymentApi } from '../../services/api';

/**
 * Landing page for the Remita redirect.
 *
 * Remita returns the student here with ?RRR=...&orderID=... — the charge is only
 * trusted once the server has verified it against the Remita API, so this
 * page verifies before telling the student they are cleared to submit.
 */
export default function PaymentCallback() {
  const [params] = useSearchParams();
  const reference =
    params.get('reference') || params.get('trxref') || params.get('orderID') || params.get('RRR') || params.get('rrr');
  const [state, setState] = useState('verifying');
  const [message, setMessage] = useState('');
  const verified = useRef(false);

  useEffect(() => {
    if (!reference) {
      setState('error');
      setMessage('No payment reference was supplied.');
      return;
    }

    // React StrictMode mounts twice in dev; only verify once.
    if (verified.current) return;
    verified.current = true;

    (async () => {
      try {
        const res = await paymentApi.verify(reference);
        setState('success');
        setMessage(res.message || 'Payment confirmed.');
      } catch (err) {
        setState('error');
        setMessage(err.message);
      }
    })();
  }, [reference]);

  return (
    <div>
      <div className="dashboard-header">
        <h1>Payment</h1>
        <p>Confirming your clearance fee with the payment gateway</p>
      </div>

      <div className="card">
        {state === 'verifying' && <p>Verifying payment{reference ? ` ${reference}` : ''}…</p>}

        {state === 'success' && (
          <>
            <div className="notice">{message}</div>
            <p style={{ color: '#666' }}>
              Reference <code>{reference}</code>
            </p>
            <p style={{ marginTop: '1rem' }}>
              <Link to="/student">Back to my clearance</Link>
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="error">{message}</div>
            <p style={{ color: '#666' }}>
              If you were charged, the payment will still be confirmed automatically. Return to{' '}
              <Link to="/student">your clearance</Link> to check, or try the payment again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
