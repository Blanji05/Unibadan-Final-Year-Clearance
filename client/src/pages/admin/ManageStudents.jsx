import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../services/api';
import { saveBlob } from '../../services/download';
import { realtime } from '../../services/realtime';
import StudentImport from './StudentImport';
import { IconAward, IconPlus, IconTrash, IconUsers } from '../../components/Icons';
import {
  EmptyState,
  ProgressBar,
  SectionHeader,
  SkeletonList,
  StatusBadge,
  formatDate,
} from '../../components/Ui';
import { getFaculties, getDepartmentsForFaculty, UI_HALLS } from '../../data/academicStructure';

const BLANK = {
  full_name: '',
  email: '',
  matric_number: '',
  password: '',
  department: '',
  faculty: '',
  hall: '',
  phone_number: '',
};

export default function ManageStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [hallFilter, setHallFilter] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(BLANK);

  const faculties = useMemo(() => getFaculties(), []);
  const formDepts = useMemo(
    () => (form.faculty ? getDepartmentsForFaculty(form.faculty) : []),
    [form.faculty]
  );
  const editDepts = useMemo(
    () => (editForm.faculty ? getDepartmentsForFaculty(editForm.faculty) : []),
    [editForm.faculty]
  );

  // Expanded student: clearance rows are fetched lazily and cached here.
  const [openId, setOpenId] = useState(null);
  const [clearance, setClearance] = useState([]);
  const [loadingClearance, setLoadingClearance] = useState(false);
  const [override, setOverride] = useState({ stageId: null, status: 'approved', remarks: '' });

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setStudents(await adminApi.students());
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    const handleRealtime = async () => {
      await load(true);
      if (openId) {
        try {
          setClearance(await adminApi.studentClearance(openId));
        } catch {
          /* ignore */
        }
      }
    };
    const unsubQueue = realtime.on('queue:update', handleRealtime);
    const unsubClear = realtime.on('clearance:update', handleRealtime);
    const unsubUsers = realtime.on('users:update', handleRealtime);
    return () => {
      unsubQueue();
      unsubClear();
      unsubUsers();
    };
  }, [openId]);

  const run = async (fallback, fn) => {
    setError('');
    setNotice('');
    try {
      setBusy(true);
      const result = await fn();
      setNotice(result?.message || fallback);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.hall.trim()) {
      setError('Hall of residence is compulsory.');
      return;
    }
    const ok = await run('Student created.', () => adminApi.createStudent(form));
    if (ok) {
      setForm(BLANK);
      setShowAdd(false);
    }
  };

  const startEdit = (student) => {
    setEditingId(student.id);
    setEditForm({
      full_name: student.full_name,
      email: student.email,
      matric_number: student.matric_number,
      password: '',
      department: student.department || '',
      faculty: student.faculty || '',
      hall: student.hall || '',
      phone_number: student.phone_number || '',
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editForm.hall.trim()) {
      setError('Hall of residence is compulsory.');
      return;
    }
    const { password, ...payload } = editForm; // password has its own action
    const ok = await run('Record updated.', () => adminApi.updateStudent(editingId, payload));
    if (ok) setEditingId(null);
  };

  const remove = (student) => {
    if (
      !window.confirm(
        `Delete ${student.full_name} (${student.matric_number})? Their documents, payments and clearance history go with them.`
      )
    )
      return;
    return run('Student deleted.', () => adminApi.deleteStudent(student.id));
  };

  const handleDeleteAll = () => {
    if (!students.length) return;
    const confirmText = window.prompt(
      `⚠️ PERMANENT ACTION: Are you sure you want to delete ALL ${students.length.toLocaleString()} students from the site?\n\nThis will delete all student records, clearance statuses, and submitted files.\n\nType "DELETE ALL" to confirm:`
    );
    if (confirmText !== 'DELETE ALL') {
      if (confirmText !== null) {
        alert('Action cancelled. You must type "DELETE ALL" exactly.');
      }
      return;
    }
    return run('All students deleted.', () => adminApi.deleteAllStudents());
  };

  const resetPassword = (student) => {
    const password = window.prompt(`New password for ${student.full_name} (at least 8 characters):`);
    if (!password) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    return run('Password reset.', () => adminApi.resetPassword(student.id, password));
  };

  const issueCertificate = (student) =>
    run('Clearance letter generated.', async () => {
      const cert = await adminApi.generateCertificate(student.id);
      return { message: cert?.alreadyIssued ? 'Clearance letter already issued.' : 'Clearance letter generated.' };
    });

  /** Expand a row and pull that student's stage-by-stage state. */
  const toggleOpen = async (student) => {
    if (openId === student.id) {
      setOpenId(null);
      return;
    }
    setOpenId(student.id);
    setOverride({ stageId: null, status: 'approved', remarks: '' });
    try {
      setLoadingClearance(true);
      setClearance(await adminApi.studentClearance(student.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingClearance(false);
    }
  };

  const applyOverride = async (studentId) => {
    setError('');
    setNotice('');
    try {
      setBusy(true);
      const result = await adminApi.override(studentId, override.stageId, override.status, override.remarks);
      setNotice(result?.message || 'Stage updated.');
      setClearance(await adminApi.studentClearance(studentId));
      setOverride({ stageId: null, status: 'approved', remarks: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students
      .map((s) => ({
        ...s,
        approved: Number(s.approved_stages || 0),
        total: Number(s.total_stages || 0),
      }))
      .filter((s) => {
        if (filter === 'cleared' && !(s.total > 0 && s.approved === s.total)) return false;
        if (filter === 'in_progress' && !(s.approved > 0 && s.approved < s.total)) return false;
        if (filter === 'not_started' && s.approved !== 0) return false;
        if (facultyFilter) {
          const fNorm = facultyFilter.replace(/^Faculty of\s+/i, '').toLowerCase().trim();
          if (!(s.faculty || '').toLowerCase().includes(fNorm)) return false;
        }
        if (departmentFilter) {
          if ((s.department || '').toLowerCase() !== departmentFilter.toLowerCase()) return false;
        }
        if (hallFilter) {
          if ((s.hall || '').toLowerCase() !== hallFilter.toLowerCase()) return false;
        }
        if (!term) return true;
        return (
          s.full_name.toLowerCase().includes(term) ||
          s.matric_number?.toLowerCase().includes(term) ||
          s.email.toLowerCase().includes(term) ||
          s.department?.toLowerCase().includes(term) ||
          s.faculty?.toLowerCase().includes(term) ||
          (s.hall || '').toLowerCase().includes(term)
        );
      });
  }, [students, search, filter, facultyFilter, departmentFilter, hallFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, facultyFilter, departmentFilter, hallFilter]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, page, pageSize]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={5} />
      </div>
    );
  }

  const counts = {
    all: students.length,
    cleared: students.filter((s) => Number(s.total_stages) > 0 && Number(s.approved_stages) === Number(s.total_stages))
      .length,
    in_progress: students.filter(
      (s) => Number(s.approved_stages) > 0 && Number(s.approved_stages) < Number(s.total_stages)
    ).length,
    not_started: students.filter((s) => Number(s.approved_stages) === 0).length,
  };

  const TABS = [
    { key: 'all', label: 'All students' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'cleared', label: 'Fully cleared' },
    { key: 'not_started', label: 'Not started' },
  ];

  const handleDownloadCsv = async () => {
    try {
      const blob = await adminApi.exportCsv('students');
      const today = new Date().toISOString().slice(0, 10);
      saveBlob(blob, `students_profile_${today}.csv`);
    } catch (err) {
      setError(err.message || 'Failed to download students CSV');
    }
  };

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="card">
        <SectionHeader
          title="Student records"
          description="Add students, correct their details, and intervene in a stuck clearance"
          action={
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={handleDownloadCsv}
                title="Download updated student records with live profile edits"
              >
                📥 Download Students CSV
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)} type="button">
                <IconPlus width={15} height={15} />
                {showAdd ? 'Cancel' : 'Add student'}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleDeleteAll}
                type="button"
                disabled={busy || !students.length}
                title="Delete all student accounts from the portal"
              >
                <IconTrash width={14} height={14} /> Delete All Students
              </button>
            </div>
          }
        />

        <StudentImport onImported={load} />

        {showAdd && (
          <form className="inline-form" onSubmit={handleCreate}>
            <p className="inline-form-hint">
              The account is created with its clearance already started, so the student can sign in and begin
              immediately. Share the password with them directly.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label>Full name</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Matriculation number</label>
                <input
                  value={form.matric_number}
                  onChange={(e) => setForm({ ...form, matric_number: e.target.value })}
                  placeholder="e.g. 230922"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Temporary password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Faculty</label>
                <select
                  value={form.faculty}
                  onChange={(e) => setForm({ ...form, faculty: e.target.value, department: '' })}
                >
                  <option value="">Select Faculty…</option>
                  {faculties.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  disabled={!formDepts.length}
                >
                  <option value="">{form.faculty ? 'Select Department…' : 'First select a faculty'}</option>
                  {formDepts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Hall of residence *</label>
                <input
                  required
                  placeholder="e.g. Independence Hall, Queen Idia Hall, Off-Campus"
                  value={form.hall}
                  onChange={(e) => setForm({ ...form, hall: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Phone number</label>
                <input
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  placeholder="e.g. 08012345678"
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create student'}
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="tab-row">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab${filter === tab.key ? ' active' : ''}`}
              onClick={() => setFilter(tab.key)}
              type="button"
            >
              {tab.label}
              <span className="tab-count">{counts[tab.key]}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
          <div style={{ flex: 2, minWidth: '220px' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, matric number, email, department, faculty…"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <select
              value={facultyFilter}
              onChange={(e) => {
                setFacultyFilter(e.target.value);
                setDepartmentFilter('');
              }}
              style={{ width: '100%' }}
            >
              <option value="">All 21 Faculties</option>
              {faculties.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              disabled={!facultyFilter}
              style={{ width: '100%' }}
            >
              <option value="">{facultyFilter ? 'All Departments' : 'Select faculty first'}</option>
              {(facultyFilter ? getDepartmentsForFaculty(facultyFilter) : []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <select
              value={hallFilter}
              onChange={(e) => setHallFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All Residential Halls</option>
              {UI_HALLS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {(search || facultyFilter || departmentFilter || hallFilter) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setFacultyFilter('');
                setDepartmentFilter('');
                setHallFilter('');
              }}
            >
              Reset
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={IconUsers}
            title={students.length === 0 ? 'No students yet' : 'No matches'}
            message={
              students.length === 0
                ? 'Add a student directly, or import a whole class from a CSV file.'
                : 'Try a different search term or filter.'
            }
          />
        ) : (
          <ul className="req-list">
            {paginatedStudents.map((student) => (
              <li key={student.id} className="req-item">
                {editingId === student.id ? (
                  <form onSubmit={handleUpdate}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Full name</label>
                        <input
                          value={editForm.full_name}
                          onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Matriculation number</label>
                        <input
                          value={editForm.matric_number}
                          onChange={(e) => setEditForm({ ...editForm, matric_number: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Email</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Phone number</label>
                        <input
                          value={editForm.phone_number}
                          onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Faculty</label>
                        <select
                          value={editForm.faculty}
                          onChange={(e) => setEditForm({ ...editForm, faculty: e.target.value, department: '' })}
                        >
                          <option value="">Select Faculty…</option>
                          {faculties.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Department</label>
                        <select
                          value={editForm.department}
                          onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                          disabled={!editDepts.length}
                        >
                          <option value="">{editForm.faculty ? 'Select Department…' : 'First select a faculty'}</option>
                          {editDepts.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Hall of residence *</label>
                      <input
                        required
                        placeholder="e.g. Independence Hall, Queen Idia Hall, Off-Campus"
                        value={editForm.hall}
                        onChange={(e) => setEditForm({ ...editForm, hall: e.target.value })}
                      />
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                        Save changes
                      </button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="req-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {student.passport_url ? (
                          <img
                            src={student.passport_url}
                            alt={student.full_name}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '1px solid #cbd5e1',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              backgroundColor: '#e0f2fe',
                              color: '#0369a1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontWeight: 'bold',
                              fontSize: '0.9rem',
                            }}
                          >
                            {student.full_name?.charAt(0) || 'S'}
                          </div>
                        )}
                        <div>
                          <strong>{student.full_name}</strong>
                          <p className="stage-loc">
                            {student.matric_number} · {student.email}
                          </p>
                          <p className="req-asked-by">
                            {student.department || 'No department'}
                            {student.hall ? ` · ${student.hall}` : ''} · joined {formatDate(student.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="stage-actions">
                        {!student.is_active && <span className="req-tag req-tag-warn">disabled</span>}
                        <span className="mini-meta">
                          {student.approved}/{student.total} cleared
                        </span>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => toggleOpen(student)}>
                          {openId === student.id ? 'Hide clearance' : 'Clearance'}
                        </button>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(student)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => resetPassword(student)}
                          disabled={busy}
                        >
                          Reset password
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => remove(student)}
                          disabled={busy}
                          title="Delete student"
                        >
                          <IconTrash width={14} height={14} />
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '0.7rem' }}>
                      <ProgressBar value={student.approved} total={student.total || 1} />
                    </div>

                    {openId === student.id && (
                      <div className="decision-panel">
                        {loadingClearance ? (
                          <SkeletonList rows={3} />
                        ) : (
                          <>
                            <div className="section-header">
                              <div>
                                <h2 style={{ fontSize: '0.98rem' }}>Stage-by-stage status</h2>
                                <p>Override a stage only when the normal review path cannot resolve it.</p>
                              </div>
                              {student.total > 0 && student.approved === student.total && (
                                <button
                                  className="btn btn-primary btn-sm"
                                  type="button"
                                  onClick={() => issueCertificate(student)}
                                  disabled={busy}
                                >
                                  <IconAward width={14} height={14} />
                                  Issue clearance letter
                                </button>
                              )}
                            </div>

                            <div className="table-wrap">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Section</th>
                                    <th>Status</th>
                                    <th>Reviewed by</th>
                                    <th>Remarks</th>
                                    <th className="row-actions">Override</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clearance.map((stage) => (
                                    <tr key={stage.stage_id}>
                                      <td className="cell-muted">{stage.stage_order}</td>
                                      <td>{stage.stage_name}</td>
                                      <td>
                                        <StatusBadge status={stage.status} />
                                      </td>
                                      <td className="cell-muted">{stage.officer_name || '—'}</td>
                                      <td className="cell-wrap cell-muted">{stage.remarks || '—'}</td>
                                      <td className="row-actions">
                                        <button
                                          className="btn btn-secondary btn-sm"
                                          type="button"
                                          onClick={() =>
                                            setOverride({
                                              stageId:
                                                override.stageId === stage.stage_id ? null : stage.stage_id,
                                              status: 'approved',
                                              remarks: '',
                                            })
                                          }
                                        >
                                          {override.stageId === stage.stage_id ? 'Cancel' : 'Change'}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {override.stageId && (
                              <div className="inline-form" style={{ marginTop: '0.8rem' }}>
                                <p className="inline-form-hint">
                                  Overriding{' '}
                                  <strong>
                                    {clearance.find((s) => s.stage_id === override.stageId)?.stage_name}
                                  </strong>{' '}
                                  for {student.full_name}. This is recorded in the audit log against your account.
                                </p>
                                <div className="form-row">
                                  <div className="form-group">
                                    <label>New status</label>
                                    <select
                                      value={override.status}
                                      onChange={(e) => setOverride({ ...override, status: e.target.value })}
                                    >
                                      <option value="approved">Approved</option>
                                      <option value="rejected">Rejected</option>
                                      <option value="pending">Pending review</option>
                                      <option value="not_started">Reset to not started</option>
                                    </select>
                                  </div>
                                  <div className="form-group">
                                    <label>Reason (recorded)</label>
                                    <input
                                      value={override.remarks}
                                      onChange={(e) => setOverride({ ...override, remarks: e.target.value })}
                                      placeholder="e.g. Cleared in person at the Bursary"
                                    />
                                  </div>
                                </div>
                                <div className="form-actions">
                                  <button
                                    className="btn btn-warning btn-sm"
                                    type="button"
                                    onClick={() => applyOverride(student.id)}
                                    disabled={busy}
                                  >
                                    Apply override
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {visible.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 0.5rem 0.25rem',
              borderTop: '1px solid #e6decb',
              marginTop: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
              fontSize: '0.88rem',
            }}
          >
            <div style={{ color: '#796e65' }}>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
              <strong>{Math.min(page * pageSize, visible.length)}</strong> of{' '}
              <strong>{visible.length.toLocaleString()}</strong> students
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="First Page"
              >
                « First
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹ Prev
              </button>

              <span style={{ fontWeight: 600, padding: '0 0.5rem', color: '#28231d' }}>
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next ›
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Last Page"
              >
                Last »
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.75rem' }}>
                <span style={{ color: '#796e65' }}>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #e6decb' }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
