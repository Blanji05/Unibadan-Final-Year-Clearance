import { useCallback, useEffect, useState } from 'react';
import { studentApi } from '../../services/api';
import { realtime } from '../../services/realtime';

export default function Certificate() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await studentApi.certificate());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubClear = realtime.on('clearance:update', () => load());
    return () => unsubClear();
  }, [load]);

  if (loading) return <div className="page-loading">Checking clearance letter…</div>;

  const certificate = data?.certificate;
  const remaining = data?.remaining_stages || [];

  return (
    <div>
      <div className="dashboard-header">
        <h1>Clearance Letter</h1>
        <p>Available once all 10 stages have been approved</p>
      </div>

      {error && <div className="error">{error}</div>}

      {certificate ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#00804d', marginBottom: '0.5rem' }}>Clearance complete</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Issued {new Date(certificate.generated_at).toLocaleDateString()}
            {certificate.verification_code && (
              <>
                {' '}· Verification code: <strong>{certificate.verification_code}</strong>
              </>
            )}
          </p>
          <a
            className="btn btn-primary"
            style={{ display: 'inline-block', width: 'auto' }}
            href={certificate.certificate_url}
            target="_blank"
            rel="noreferrer"
          >
            Download Clearance Letter (PDF)
          </a>
        </div>
      ) : (
        <div className="card">
          <h2 style={{ marginBottom: '0.5rem' }}>Not ready yet</h2>
          <p style={{ color: '#666', marginBottom: remaining.length ? '1rem' : 0 }}>
            Your clearance letter is generated automatically once every stage is approved.
          </p>
          {remaining.length > 0 && (
            <>
              <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                Still outstanding ({remaining.length}):
              </p>
              <ul className="stage-list">
                {remaining.map((stage) => (
                  <li key={stage.stage_id || stage.id} className="stage-item">
                    <span>{stage.stage_name}</span>
                    <span className={`status-badge status-${stage.status}`}>
                      {String(stage.status).replace('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
