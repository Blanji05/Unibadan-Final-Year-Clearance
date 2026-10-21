import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../services/api';
import { saveBlob } from '../../services/download';
import {
  IconAward,
  IconCheck,
  IconClipboard,
  IconCopy,
  IconSearch,
  IconShieldCheck,
  IconUsers,
} from '../../components/Icons';
import { EmptyState, SectionHeader, formatDate } from '../../components/Ui';

export default function VerifyCertificate() {
  const [queryInput, setQueryInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Registry of issued certificates
  const [registry, setRegistry] = useState([]);
  const [registryTotal, setRegistryTotal] = useState(0);
  const [registrySearch, setRegistrySearch] = useState('');
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const fetchRegistry = useCallback(async (search = '') => {
    try {
      setLoadingRegistry(true);
      const res = await adminApi.certificates({ search, limit: 50 });
      setRegistry(res.items || []);
      setRegistryTotal(res.total || 0);
    } catch (_) {
      // Keep empty state
    } finally {
      setLoadingRegistry(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  const handleVerify = async (e, codeToVerify = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const query = (codeToVerify !== null ? codeToVerify : queryInput).trim();
    if (!query) {
      setVerifyError('Please enter a verification code, certificate number, or matriculation number.');
      return;
    }

    try {
      setVerifying(true);
      setVerifyError('');
      setVerifiedResult(null);
      const res = await adminApi.verifyCertificate(query);
      setVerifiedResult(res);
      if (codeToVerify !== null) {
        setQueryInput(codeToVerify);
      }
      // Scroll to result smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setVerifyError(err.message || 'No official clearance letter was found matching that code or matric number.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleDownloadPDF = async (studentId, certificateNo) => {
    try {
      setDownloadingPdf(true);
      const blob = await adminApi.downloadStudentCertificate(studentId);
      saveBlob(blob, `Clearance-Letter-${certificateNo || 'UI'}.pdf`);
    } catch (err) {
      alert('Could not download clearance letter PDF: ' + err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <SectionHeader
        title="Clearance Letter Verification Desk"
        description="Verify, inspect, and authenticate digital clearance letters issued to graduating students of the University of Ibadan."
      />

      {/* Verification Input Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderTop: '4px solid #002147' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#002147', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IconShieldCheck style={{ width: 20, height: 20, color: '#002147' }} />
          Verify Clearance Code &amp; Authenticity
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.45 }}>
          Enter the 32-character verification code displayed on the student’s clearance letter (e.g. <code>5669a6a80f...</code>), the certificate number, or their matric number.
        </p>

        <form onSubmit={(e) => handleVerify(e)} className="verify-form">
          <div className="verify-input-wrap">
            <input
              type="text"
              className="form-control verify-input"
              placeholder="Paste verification code, cert no, or matric"
              value={queryInput}
              onChange={(e) => {
                setQueryInput(e.target.value);
                if (verifyError) setVerifyError('');
              }}
            />
            <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}>
              <IconSearch style={{ width: 18, height: 18 }} />
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '100%', flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="btn btn-primary verify-submit-btn"
              style={{ flex: '1 1 180px' }}
              disabled={verifying}
            >
              {verifying ? (
                <span>Verifying…</span>
              ) : (
                <>
                  <IconShieldCheck style={{ width: 18, height: 18 }} />
                  <span>Verify Code</span>
                </>
              )}
            </button>

            {verifiedResult && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '44px', flex: '0 0 auto' }}
                onClick={() => {
                  setVerifiedResult(null);
                  setQueryInput('');
                }}
              >
                Reset
              </button>
            )}
          </div>
        </form>

        {verifyError && (
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
            <strong>✕ Verification Failed:</strong> {verifyError}
          </div>
        )}
      </div>

      {/* Verified Result Presentation */}
      {verifiedResult && (
        <div className="card" style={{ marginBottom: '1.75rem', border: '2px solid #10B981', boxShadow: '0 4px 16px rgba(16, 185, 129, 0.12)' }}>
          {/* Header Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: '6px',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
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
                <strong style={{ color: '#065F46', fontSize: '0.9rem', display: 'block', letterSpacing: '0.2px' }}>
                  OFFICIAL &amp; AUTHENTICATED
                </strong>
                <span style={{ color: '#047857', fontSize: '0.75rem' }}>
                  University of Ibadan Central Clearance Registry
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-outline-primary"
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                width: 'auto',
              }}
              onClick={() => handleDownloadPDF(verifiedResult.student.id, verifiedResult.certificate_no)}
              disabled={downloadingPdf}
            >
              <IconAward style={{ width: 16, height: 16 }} />
              {downloadingPdf ? 'Downloading…' : 'Download Letter (PDF)'}
            </button>
          </div>

          {/* Certificate Identification Bar */}
          <div className="verify-grid-meta">
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Certificate Number
              </div>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#002147', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {verifiedResult.certificate_no}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Security Verification Code
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px', flexWrap: 'wrap' }}>
                <span className="verify-code-pill">
                  {verifiedResult.verification_code}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(verifiedResult.verification_code)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedCode === verifiedResult.verification_code ? '#059669' : '#002147',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '2px 4px',
                  }}
                >
                  {copiedCode === verifiedResult.verification_code ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Date Issued
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                {formatDate(verifiedResult.issued_at)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Clearance Status
              </div>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  marginTop: '2px',
                }}
              >
                10 of 10 Stages Approved
              </span>
            </div>
          </div>

          {/* Student Identification Profile */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '0.85rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
              Student Credentials
            </h4>
            <div className="verify-grid-student">
              <div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Full Name:</span>
                <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.92rem' }}>{verifiedResult.student.full_name}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Matriculation Number:</span>
                <div style={{ fontWeight: '700', color: '#002147', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                  {verifiedResult.student.matric_number}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Department:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.875rem' }}>{verifiedResult.student.department}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Faculty:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.875rem' }}>{verifiedResult.student.faculty}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Hall of Residence:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.875rem' }}>{verifiedResult.student.hall || 'Not Assigned'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Degree / Program:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.875rem' }}>
                  {verifiedResult.student.degree_program || 'B.Sc'} ({verifiedResult.student.graduation_session || '2025/2026'})
                </div>
              </div>
            </div>
          </div>

          {/* Endorsed Stages Breakdown */}
          <div>
            <h4 style={{ fontSize: '0.85rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
              Endorsed Clearance Stages Breakdown
            </h4>

            {/* Desktop Table */}
            <div className="table-wrap verify-desktop-only" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table className="data-table" style={{ minWidth: '580px', margin: 0 }}>
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
                  {(verifiedResult.stages || []).map((stage, idx) => (
                    <tr key={idx}>
                      <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{idx + 1}</td>
                      <td>
                        <strong style={{ color: '#002147', fontSize: '0.88rem' }}>{stage.stage_name}</strong>
                      </td>
                      <td style={{ color: '#334155', fontSize: '0.85rem' }}>
                        {stage.officer_name || 'Authorized Clearance Officer'}
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

            {/* Mobile Stage Cards */}
            <div className="verify-mobile-only">
              {(verifiedResult.stages || []).map((stage, idx) => (
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
        </div>
      )}

      {/* Registry of Issued Clearance Letters */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="verify-registry-header">
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#002147', margin: 0 }}>
              Issued Clearance Letters Registry ({registryTotal})
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.825rem', margin: '3px 0 0 0', lineHeight: 1.4 }}>
              All officially generated clearance letters and corresponding verification codes.
            </p>
          </div>

          <div className="verify-registry-search">
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '2.25rem', fontSize: '0.85rem', height: '38px', width: '100%' }}
              placeholder="Search registry…"
              value={registrySearch}
              onChange={(e) => {
                const val = e.target.value;
                setRegistrySearch(val);
                fetchRegistry(val);
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }}>
              <IconSearch style={{ width: 16, height: 16 }} />
            </span>
          </div>
        </div>

        {loadingRegistry ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading clearance registry…</div>
        ) : registry.length === 0 ? (
          <EmptyState
            title="No clearance letters issued yet"
            description="Clearance letters and codes appear here automatically as soon as students have all 10 stages approved."
          />
        ) : (
          <>
            {/* Desktop / Tablet Table View */}
            <div className="table-wrap verify-desktop-only">
              <table className="data-table" style={{ minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th>Certificate No</th>
                    <th>Student Name</th>
                    <th>Matric No</th>
                    <th>Department</th>
                    <th>Verification Code</th>
                    <th>Date Issued</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span style={{ fontWeight: '700', color: '#002147', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {item.certificate_no}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: '#0f172a', whiteSpace: 'nowrap' }}>{item.full_name}</strong>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                          {item.matric_number}
                        </span>
                      </td>
                      <td style={{ color: '#475569', fontSize: '0.85rem' }}>{item.department}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
                          <span className="verify-code-pill" style={{ fontSize: '0.75rem' }}>
                            {item.verification_code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(item.verification_code)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedCode === item.verification_code ? '#059669' : '#64748b',
                              cursor: 'pointer',
                              fontSize: '0.72rem',
                              fontWeight: '600',
                              padding: '2px 4px',
                            }}
                            title="Copy verification code"
                          >
                            {copiedCode === item.verification_code ? '✓' : 'Copy'}
                          </button>
                        </div>
                      </td>
                      <td style={{ color: '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {formatDate(item.generated_at)}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          style={{ fontSize: '0.775rem', padding: '0.3rem 0.65rem' }}
                          onClick={() => handleVerify(null, item.verification_code)}
                        >
                          Inspect &amp; Verify
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="verify-mobile-only">
              {registry.map((item) => (
                <div key={item.id} className="verify-mobile-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem', gap: '0.5rem' }}>
                    <span style={{ fontWeight: '700', color: '#002147', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                      {item.certificate_no}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {formatDate(item.generated_at)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0F172A', marginBottom: '0.2rem' }}>
                    {item.full_name}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8rem', color: '#475569', marginBottom: '0.5rem' }}>
                    <span>
                      Matric: <strong style={{ color: '#002147', fontFamily: 'monospace' }}>{item.matric_number}</strong>
                    </span>
                    <span>
                      Dept: <strong>{item.department}</strong>
                    </span>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>
                      Verification Code:
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="verify-code-pill" style={{ flex: '1 1 auto' }}>
                        {item.verification_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(item.verification_code)}
                        style={{
                          background: '#E2E8F0',
                          border: 'none',
                          borderRadius: '4px',
                          color: copiedCode === item.verification_code ? '#059669' : '#0F172A',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          padding: '3px 8px',
                          flexShrink: 0,
                        }}
                      >
                        {copiedCode === item.verification_code ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    style={{ width: '100%', fontSize: '0.825rem', padding: '0.45rem', justifyContent: 'center' }}
                    onClick={() => handleVerify(null, item.verification_code)}
                  >
                    Inspect &amp; Verify Clearance
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
