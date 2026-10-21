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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '1.5rem 0.75rem', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                backgroundColor: '#002147',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '1.15rem',
                flexShrink: 0,
              }}
            >
              UI
            </div>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#002147', margin: 0, lineHeight: 1.2 }}>
                UNIVERSITY OF IBADAN
              </h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
                CENTRAL CLEARANCE REGISTRY • DOCUMENT AUTHENTICATION
              </p>
            </div>
          </div>
          <p style={{ color: '#475569', fontSize: '0.85rem', maxWidth: '580px', margin: '0.4rem auto 0 auto', lineHeight: 1.45 }}>
            Official electronic verification portal for authenticating graduating student clearance letters and academic credentials.
          </p>
        </div>

        {/* Verification Input Card */}
        <div className="card" style={{ marginBottom: '1.5rem', borderTop: '4px solid #002147' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doVerify(inputCode);
            }}
            className="verify-form"
          >
            <div className="verify-input-wrap">
              <input
                type="text"
                className="form-control verify-input"
                placeholder="Enter 32-character verification code"
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
              className="btn btn-primary verify-submit-btn"
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
                fontSize: '0.875rem',
                wordBreak: 'break-word',
              }}
            >
              <strong>✕ Verification Failed:</strong> {error}
            </div>
          )}
        </div>

        {/* Verified Result Card */}
        {result && (
          <div className="card" style={{ border: '2px solid #10B981', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)', marginBottom: '1.75rem' }}>
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '6px',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IconCheck style={{ width: 18, height: 18, strokeWidth: 2.5 }} />
              </div>
              <div>
                <strong style={{ color: '#065F46', fontSize: '0.92rem', display: 'block' }}>
                  GENUINE &amp; VERIFIED CLEARANCE LETTER
                </strong>
                <span style={{ color: '#047857', fontSize: '0.75rem' }}>
                  Authenticated by University of Ibadan Central Clearance Database
                </span>
              </div>
            </div>

            {/* Metadata Bar */}
            <div className="verify-grid-meta">
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                  Certificate Number
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '700', color: '#002147', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {result.certificate_no}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                  Verification Code
                </div>
                <span className="verify-code-pill">
                  {result.verification_code}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                  Issuance Date
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                  {formatDate(result.issued_at)}
                </div>
              </div>
            </div>

            {/* Student Details */}
            {result.student && (
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                  Student Credentials
                </h4>
                <div className="verify-grid-student">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Full Name:</span>
                    <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.92rem' }}>{result.student.full_name}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Matriculation Number:</span>
                    <div style={{ fontWeight: '700', color: '#002147', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                      {result.student.matric_number}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Faculty:</span>
                    <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.875rem' }}>{result.student.faculty}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Department:</span>
                    <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.875rem' }}>{result.student.department}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown of Stages */}
            {result.stages && result.stages.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                  Endorsed Clearance Stages ({result.stages.length} of {result.stages.length} Complete)
                </h4>

                {/* Desktop Table */}
                <div className="table-wrap verify-desktop-only" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                  <table className="data-table" style={{ minWidth: '540px', margin: 0 }}>
                    <thead style={{ backgroundColor: '#002147' }}>
                      <tr>
                        <th style={{ width: '40px', color: '#002147' }}>#</th>
                        <th style={{ color: '#002147' }}>Clearance Section</th>
                        <th style={{ color: '#002147' }}>Endorsing Officer</th>
                        <th style={{ color: '#002147' }}>Date Approved</th>
                        <th style={{ width: '90px', textAlign: 'center', color: '#002147' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stages.map((stage, idx) => (
                        <tr key={idx}>
                          <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{idx + 1}</td>
                          <td>
                            <strong style={{ color: '#002147', fontSize: '0.88rem' }}>{stage.stage_name}</strong>
                          </td>
                          <td style={{ color: '#334155', fontSize: '0.85rem' }}>
                            {stage.officer_name || 'Authorized Officer'}
                          </td>
                          <td style={{ color: '#475569', fontSize: '0.82rem' }}>
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
                                fontSize: '0.72rem',
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

                {/* Mobile Stages Cards */}
                <div className="verify-mobile-only">
                  {result.stages.map((stage, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        padding: '0.65rem 0.8rem',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#002147' }}>
                          {idx + 1}. {stage.stage_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                          Officer: <span style={{ color: '#334155', fontWeight: '500' }}>{stage.officer_name || 'Authorized Officer'}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          {stage.reviewed_at ? formatDate(stage.reviewed_at) : 'Approved'}
                        </div>
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          flexShrink: 0,
                        }}
                      >
                        Approved
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '2rem', color: '#94A3B8', fontSize: '0.8rem' }}>
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
