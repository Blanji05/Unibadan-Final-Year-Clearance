import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { certificateApi } from '../../services/api';
import { IconCheck, IconSearch, IconShieldCheck, IconAward } from '../../components/Icons';
import { formatDate } from '../../components/Ui';

export default function VerifyPublic() {
  const { code: urlCode } = useParams();
  const [inputCode, setInputCode] = useState(urlCode || '');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const doVerify = async (codeToVerify) => {
    const q = (codeToVerify || inputCode).trim();
    if (!q) {
      setError('Please enter a clearance verification code.');
      return;
    }

    try {
      setVerifying(true);
      setError('');
      setResult(null);
      const res = await certificateApi.verify(q);
      setResult(res);
    } catch (err) {
      setError(err.message || 'The verification code entered does not match any official University of Ibadan clearance letter.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (urlCode) {
      setInputCode(urlCode);
      doVerify(urlCode);
    }
  }, [urlCode]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: '#002147',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '1.2rem',
              }}
            >
              UI
            </div>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#002147', margin: 0 }}>
                UNIVERSITY OF IBADAN
              </h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>
                CENTRAL CLEARANCE REGISTRY • DOCUMENT AUTHENTICATION SYSTEM
              </p>
            </div>
          </div>
          <p style={{ color: '#475569', fontSize: '0.9rem', maxWidth: '580px', margin: '0.5rem auto 0 auto' }}>
            Official electronic verification portal for authenticating graduating student clearance letters and academic credentials.
          </p>
        </div>

        {/* Verification Input Card */}
        <div className="card" style={{ marginBottom: '1.75rem', borderTop: '4px solid #002147' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doVerify(inputCode);
            }}
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}
          >
            <div style={{ flex: '1 1 300px', position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2.5rem', fontSize: '0.95rem', height: '44px', fontFamily: 'monospace' }}
                placeholder="Enter 32-character verification code or certificate number"
                value={inputCode}
                onChange={(e) => {
                  setInputCode(e.target.value);
                  if (error) setError('');
                }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}>
                <IconSearch style={{ width: 18, height: 18 }} />
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ height: '44px', minWidth: '160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              disabled={verifying}
            >
              <IconShieldCheck style={{ width: 18, height: 18 }} />
              <span>{verifying ? 'Verifying…' : 'Verify Clearance'}</span>
            </button>
          </form>

          {error && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.85rem 1rem',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '6px',
                color: '#991B1B',
                fontSize: '0.9rem',
              }}
            >
              <strong>✕ Verification Failed:</strong> {error}
            </div>
          )}
        </div>

        {/* Verified Result Card */}
        {result && (
          <div className="card" style={{ border: '2px solid #10B981', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)' }}>
            <div
              style={{
                padding: '1rem 1.25rem',
                backgroundColor: '#ECFDF5',
                borderBottom: '1px solid #A7F3D0',
                margin: '-1.5rem -1.5rem 1.25rem -1.5rem',
                borderRadius: '6px 6px 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconCheck style={{ width: 20, height: 20, strokeWidth: 2.5 }} />
              </div>
              <div>
                <strong style={{ color: '#065F46', fontSize: '1rem', letterSpacing: '0.3px' }}>
                  GENUINE &amp; VERIFIED CLEARANCE LETTER
                </strong>
                <div style={{ color: '#047857', fontSize: '0.8rem' }}>
                  This clearance record has been validated against the University of Ibadan Central Clearance Database.
                </div>
              </div>
            </div>

            {/* Metadata Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                border: '1px solid #E2E8F0',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                  Certificate Number
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#002147', fontFamily: 'monospace' }}>
                  {result.certificate_no}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                  Verification Code
                </div>
                <code
                  style={{
                    fontSize: '0.85rem',
                    color: '#0F172A',
                    backgroundColor: '#E2E8F0',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    wordBreak: 'break-all',
                  }}
                >
                  {result.verification_code}
                </code>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                  Issuance Date
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#334155' }}>
                  {formatDate(result.issued_at)}
                </div>
              </div>
            </div>

            {/* Student Details */}
            {result.student && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
                  Student Credentials
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '0.75rem',
                    padding: '1rem',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Full Name:</span>
                    <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>{result.student.full_name}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Matriculation Number:</span>
                    <div style={{ fontWeight: '700', color: '#002147', fontSize: '0.95rem', fontFamily: 'monospace' }}>
                      {result.student.matric_number}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Faculty:</span>
                    <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{result.student.faculty}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Department:</span>
                    <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{result.student.department}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown of Stages */}
            {result.stages && result.stages.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.9rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
                  Endorsed Clearance Stages ({result.stages.length} of {result.stages.length} Complete)
                </h4>
                <div className="table-responsive" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                  <table className="table" style={{ margin: 0 }}>
                    <thead style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>
                      <tr>
                        <th style={{ width: '40px', color: '#FFFFFF' }}>#</th>
                        <th style={{ color: '#FFFFFF' }}>Clearance Section</th>
                        <th style={{ color: '#FFFFFF' }}>Endorsing Officer</th>
                        <th style={{ color: '#FFFFFF' }}>Date Approved</th>
                        <th style={{ width: '90px', textAlign: 'center', color: '#FFFFFF' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stages.map((stage, idx) => (
                        <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                          <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{idx + 1}</td>
                          <td>
                            <strong style={{ color: '#002147', fontSize: '0.9rem' }}>{stage.stage_name}</strong>
                          </td>
                          <td style={{ color: '#334155', fontSize: '0.875rem' }}>
                            {stage.officer_name || 'Authorized Officer'}
                          </td>
                          <td style={{ color: '#475569', fontSize: '0.85rem' }}>
                            {stage.reviewed_at ? formatDate(stage.reviewed_at) : 'Approved'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: '#DCFCE7',
                                color: '#15803D',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                              }}
                            >
                              Approved
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '2.5rem', color: '#94A3B8', fontSize: '0.8rem' }}>
          University of Ibadan Clearance Management System • Official Verification Portal
          <div style={{ marginTop: '0.5rem' }}>
            <Link to="/login" style={{ color: '#002147', fontWeight: '600', textDecoration: 'none' }}>
              Sign in to Portal →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

