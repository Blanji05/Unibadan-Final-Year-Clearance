import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { studentApi } from '../../services/api';
import { redirectToCheckout } from '../../services/checkout';
import { saveBlob } from '../../services/download';
import { realtime } from '../../services/realtime';
import DocumentRequirements from '../../components/DocumentRequirements';
import {
  IconArrowLeft,
  IconCard,
  IconCheck,
  IconChevronRight,
  IconClipboard,
  IconClock,
  IconFile,
  IconLock,
} from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, StatusBadge, formatDate } from '../../components/Ui';

/**
 * Authentic University of Ibadan Final Year Clearance Step Guidelines & Requirements.
 * Improvised for the digital online clearance portal.
 */
const UI_STAGE_GUIDES = {
  1: {
    title: 'Kenneth Dike Library Clearance',
    time: 'Within 24 Hours',
    instructions: [
      'Ensure all borrowed library books are returned and any overdue accounts are settled.',
      'Upload or snap a clear photo of your Kenneth Dike Library ID Card in the required documents section below.',
      'Click "Submit for Clearance" to forward your records directly to the Library Clearance Officer.',
      'Once verified and approved, click "Download Clearance Slip (PDF)" to save your official stamped Library clearance slip.',
    ],
  },
  2: {
    title: 'Caution and Hall Clearance (Hostel & Maintenance)',
    time: '1 to 2 Working Days',
    instructions: [
      'Ensure you have cleared your room and received maintenance inspection sign-off.',
      'Upload or snap all required documents below: School Fee Receipts (100L through final year), Room Clearance Form, Student ID Card, Passport Photograph, and Maintenance Clearance (or Off-Campus Form if you resided off-campus).',
      'Add any optional remarks regarding your hall/room allocation and click "Submit for Clearance".',
      'Upon review and approval by the Hall Clearance Officer, download your official signed Hall Clearance Slip (PDF).',
    ],
  },
  3: {
    title: 'University Health Services Clearance',
    time: 'Within 24 Hours',
    instructions: [
      'Ensure your student health records are in good standing.',
      'Upload or snap a clear, legible photograph of your valid University Health Services (UHS) Card below.',
      'Click "Submit for Clearance" to route your request to University Health Services for digital review.',
      'Once approved, download your official stamped Health Services Clearance Slip (PDF) directly from this page.',
    ],
  },
  4: {
    title: 'Alumni Association Clearance',
    time: 'Within 24 Hours',
    instructions: [
      'Complete the ₦1,000 alumni dues payment online via Paystack on this portal, or upload your payment receipt.',
      'Upload your completed digital Alumni Registration Form below.',
      'Click "Submit for Clearance" for review by the Alumni Relations Officer.',
      'Once approved, download your official stamped Alumni Clearance Slip (PDF).',
    ],
  },
  5: {
    title: 'Academic Departmental Clearance',
    time: '1 to 2 Working Days',
    instructions: [
      'Confirm all departmental course units, final year project submissions, and departmental dues are completed.',
      'Upload or snap your Department Dues Receipts (100L to final year), approved Course Registration Forms, and departmental sign-off slip below.',
      'Click "Submit for Clearance" to route directly to your assigned Departmental Clearance Officer.',
      'Once cleared, download your signed Departmental Clearance Slip (PDF), which is required for Faculty and subsequent clearances.',
    ],
  },
  6: {
    title: 'Sports Council Clearance',
    time: 'Within 24 Hours',
    instructions: [
      'Ensure earlier clearances (Caution & Hall, Alumni, and Library) have been approved and their clearance slips downloaded.',
      'Upload or snap your Student ID Card alongside your approved Hall Clearance Slip, Alumni Payment Receipt, and Library Clearance Slip.',
      'Click "Submit for Clearance" to route to the Sports Council Officer for sports kit and equipment verification.',
      'Once approved, download your official signed Sports Council Clearance Slip (PDF).',
    ],
  },
  7: {
    title: 'Faculty Office Clearance',
    time: '1 to 2 Working Days',
    instructions: [
      'Ensure all prerequisite clearances (Departmental, Sports, Library, Alumni, and Hall) are completed.',
      'Upload your Faculty Dues Receipts (100L to final year), Course Forms, and approved clearance slips (Department, Sports, Library, Alumni, Hall).',
      'Click "Submit for Clearance" to submit to your Faculty Clearance Officer.',
      'Once approved, download your official Faculty Clearance Slip (PDF) directly from this page.',
    ],
  },
  8: {
    title: 'Lodgings Clearance (Student Affairs)',
    time: 'Within 24 Hours',
    instructions: [
      'Ensure prerequisite clearances from Hall, Library, Department, and Faculty are completed.',
      'Upload or snap your Student ID Card alongside your approved Hall, Library, Department, and Faculty clearance slips.',
      'Click "Submit for Clearance" for digital accommodation verification by the Lodgings Officer.',
      'Once approved, download your official Lodgings Clearance Slip (PDF).',
    ],
  },
  9: {
    title: 'Bursar Clearance (Financial Verification)',
    time: '1 to 2 Working Days',
    instructions: [
      'Ensure all earlier section clearances (Library, Hall, Department, Sports, Faculty, Lodgings, Health Services) are cleared.',
      'Upload all required financial records: School Fee Receipts (100L through final year), Graduation Fee Receipt, Alumni Receipt, Health Services Clearance, Statement of Result, and earlier clearance slips.',
      'Click "Submit for Clearance" to route to the Bursary Audit Officer for comprehensive fee audit.',
      'Once cleared, download your official Bursary Clearance Letter / Slip (PDF).',
    ],
  },
  10: {
    title: 'Student Affairs Division Clearance (Final University Clearance)',
    time: '1 to 2 Working Days',
    instructions: [
      'Ensure Bursary and all preceding 9 clearance stages are approved.',
      'Upload your Bursary Clearance Slip, Graduation Fee Receipt, all School Fee Receipts (100L to final year), Statement of Result, and earlier section clearance slips.',
      'Click "Submit for Clearance" for final institutional verification by the Student Affairs Division.',
      'Upon final approval, your official University Final Clearance Letter is endorsed, qualifying you for NYSC mobilization and graduation clearance letter collection!',
    ],
  },
};

