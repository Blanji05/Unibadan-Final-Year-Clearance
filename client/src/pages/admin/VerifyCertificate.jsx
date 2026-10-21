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
    } catch (err) {
      setVerifyError(err.message || 'No official clearance letter was found matching that code or matric number.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(true);
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
    <div>
      <SectionHeader
        title="Clearance Letter Verification Desk"
        description="Verify, inspect, and authenticate digital clearance letters issued to graduating students of the University of Ibadan. Confirm records using their security verification code, certificate number, or matriculation number."
      />

      {/* Verification Input Card */}
      <div className="card" style={{ marginBottom: '1.75rem', borderTop: '4px solid #002147' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#002147', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IconShieldCheck style={{ width: 20, height: 20, color: '#002147' }} />
          Verify Clearance Code & Authenticity
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Enter the 32-character verification code displayed on the student’s clearance letter or portal (e.g. <code>5669a6a80f4bd8dd301b25c47165264e</code>), the certificate number, or their matric number.
        </p>

        <form onSubmit={(e) => handleVerify(e)} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 340px', position: 'relative' }}>
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '2.5rem', fontSize: '0.95rem', height: '44px', fontFamily: 'monospace' }}
              placeholder="Paste verification code, cert number (UI-CLR-...), or matric no"
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

          <button
            type="submit"
            className="btn btn-primary"
            style={{ height: '44px', minWidth: '150px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
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
              style={{ height: '44px' }}
              onClick={() => {
                setVerifiedResult(null);
                setQueryInput('');
              }}
            >
              Reset
            </button>
          )}
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
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <span style={{ fontWeight: 'bold' }}>✕ Verification Failed:</span> {verifyError}
          </div>
        )}
      </div>

      {/* Verified Result Presentation */}
      {verifiedResult && (
        <div className="card" style={{ marginBottom: '2rem', border: '2px solid #10B981', boxShadow: '0 4px 16px rgba(16, 185, 129, 0.12)' }}>
          {/* Header Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1.25rem',
              backgroundColor: '#ECFDF5',
              borderBottom: '1px solid #A7F3D0',
              margin: '-1.5rem -1.5rem 1.25rem -1.5rem',
              borderRadius: '6px 6px 0 0',
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
                }}
              >
                <IconCheck style={{ width: 18, height: 18, strokeWidth: 2.5 }} />
              </div>
              <div>
                <strong style={{ color: '#065F46', fontSize: '0.95rem', letterSpacing: '0.3px' }}>
                  OFFICIAL &amp; AUTHENTICATED CLEARANCE LETTER
                </strong>
                <div style={{ color: '#047857', fontSize: '0.775rem' }}>
                  University of Ibadan Central Clearance Registry • Status Verified
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-outline-primary"
              style={{
                fontSize: '0.825rem',
                padding: '0.4rem 0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              onClick={() => handleDownloadPDF(verifiedResult.student.id, verifiedResult.certificate_no)}
              disabled={downloadingPdf}
            >
              <IconAward style={{ width: 16, height: 16 }} />
              {downloadingPdf ? 'Downloading PDF…' : 'Download Letter (PDF)'}
            </button>
          </div>

          {/* Certificate Identification Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
                {verifiedResult.certificate_no}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Security Verification Code
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
                <code
                  style={{
                    fontSize: '0.85rem',
                    color: '#0F172A',
                    backgroundColor: '#E2E8F0',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {verifiedResult.verification_code}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyCode(verifiedResult.verification_code)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedCode ? '#059669' : '#64748b',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '2px 4px',
                  }}
                  title="Copy verification code"
                >
                  {copiedCode ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Date Issued
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#334155' }}>
                {formatDate(verifiedResult.issued_at)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '600' }}>
                Clearance Status
              </div>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  marginTop: '2px',
                }}
              >
                10 of 10 Stages Approved
              </span>
            </div>
          </div>

          {/* Student Identification Profile */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
              Student Credentials
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.75rem',
                backgroundColor: '#FFFFFF',
                padding: '1rem',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Full Name:</span>
                <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>{verifiedResult.student.full_name}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Matriculation Number:</span>
                <div style={{ fontWeight: '700', color: '#002147', fontSize: '0.95rem', fontFamily: 'monospace' }}>
                  {verifiedResult.student.matric_number}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Department:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{verifiedResult.student.department}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Faculty:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{verifiedResult.student.faculty}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Hall of Residence:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{verifiedResult.student.hall || 'Not Assigned'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Degree / Class of:</span>
                <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>
                  {verifiedResult.student.degree_program || 'B.Sc'} ({verifiedResult.student.graduation_session || '2025/2026'})
                </div>
              </div>
            </div>
          </div>

          {/* Endorsed Stages Breakdown Table */}
          <div>
            <h4 style={{ fontSize: '0.9rem', color: '#002147', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
              Endorsed Clearance Stages Breakdown
            </h4>
            <div className="table-responsive" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>
                  <tr>
                    <th style={{ width: '40px', color: '#FFFFFF' }}>#</th>
                    <th style={{ color: '#FFFFFF' }}>Clearance Section / Stage</th>
                    <th style={{ color: '#FFFFFF' }}>Endorsing Officer</th>
                    <th style={{ color: '#FFFFFF' }}>Date Approved</th>
                    <th style={{ width: '100px', textAlign: 'center', color: '#FFFFFF' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(verifiedResult.stages || []).map((stage, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                      <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{idx + 1}</td>
                      <td>
                        <strong style={{ color: '#002147', fontSize: '0.9rem' }}>{stage.stage_name}</strong>
                      </td>
                      <td style={{ color: '#334155', fontSize: '0.875rem' }}>
                        {stage.officer_name || 'Authorized Clearance Officer'}
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
        </div>
      )}

      {/* Registry of Issued Clearance Letters */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#002147', margin: 0 }}>
              Issued Clearance Letters Registry ({registryTotal})
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              All officially generated final clearance letters and their corresponding verification codes.
            </p>
          </div>

          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '2.25rem', fontSize: '0.85rem', height: '36px' }}
              placeholder="Search registry…"
              value={registrySearch}
              onChange={(e) => {
                const val = e.target.value;
                setRegistrySearch(val);
                fetchRegistry(val);
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '9px', color: '#94a3b8' }}>
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
          <div className="table-responsive">
            <table className="table">
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
                      <span style={{ fontWeight: '700', color: '#002147', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {item.certificate_no}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{item.full_name}</strong>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#334155' }}>
                        {item.matric_number}
                      </span>
                    </td>
                    <td style={{ color: '#475569', fontSize: '0.85rem' }}>{item.department}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <code
                          style={{
                            fontSize: '0.78rem',
                            color: '#1e293b',
                            backgroundColor: '#F1F5F9',
                            padding: '2px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          {item.verification_code}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(item.verification_code)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            padding: '2px',
                          }}
                          title="Copy verification code"
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{formatDate(item.generated_at)}</td>
                    <td style={{ textAlign: 'right' }}>
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
        )}
      </div>
    </div>
  );
}

