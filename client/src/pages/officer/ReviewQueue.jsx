import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { officerApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { realtime } from '../../services/realtime';
import {
  IconCheck,
  IconClipboard,
  IconEye,
  IconFile,
  IconInbox,
  IconSearch,
  IconSparkles,
} from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, StatCard, formatDate } from '../../components/Ui';
import DocumentPreviewModal from '../../components/DocumentPreviewModal';
import { getFaculties, getDepartmentsForFaculty } from '../../data/academicStructure';

/** Canned rejection reasons. Picking one fills the textarea, which stays editable. */
const REJECTION_TEMPLATES = [
  'Documents are unclear or unreadable. Please upload clearer copies.',
  'Wrong document uploaded. Please upload the correct one.',
  'Incomplete submission. Please attach all required documents.',
  'Document appears expired or invalid. Please upload a valid one.',
  'Name or matric number on the document does not match your profile.',
  'Outstanding obligation in this section. Please settle it and resubmit.',
];

export default function ReviewQueue() {
  const { user } = useAuth();
  const [stage, setStage] = useState(null);
  const [pending, setPending] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [decision, setDecision] = useState(null); // { studentId, type }
  const [remarks, setRemarks] = useState('');
  const [selected, setSelected] = useState([]); // student ids ticked for bulk action
  const [bulk, setBulk] = useState(null); // 'approved' | 'rejected' while the bulk panel is open
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [officerProfile, setOfficerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Productivity filters & document preview
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'ready' | 'missing'
  const [searchQuery, setSearchQuery] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewDocList, setPreviewDocList] = useState([]);

  const load = useCallback(async () => {
    try {
      const [queue, reqs, prof] = await Promise.all([
        officerApi.pending(),
        officerApi.requirements(),
        officerApi.profile().catch(() => null),
      ]);
      const requests = queue.requests || [];
      setStage(queue.stage || null);
      setPending(requests);
      setChecklist((reqs.requirements || []).filter((r) => r.is_required));
      if (prof) setOfficerProfile(prof);
      // Drop ticks for students who are no longer in the queue.
      const ids = new Set(requests.map((r) => r.student_id));
      setSelected((prev) => prev.filter((id) => ids.has(id)));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();

    const unsubQueue = realtime.on('queue:update', () => load());
    const unsubClear = realtime.on('clearance:update', () => load());
    const unsubDocs = realtime.on('documents:update', () => load());
    return () => {
      unsubQueue();
      unsubClear();
      unsubDocs();
    };
  }, [load]);

  /** Which requested documents this student did not attach. */
  const missingFor = useCallback(
    (request) => {
      const submittedLabels = new Set((request.documents || []).map((d) => d.doc_label));
      return checklist.filter((r) => r.is_mandatory && !submittedLabels.has(r.label));
    },
    [checklist]
  );

  // Group pending into ready (all mandatory documents submitted) and incomplete
  const { readyStudents, incompleteStudents } = useMemo(() => {
    const ready = [];
    const incomplete = [];
    for (const req of pending) {
      if (missingFor(req).length === 0) {
        ready.push(req);
      } else {
        incomplete.push(req);
      }
    }
    return { readyStudents: ready, incompleteStudents: incomplete };
  }, [pending, missingFor]);

  const allFaculties = useMemo(() => getFaculties(), []);
  const availableDepts = useMemo(
    () => (facultyFilter ? getDepartmentsForFaculty(facultyFilter) : []),
    [facultyFilter]
  );

  // Apply active tab, search query, and faculty/dept filters
  const filteredList = useMemo(() => {
    let list = pending;
    if (filterTab === 'ready') {
      list = readyStudents;
    } else if (filterTab === 'missing') {
      list = incompleteStudents;
    }

    if (facultyFilter) {
      const fNorm = facultyFilter.replace(/^Faculty of\s+/i, '').toLowerCase().trim();
      list = list.filter((r) => (r.faculty || '').toLowerCase().includes(fNorm));
    }
    if (departmentFilter) {
      list = list.filter((r) => (r.department || '').toLowerCase() === departmentFilter.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.full_name?.toLowerCase().includes(q) ||
          r.matric_number?.toLowerCase().includes(q) ||
          r.department?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [pending, filterTab, searchQuery, facultyFilter, departmentFilter, readyStudents, incompleteStudents]);

  const allFilteredSelected =
    filteredList.length > 0 && filteredList.every((r) => selected.includes(r.student_id));

  const toggleSelected = (studentId) =>
    setSelected((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredList.map((r) => r.student_id));
      setSelected((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const merged = new Set([...selected, ...filteredList.map((r) => r.student_id)]);
      setSelected(Array.from(merged));
    }
  };

  const selectReadyOnly = () => {
    setSelected(readyStudents.map((r) => r.student_id));
  };

  const quickApproveAllReady = () => {
    if (readyStudents.length === 0) return;
    if (officerProfile && !officerProfile.has_signature) {
      setError('You must upload your official signature in Profile & Signature before approving student clearance.');
      return;
    }
    setSelected(readyStudents.map((r) => r.student_id));
    openBulk('approved');
  };

  const startDecision = (studentId, type) => {
    if (type === 'approved' && officerProfile && !officerProfile.has_signature) {
      setError('You must upload your official signature in Profile & Signature before approving student clearance.');
      return;
    }
    setDecision({ studentId, type });
    setRemarks('');
    setOpenId(studentId);
  };

  const submitDecision = async () => {
    if (!decision || !stage) return;

    if (decision.type === 'rejected' && !remarks.trim()) {
      setError('Give the student a reason so they know what to fix.');
      return;
    }

    setError('');
    try {
      setBusy(true);
      await officerApi.review(decision.studentId, stage.id, decision.type, remarks);
      setNotice(`Submission ${decision.type}.`);
      setDecision(null);
      setRemarks('');
      setOpenId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openBulk = (type) => {
    if (type === 'approved' && officerProfile && !officerProfile.has_signature) {
      setError('You must upload your official signature in Profile & Signature before approving student clearance.');
      return;
    }
    setBulk(type);
    setBulkRemarks('');
    setError('');
    setNotice('');
  };

  const submitBulk = async () => {
    if (!bulk || selected.length === 0) return;

    if (bulk === 'rejected' && !bulkRemarks.trim()) {
      setError('Give the students a reason so they know what to fix.');
      return;
    }

    setError('');
    try {
      setBusy(true);
      const result = await officerApi.reviewBulk(selected, bulk, bulkRemarks);
      const failed = result?.failed || [];
      setNotice(
        result?.message ||
          `${result?.succeeded?.length ?? 0} submission(s) ${bulk}${
            failed.length ? `, ${failed.length} failed` : ''
          }.`
      );
      if (failed.length) {
        const names = new Map(pending.map((r) => [r.student_id, r.full_name]));
        setError(
          failed
            .map((f) => `${names.get(f.student_id) || f.student_id}: ${f.reason || 'could not be updated'}`)
            .join('; ')
        );
      }
      setBulk(null);
      setBulkRemarks('');
      setSelected([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPreview = (doc, allDocs = []) => {
    setPreviewDoc(doc);
    setPreviewDocList(allDocs);
  };

  // Templates for a single rejection: the static ones plus "Missing: …" lines
  // built from what this particular student left out.
  const templatesFor = useCallback(
    (request) => {
      const missing = request ? missingFor(request) : [];
      return [
        ...missing.map((m) => `Missing required document: ${m.label}. Please upload it and resubmit.`),
        ...REJECTION_TEMPLATES,
      ];
    },
    [missingFor]
  );

  const bulkTemplates = useMemo(() => REJECTION_TEMPLATES, []);

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const TemplatePicker = ({ templates, onPick }) => (
    <select
      className="template-select"
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      aria-label="Insert a reason template"
    >
      <option value="">Insert a reason template…</option>
      {templates.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {officerProfile && !officerProfile.has_signature && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>
              ⚠️ Official Signature & Profile Required Before Approving Clearances
            </strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              University policy requires your full name and official digital signature to be uploaded before you can approve student submissions. Your signature will appear automatically on students' official clearance slips.
            </p>
          </div>
          <Link to="/officer/profile" className="btn btn-warning btn-sm" style={{ fontWeight: 600 }}>
            Upload Signature Now →
          </Link>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Awaiting review" value={pending.length} icon={IconInbox} />
        <StatCard
          label="Ready for 1-click approval"
          value={readyStudents.length}
          hint="All mandatory docs verified"
          icon={IconCheck}
        />
        <StatCard
          label="Documents requested"
          value={checklist.length}
          hint="Your section's checklist"
          icon={IconClipboard}
        />
        <StatCard
          label="Oldest submission"
          value={pending[0] ? formatDate(pending[0].submitted_at) : '—'}
        />
      </div>

      <div className="card">
        {user?.department ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: '#fef7ee',
              border: '1px solid #e6decb',
              color: '#78350f',
              padding: '0.65rem 1rem',
              borderRadius: '6px',
              marginBottom: '1.25rem',
            }}
          >
            <div>
              <strong>📍 Department Review Scope:</strong> {user.department}
              {user.faculty && <span style={{ color: '#4b5563', marginLeft: '0.5rem' }}>({user.faculty})</span>}
            </div>
            <span
              style={{
                fontSize: '0.8rem',
                background: '#fbeacf',
                color: '#78350f',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              Restricted to graduating students of {user.department}
            </span>
          </div>
        ) : user?.faculty ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              padding: '0.65rem 1rem',
              borderRadius: '6px',
              marginBottom: '1.25rem',
            }}
          >
            <div>
              <strong>📍 Faculty Review Scope:</strong> Faculty of {user.faculty.replace(/^Faculty of\s+/i, '')}
            </div>
            <span
              style={{
                fontSize: '0.8rem',
                background: '#dcfce7',
                color: '#15803d',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              Covers all departments under {user.faculty}
            </span>
          </div>
        ) : null}

        <SectionHeader
          title={
            user?.department
              ? `Department of ${user.department} — Review Queue`
              : user?.faculty
              ? `Faculty of ${user.faculty.replace(/^Faculty of\s+/i, '')} — Review Queue`
              : stage
              ? `${stage.stage_name} review queue`
              : 'Review queue'
          }
          description="Filter, inspect, and approve multiple student submissions in seconds"
          action={
            <div className="section-actions-group">
              {readyStudents.length > 0 && !bulk && (
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={quickApproveAllReady}
                  title="Approve all submissions with complete documents in 1 step"
                >
                  <IconSparkles width={15} height={15} />
                  Quick Approve All Ready ({readyStudents.length})
                </button>
              )}
              <Link to="/officer/requirements" className="btn btn-secondary btn-sm">
                Edit checklist
              </Link>
            </div>
          }
        />

        {/* Productivity Filter & Search Bar */}
        <div className="queue-filter-toolbar">
          <div className="queue-filter-tabs">
            <button
              type="button"
              className={`filter-tab-pill ${filterTab === 'all' ? 'filter-tab-active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Submissions <span className="tab-pill-count">{pending.length}</span>
            </button>
            <button
              type="button"
              className={`filter-tab-pill filter-pill-ready ${filterTab === 'ready' ? 'filter-tab-active' : ''}`}
              onClick={() => setFilterTab('ready')}
            >
              Ready to Approve <span className="tab-pill-count count-ready">{readyStudents.length}</span>
            </button>
            <button
              type="button"
              className={`filter-tab-pill filter-pill-missing ${filterTab === 'missing' ? 'filter-tab-active' : ''}`}
              onClick={() => setFilterTab('missing')}
            >
              Missing Docs <span className="tab-pill-count count-missing">{incompleteStudents.length}</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {!user?.department && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!user?.faculty && (
                  <select
                    value={facultyFilter}
                    onChange={(e) => {
                      setFacultyFilter(e.target.value);
                      setDepartmentFilter('');
                    }}
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem', borderRadius: 4 }}
                  >
                    <option value="">All Faculties</option>
                    {allFaculties.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem', borderRadius: 4 }}
                  disabled={!user?.faculty && !facultyFilter}
                >
                  <option value="">All Departments</option>
                  {(user?.faculty ? getDepartmentsForFaculty(user.faculty) : availableDepts).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="queue-search-input-wrap">
              <IconSearch width={15} height={15} className="queue-search-icon" />
              <input
                type="text"
                placeholder="Search student, matric, email..."
                className="queue-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {(searchQuery || facultyFilter || departmentFilter) && (
                <button
                  type="button"
                  className="queue-search-clear"
                  onClick={() => {
                    setSearchQuery('');
                    setFacultyFilter('');
                    setDepartmentFilter('');
                  }}
                  title="Clear filters"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="bulk-bar">
            <div className="bulk-left-actions">
              <label className="bulk-check">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                />
                <span>
                  {selected.length > 0 ? `${selected.length} selected` : 'Select filtered'}
                </span>
              </label>

              {readyStudents.length > 0 && selected.length !== readyStudents.length && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-select-ready"
                  onClick={selectReadyOnly}
                  title="Tick only students who have attached all required documents"
                >
                  Select all ready ({readyStudents.length})
                </button>
              )}
            </div>

            {selected.length > 0 && !bulk && (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => openBulk('approved')}
                  disabled={busy}
                >
                  <IconCheck width={14} height={14} />
                  Approve selected ({selected.length})
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => openBulk('rejected')}
                  disabled={busy}
                >
                  Reject selected ({selected.length})
                </button>
              </div>
            )}
          </div>
        )}

        {bulk && selected.length > 0 && (
          <div className="decision-panel bulk-panel">
            <label>
              {bulk === 'rejected'
                ? `Reason for rejecting ${selected.length} submission(s) (required — students see this)`
                : `Remarks for ${selected.length} approval(s) (optional)`}
              <textarea
                rows={3}
                value={bulkRemarks}
                onChange={(e) => setBulkRemarks(e.target.value)}
                placeholder={bulk === 'rejected' ? 'State what needs to be fixed...' : 'Optional approval notes'}
                maxLength={500}
                autoFocus
              />
            </label>
            {bulk === 'rejected' && (
              <TemplatePicker templates={bulkTemplates} onPick={setBulkRemarks} />
            )}
            <div className="form-actions">
              <button
                type="button"
                className={`btn btn-sm ${bulk === 'rejected' ? 'btn-danger' : 'btn-success'}`}
                onClick={submitBulk}
                disabled={busy}
              >
                {busy ? 'Saving…' : bulk === 'rejected' ? 'Confirm rejection' : 'Confirm approval'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBulk(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {filteredList.length === 0 ? (
          <EmptyState
            icon={IconCheck}
            title={pending.length === 0 ? 'Nothing to review' : 'No matching submissions'}
            message={
              pending.length === 0
                ? 'No students are waiting on your section. New submissions will appear here automatically.'
                : 'No submissions matched your current filter criteria.'
            }
          />
        ) : (
          <ul className="stage-list">
            {filteredList.map((req) => {
              const isOpen = openId === req.student_id;
              const missing = missingFor(req);
              const isReady = missing.length === 0;
              const deciding = decision?.studentId === req.student_id;
              const docCount = req.documents?.length || 0;

              return (
                <li key={req.clearance_status_id} className="stage-item stage-item-column">
                  <div className="queue-row">
                    <input
                      type="checkbox"
                      className="queue-check"
                      checked={selected.includes(req.student_id)}
                      onChange={() => toggleSelected(req.student_id)}
                      aria-label={`Select ${req.full_name}`}
                    />
                    <button
                      type="button"
                      className="stage-toggle"
                      onClick={() => setOpenId(isOpen ? null : req.student_id)}
                      aria-expanded={isOpen}
                    >
                      <div className="stage-main">
                        {req.passport_url ? (
                          <img
                            src={req.passport_url}
                            alt={req.full_name}
                            className="avatar avatar-sm"
                            style={{ objectFit: 'cover' }}
                          />
                        ) : (
                          <span className="avatar avatar-sm">
                            {req.full_name?.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <strong>{req.full_name}</strong>
                          <p className="stage-loc">
                            {req.matric_number}
                            {req.department ? ` · ${req.department}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="stage-actions">
                        {isReady ? (
                          <span className="req-tag req-tag-ready">
                            <IconCheck width={12} height={12} />
                            All docs complete
                          </span>
                        ) : (
                          <span className="req-tag req-tag-warn">
                            {missing.length} missing
                          </span>
                        )}

                        <span className="req-tag">
                          {docCount} file{docCount === 1 ? '' : 's'}
                        </span>
                        <span className="mini-meta">{formatDate(req.submitted_at)}</span>

                        {/* Fast row-level approval action */}
                        {isReady && !isOpen && (
                          <button
                            type="button"
                            className="btn btn-success btn-sm btn-row-quick-approve"
                            title="Quick Approve this student"
                            onClick={(e) => {
                              e.stopPropagation();
                              startDecision(req.student_id, 'approved');
                            }}
                          >
                            <IconCheck width={14} height={14} />
                            Approve
                          </button>
                        )}

                        <span aria-hidden="true" className="chevron">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="submit-panel">
                      {req.remarks && (
                        <p className="student-remark">
                          <strong>Student note:</strong> {req.remarks}
                        </p>
                      )}

                      {/* Display Section Form Questions & Responses filled by the student */}
                      {req.form_responses && req.form_responses.length > 0 && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <IconClipboard width={15} height={15} /> Student Section Form Responses ({req.form_responses.length})
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                            {req.form_responses.map((ans) => (
                              <div key={ans.field_id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px' }}>
                                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, display: 'block' }}>
                                  {ans.field_label}
                                </span>
                                <span style={{ fontSize: '0.88rem', color: '#0f172a', fontWeight: 500, display: 'block', marginTop: '2px', wordBreak: 'break-word' }}>
                                  {ans.response_value || '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {missing.length > 0 && (
                        <div className="notice notice-warn">
                          <strong>Not attached:</strong> {missing.map((m) => m.label).join(', ')}
                        </div>
                      )}

                      <div className="panel-subhead-row">
                        <h4 className="panel-heading" style={{ margin: 0 }}>
                          Submitted documents ({docCount})
                        </h4>
                        {docCount > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenPreview(req.documents[0], req.documents)}
                          >
                            <IconEye width={14} height={14} />
                            Preview All ({docCount})
                          </button>
                        )}
                      </div>

                      {docCount === 0 ? (
                        <p className="cell-muted">No documents were attached to this submission.</p>
                      ) : (
                        <ul className="req-files req-files-block">
                          {req.documents.map((doc) => (
                            <li key={doc.id} className="req-file-item-interactive">
                              <div className="req-file-left">
                                <span className="file-link">
                                  <IconFile width={15} height={15} />
                                  {doc.doc_label || doc.original_name}
                                </span>
                                <span className="cell-muted">{doc.original_name}</span>
                              </div>
                              <div className="req-file-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleOpenPreview(doc, req.documents)}
                                  title="Quick preview without leaving tab"
                                >
                                  <IconEye width={14} height={14} />
                                  Preview
                                </button>
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-secondary btn-sm"
                                  title="Open original file in new tab"
                                >
                                  Open
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      {deciding ? (
                        <div className="decision-panel">
                          <label>
                            {decision.type === 'rejected'
                              ? 'Reason for rejection (required — the student sees this)'
                              : 'Remarks (optional)'}
                            <textarea
                              rows={3}
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              placeholder={
                                decision.type === 'rejected'
                                  ? 'e.g. The fee receipt for 300L is missing.'
                                  : 'Anything worth recording'
                              }
                              maxLength={500}
                              autoFocus
                            />
                          </label>
                          {decision.type === 'rejected' && (
                            <TemplatePicker templates={templatesFor(req)} onPick={setRemarks} />
                          )}
                          <div className="form-actions">
                            <button
                              type="button"
                              className={`btn btn-sm ${decision.type === 'rejected' ? 'btn-danger' : 'btn-success'}`}
                              onClick={submitDecision}
                              disabled={busy}
                            >
                              {busy
                                ? 'Saving…'
                                : decision.type === 'rejected'
                                  ? 'Confirm rejection'
                                  : 'Confirm approval'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setDecision(null)}
                              disabled={busy}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="form-actions">
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => startDecision(req.student_id, 'approved')}
                          >
                            <IconCheck width={14} height={14} />
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => startDecision(req.student_id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Inline Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          docs={previewDocList}
          onClose={() => setPreviewDoc(null)}
          onSelectDoc={(d) => setPreviewDoc(d)}
        />
      )}
    </div>
  );
}