/**
 * Dedicated Clearance Stage Page with authentic University of Ibadan Clearance Guide.
 */
export default function StageDetail() {
  const { user } = useAuth();
  const { stageId } = useParams();
  const navigate = useNavigate();

  const [stages, setStages] = useState([]);
  const [docStages, setDocStages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [studentRemarks, setStudentRemarks] = useState('');
  const [showGuide, setShowGuide] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [downloadingSlip, setDownloadingSlip] = useState(false);
  const [formFields, setFormFields] = useState([]);
  const [formResponses, setFormResponses] = useState({});
  const [savingForm, setSavingForm] = useState(false);
  const [formSavedNotice, setFormSavedNotice] = useState('');
  const [profileStatus, setProfileStatus] = useState({ complete: true, missing: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const targetId = Number(stageId);

  const load = useCallback(async () => {
    try {
      const [status, docs, pays, fields] = await Promise.all([
        studentApi.clearanceStatus(),
        studentApi.documentsByStage(),
        studentApi.payments(),
        studentApi.stageForm(targetId).catch(() => []),
      ]);
      setStages(status.stages || []);
      setProfileStatus({
        complete: status.profile_complete !== false,
        missing: status.missing_profile_fields || [],
      });
      setDocStages(docs || []);
      setPayments(pays || []);
      setFormFields(fields || []);

      setFormResponses((prev) => {
        const next = { ...prev };
        for (const f of fields || []) {
          if (next[f.id] === undefined || next[f.id] === '') {
            next[f.id] = f.response_value || '';
          }
        }
        return next;
      });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [targetId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
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
  }, [load, stageId]);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveForm = async () => {
    setError('');
    setFormSavedNotice('');
    try {
      setSavingForm(true);
      await studentApi.saveStageForm(targetId, formResponses);
      setFormSavedNotice('Section form answers saved successfully.');
      setTimeout(() => setFormSavedNotice(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to save section form answers');
    } finally {
      setSavingForm(false);
    }
  };

  const currentStageIndex = stages.findIndex((s) => s.stage_id === targetId);
  const stage = currentStageIndex >= 0 ? stages[currentStageIndex] : null;
  const prevStage = currentStageIndex > 0 ? stages[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex >= 0 && currentStageIndex < stages.length - 1 ? stages[currentStageIndex + 1] : null;

  const requirements = docStages.find((d) => d.stage_id === targetId)?.required_documents || [];
  const receipt = payments.find((p) => p.stage_id === targetId && p.status === 'success');
  const needsPayment = stage ? Boolean(stage.requires_payment && !stage.payment_settled) : false;
  const locked = stage ? !stage.prerequisites_met : false;

  const mandatoryMissing = requirements.filter(
    (r) => r.is_mandatory && (r.documents || []).length === 0
  );

  const baseGuide = stage ? UI_STAGE_GUIDES[stage.stage_order] : null;
  const guide = baseGuide
    ? {
        ...baseGuide,
        title:
          stage.code === 'department'
            ? `Departmental Clearance — ${stage.student_department || user?.department || 'Academic Department'}`
            : stage.code === 'faculty'
              ? `Faculty Clearance — ${stage.student_faculty || user?.faculty || 'Faculty Office'}`
              : stage.code === 'hall'
                ? `Caution and Hall Clearance — ${stage.student_hall || user?.hall || 'Hall of Residence'}`
                : baseGuide.title,
        instructions:
          stage.code === 'department'
            ? [
                `You are clearing online with the ${stage.student_department || user?.department || 'academic'} department.`,
                `Your submission routes directly to your departmental clearance officer: ${stage.assigned_officer?.name || 'Department Officer'}${stage.assigned_officer?.email ? ` (${stage.assigned_officer.email})` : ''}.`,
                'Confirm all course units, project report submission, laboratory clearances, and departmental dues are fulfilled.',
                'Upload the required departmental documents below and click "Submit for Clearance". Your departmental officer will review and clear you in real time.',
                'Once approved, download your official Departmental Clearance Slip (PDF), which is required for Faculty and subsequent clearances.',
              ]
            : stage.code === 'faculty'
              ? [
                  `You are clearing online with the ${stage.student_faculty || user?.faculty || 'Faculty'} Dean's Office for academic endorsement.`,
                  `Your submission routes directly to your faculty clearance officer: ${stage.assigned_officer?.name || 'Faculty Officer'}${stage.assigned_officer?.email ? ` (${stage.assigned_officer.email})` : ''}.`,
                  'Ensure you have already downloaded your approved Departmental, Sports, Library, Alumni, and Hall clearance slips.',
                  'Upload your Faculty Dues Receipts, Course Forms, and prerequisite clearance slips below, then click "Submit for Clearance".',
                  'Upon verification, your faculty officer grants online approval and your Faculty Clearance Slip (PDF) is generated.',
                ]
              : stage.code === 'hall'
                ? [
                    `You are clearing online for your assigned hall of residence: ${stage.student_hall || user?.hall || 'Hall of Residence'}.`,
                    `Your submission routes directly to your Hall Clearance Officer: ${stage.assigned_officer?.name || 'Hall Clearance Officer'}${stage.assigned_officer?.email ? ` (${stage.assigned_officer.email})` : ''}.`,
                    'Ensure you have vacated/cleared your room and obtained maintenance inspection sign-off.',
                    'Upload all required documents below: School Fee Receipts (100L through final year), Room Clearance Form, Student ID Card, Passport Photograph, and Maintenance Clearance (or Off-Campus Form if you resided off-campus).',
                    'Upon review and approval by your Hall Clearance Officer, download your official signed Hall Clearance Slip (PDF).',
                  ]
              : baseGuide.instructions,
      }
    : null;

  const handlePay = async () => {
    if (!stage) return;
    setError('');
    setNotice('');
    try {
      setPaying(true);
      const res = await studentApi.pay(stage.stage_id);
      if (redirectToCheckout(res)) return;
      setNotice(res.message || 'Payment processed successfully.');
      await load();
    } catch (err) {
      setError(err.message || 'Payment initiation failed');
    } finally {
      setPaying(false);
    }
  };

  const handleSubmit = async () => {
    if (!stage) return;
    setError('');
    setNotice('');

    if (!profileStatus.complete) {
      setError(`Mandatory Profile Incomplete: You must complete your Student Profile (${profileStatus.missing.join(', ')}) before you can submit clearance. This ensures automatic SMS, WhatsApp, and Email alerts.`);
      return;
    }

    if (locked) {
      setError('Sequential Order Enforced: You cannot submit this clearance until all prerequisite stages are approved.');
      return;
    }

    // Check required form fields
    const missingField = formFields.find((f) => f.is_required && !String(formResponses[f.id] || '').trim());
    if (missingField) {
      setError(`Please complete the required section form field: "${missingField.field_label}"`);
      return;
    }

    const documentIds = requirements.flatMap((req) =>
      (req.documents || []).map((d) => d.id)
    );

    try {
      setBusy(true);
      const res = await studentApi.submitStage(stage.stage_id, documentIds, studentRemarks.trim() || null, formResponses);
      setNotice(res.message || `${stage.stage_name} submitted successfully for review.`);
      setStudentRemarks('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSlip = async () => {
    if (!stage) return;
    setError('');
    try {
      setDownloadingSlip(true);
      const blob = await studentApi.clearanceSlip(stage.stage_id);
      const cleanName = (stage.stage_name || 'stage').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      saveBlob(blob, `UI-Clearance-Slip-${cleanName}.pdf`);
    } catch (err) {
      setError(err.message || 'Failed to download clearance slip');
    } finally {
      setDownloadingSlip(false);
    }
  };

  if (loading) {
    return (
      <div className="stack">
        <div className="card">
          <SkeletonList rows={5} />
        </div>
      </div>
    );
  }

  if (!stage) {
    return (
      <div className="card">
        <EmptyState
          icon={IconFile}
          title="Clearance stage not found"
          message="The requested stage does not exist or you do not have permission to access it."
          action={
            <Link to="/student/stages" className="btn btn-primary">
              <IconArrowLeft width={16} height={16} /> Back to Clearance Stages
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack stage-detail-view">
      {/* Top Breadcrumb & Stepper */}
      <div className="stage-detail-nav">
        <Link to="/student/stages" className="btn btn-secondary btn-sm">
          <IconArrowLeft width={15} height={15} /> Back to Stages
        </Link>
        <span className="stage-stepper-counter">
          Step {stage.stage_order} of {stages.length}
        </span>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {!profileStatus.complete && (
        <div className="notice notice-warn" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb', padding: '1.25rem', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <strong style={{ fontSize: '1rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Mandatory Action: Complete Your Profile Before Submitting Clearance
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

      {/* Stage Header Banner */}
      <div className="card stage-detail-header-card">
        <div className="stage-detail-header-row">
          <div className="stage-detail-header-main">
            <span className={`stage-num stage-num-lg ${stage.status === 'approved' ? 'done' : ''}`}>
              {stage.stage_order}
            </span>
            <div>
              <h2 className="stage-detail-title">{stage.stage_name}</h2>
              {stage.assigned_officer && (
                <p className="stage-detail-officer" style={{ margin: '0.35rem 0', fontSize: '0.88rem', color: '#0284c7' }}>
                  <strong>👤 Assigned Officer:</strong> {stage.assigned_officer.name} ({stage.assigned_officer.email})
                </p>
              )}
              {stage.description && (
                <p className="stage-detail-desc">{stage.description}</p>
              )}
            </div>
          </div>
          <div className="stage-detail-status-col">
            <StatusBadge status={stage.status} />
            {stage.updated_at && (
              <span className="mini-meta">Updated {formatDate(stage.updated_at)}</span>
            )}
          </div>
        </div>

        {/* Dynamic Status Notice Cards */}
        {stage.status === 'approved' && (
          <div className="stage-status-banner banner-approved" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
              <div className="banner-icon">
                <IconCheck width={22} height={22} />
              </div>
              <div>
                <strong>Stage Cleared!</strong>
                <p>You have fulfilled all requirements for this clearance stage and received officer approval.</p>
                {stage.remarks && (
                  <p className="officer-remark">
                    <em>Officer note:</em> {stage.remarks}
                  </p>
                )}
              </div>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownloadSlip}
                disabled={downloadingSlip}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, padding: '0.6rem 1.1rem' }}
                title="Download your official signed Section Clearance Slip"
              >
                <IconFile width={16} height={16} />
                {downloadingSlip ? 'Generating Slip...' : 'Download Clearance Slip (PDF)'}
              </button>
            </div>
          </div>
        )}

        {stage.status === 'pending' && (
          <div className="stage-status-banner banner-pending">
            <div className="banner-icon">
              <IconClock width={22} height={22} />
            </div>
            <div>
              <strong>Submission Under Review</strong>
              <p>Your documents have been submitted to the section officer. You will be notified in real-time once verified.</p>
            </div>
          </div>
        )}

        {stage.status === 'rejected' && (
          <div className="stage-status-banner banner-rejected">
            <div>
              <strong>Action Required: Correction Needed</strong>
              <p>The section officer returned your submission with the following remarks:</p>
              <div className="rejection-reason-box">
                {stage.remarks || 'Please upload clearer or valid documents as specified below.'}
              </div>
              <p style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
                Please review the documents below, replace or snap new copies, and resubmit.
              </p>
            </div>
          </div>
        )}

        {stage.status !== 'approved' && locked && (
          <div className="stage-status-banner banner-locked" style={{ borderLeft: '4px solid #ef4444', background: '#fef2f2' }}>
            <div className="banner-icon" style={{ color: '#dc2626' }}>
              <IconLock width={24} height={24} />
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#991b1b', fontSize: '1rem' }}>
                Sequential Order Enforced — Clearance Section Locked
              </strong>
              <p style={{ color: '#7f1d1d', margin: '4px 0 10px', fontSize: '0.88rem' }}>
                Under University of Ibadan clearance regulations, this clearance stage cannot be performed or submitted until all preceding clearance stages required for this section have been verified and approved by their respective clearance officers.
              </p>

              {/* Interactive Prerequisite Stages Checklist */}
              <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #fecaca', padding: '10px 12px' }}>
                <strong style={{ fontSize: '0.82rem', color: '#475569', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Required Preceding Clearances for this Section:
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(stage.prerequisite_details || []).map((prereq) => (
                    <div
                      key={prereq.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: prereq.is_approved ? '#f0fdf4' : '#fff1f2',
                        border: `1px solid ${prereq.is_approved ? '#bbf7d0' : '#fecdd3'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            color: prereq.is_approved ? '#15803d' : '#be123c',
                            background: prereq.is_approved ? '#dcfce7' : '#ffe4e6',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          Step {prereq.stage_order}
                        </span>
                        <span style={{ fontSize: '0.88rem', color: '#1e293b', fontWeight: 600 }}>
                          {prereq.stage_name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <StatusBadge status={prereq.status} />
                        {!prereq.is_approved && (
                          <Link
                            to={`/student/stages/${prereq.id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '2px 8px', fontWeight: 600 }}
                          >
                            Go to Step {prereq.stage_order} →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* University of Ibadan Official Step Guide & Requirements Card */}
      {guide && (
        <div className="card ui-guide-card">
          <div className="ui-guide-header">
            <div className="ui-guide-header-title">
              <span className="ui-crest-badge">UI</span>
              <div>
                <h3 className="ui-guide-heading">University of Ibadan Clearance Guide</h3>
                <span className="ui-guide-subheading">Step {stage.stage_order}: {guide.title}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowGuide((v) => !v)}
              aria-expanded={showGuide}
            >
              {showGuide ? 'Hide Guide ▲' : 'View Guide ▼'}
            </button>
          </div>

          {showGuide && (
            <div className="ui-guide-body">
              <div className="ui-guide-meta-bar">
                <span className="ui-guide-meta-item">
                  <strong>💻 Clearance Mode:</strong> Online Portal Verification
                </span>
                <span className="ui-guide-meta-item">
                  <strong>⏱️ Estimated Review:</strong> {guide.time}
                </span>
              </div>

              <div className="ui-guide-instructions">
                <strong>Step-by-Step Portal Instructions:</strong>
                <ol style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
                  {guide.instructions.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: '0.35rem' }}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fee Payment Card (if stage requires payment) */}
      {stage.requires_payment && (
        <div className="card stage-payment-card">
          <SectionHeader
            title="Clearance fee"
            description="Fee settlement required for this section"
          />
          {receipt ? (
            <div className="payment-receipt-badge">
              <div className="receipt-meta">
                <span className="receipt-check">✓</span>
                <div>
                  <strong>Fee Settled — ₦{Number(receipt.amount).toLocaleString()}</strong>
                  <p>Transaction Reference: {receipt.reference} · Paid on {formatDate(receipt.paid_at || receipt.created_at)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="payment-action-box">
              <div className="payment-amount-display">
                <span className="payment-label">Required Amount:</span>
                <span className="payment-value">₦{Number(stage.payment_amount || 0).toLocaleString()}</span>
              </div>
              <p className="payment-hint">
                Fee must be paid via Paystack checkout before your clearance can be submitted to the officer.
              </p>
              <button
                type="button"
                className="btn btn-warning"
                onClick={handlePay}
                disabled={paying || busy || locked}
              >
                <IconCard width={16} height={16} />
                {paying ? 'Processing...' : `Pay ₦${Number(stage.payment_amount || 0).toLocaleString()} via Paystack`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Section Clearance Information Form (Configured by Section Officer) */}
      {formFields.length > 0 && (
        <div className="card stage-custom-form-card">
          <SectionHeader
            title={`${stage.stage_name} — Section Form`}
            description="Complete the official section clearance information and declarations required by the officer"
          />

          {formSavedNotice && (
            <div className="notice" style={{ marginBottom: '1rem' }}>
              {formSavedNotice}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            {formFields.map((field) => (
              <div key={field.id} className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem', color: '#1e293b' }}>
                  {field.field_label}
                  {field.is_required ? (
                    <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>
                  ) : (
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.8rem', marginLeft: '6px' }}>(optional)</span>
                  )}
                </label>
                {field.help_text && (
                  <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
                    {field.help_text}
                  </p>
                )}

                {field.field_type === 'textarea' ? (
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={formResponses[field.id] || ''}
                    onChange={(e) => setFormResponses({ ...formResponses, [field.id]: e.target.value })}
                    placeholder={field.placeholder || ''}
                    disabled={locked || stage.status === 'approved' || stage.status === 'pending' || busy}
                    required={field.is_required}
                  />
                ) : field.field_type === 'select' ? (
                  <select
                    className="form-select"
                    value={formResponses[field.id] || ''}
                    onChange={(e) => setFormResponses({ ...formResponses, [field.id]: e.target.value })}
                    disabled={locked || stage.status === 'approved' || stage.status === 'pending' || busy}
                    required={field.is_required}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="">{field.placeholder || 'Select an option...'}</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                    className="form-input"
                    value={formResponses[field.id] || ''}
                    onChange={(e) => setFormResponses({ ...formResponses, [field.id]: e.target.value })}
                    placeholder={field.placeholder || ''}
                    disabled={locked || stage.status === 'approved' || stage.status === 'pending' || busy}
                    required={field.is_required}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                )}
              </div>
            ))}
          </div>

          {stage.status !== 'approved' && stage.status !== 'pending' && !locked && (
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSaveForm}
                disabled={savingForm || busy}
              >
                {savingForm ? 'Saving Answers...' : 'Save Form Information'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Document Requirements & Upload / Camera Snapper */}
      <div className="card stage-docs-card">
        <SectionHeader
          title="Required documents & credentials"
          description={
            locked
              ? 'Document uploads are locked until prerequisite clearances above are approved'
              : 'Upload files from your device or snap them directly using your camera'
          }
        />

        {locked && (
          <div className="notice notice-warn" style={{ marginBottom: '1rem' }}>
            <strong>Sequential Order Enforced:</strong> You cannot upload documents or submit for clearance in this section until all required prerequisite stages above are approved.
          </div>
        )}

        <DocumentRequirements
          requirements={requirements}
          onChanged={refresh}
          readOnly={locked || stage.status === 'approved' || stage.status === 'pending'}
        />

        {/* Notes & Submission Action Box */}
        {stage.status !== 'approved' && stage.status !== 'pending' && (
          <div className="stage-submission-box">
            <label className="form-group">
              <span className="form-label">Note for Section Officer (optional):</span>
              <textarea
                rows={3}
                className="form-textarea"
                placeholder="e.g. Attached my 2024 bank teller and original student ID"
                value={studentRemarks}
                onChange={(e) => setStudentRemarks(e.target.value)}
                maxLength={500}
                disabled={busy || locked}
              />
            </label>

            {locked && (
              <div className="notice notice-warn">
                <strong>Clearance Section Locked:</strong> Complete and obtain approval for all prerequisite clearances above before submitting this section.
              </div>
            )}

            {!locked && mandatoryMissing.length > 0 && (
              <div className="notice notice-warn">
                <strong>Missing required documents:</strong> {mandatoryMissing.map((r) => r.label).join(', ')}. Please upload or snap them before submitting.
              </div>
            )}

            {!locked && needsPayment && (
              <div className="notice notice-warn">
                <strong>Payment required:</strong> Settle the ₦{Number(stage.payment_amount || 0).toLocaleString()} section fee before submitting.
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={busy || needsPayment || mandatoryMissing.length > 0 || locked}
              >
                <IconCheck width={16} height={16} />
                {busy
                  ? 'Submitting…'
                  : stage.status === 'rejected'
                    ? 'Resubmit for Review'
                    : 'Submit for Clearance'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Next Stage Navigation Footer */}
      <div className="stage-detail-footer-nav">
        {prevStage ? (
          <Link to={`/student/stages/${prevStage.stage_id}`} className="btn btn-secondary btn-sm">
            <IconArrowLeft width={14} height={14} /> Previous: {prevStage.stage_name}
          </Link>
        ) : (
          <div />
        )}

        {nextStage && (
          <Link to={`/student/stages/${nextStage.stage_id}`} className="btn btn-secondary btn-sm">
            Next: {nextStage.stage_name} <IconChevronRight width={14} height={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
