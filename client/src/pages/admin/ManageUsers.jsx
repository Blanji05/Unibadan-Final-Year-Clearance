import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../services/api';
import { realtime } from '../../services/realtime';
import { IconPlus, IconUsers, IconSearch } from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, formatDate } from '../../components/Ui';
import { getFaculties, getDepartmentsForFaculty, UI_HALLS } from '../../data/academicStructure';

const BLANK = {
  full_name: '',
  email: '',
  password: '',
  section_code: '',
  faculty: '',
  department: '',
  hall: '',
  phone_number: '',
};

export default function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [sections, setSections] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Search & Filtering
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [hallFilter, setHallFilter] = useState('');

  const faculties = useMemo(() => getFaculties(), []);
  const formDepts = useMemo(
    () => (form.faculty ? getDepartmentsForFaculty(form.faculty) : []),
    [form.faculty]
  );

  const load = useCallback(async () => {
    try {
      const [userList, sectionList] = await Promise.all([adminApi.users(), adminApi.sections()]);
      setUsers(userList);
      setSections(sectionList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubUsers = realtime.on('users:update', () => load());
    const unsubStages = realtime.on('stages:update', () => load());
    return () => {
      unsubUsers();
      unsubStages();
    };
  }, [load]);

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
    const payload = {
      ...form,
      faculty: form.section_code === 'faculty' || form.section_code === 'department' ? form.faculty : null,
      department: form.section_code === 'department' ? form.department : null,
      hall: form.section_code === 'hall' ? form.hall : null,
    };
    const ok = await run(`Officer account created for ${form.email}.`, () => adminApi.createOfficer(payload));
    if (ok) {
      setForm(BLANK);
      setShowAdd(false);
    }
  };

  const toggleStatus = (user) => {
    const nextActive = !user.is_active;
    if (!window.confirm(`Really ${nextActive ? 'reactivate' : 'deactivate'} ${user.full_name}?`)) return;
    return run(
      `${user.full_name} ${nextActive ? 'reactivated' : 'deactivated'}.`,
      () => adminApi.setUserStatus(user.id, nextActive)
    );
  };

  const reassign = (user, sectionCode) => {
    if (!sectionCode || sectionCode === user.section_code) return;
    return run('Officer reassigned.', () =>
      adminApi.setOfficerSection(user.id, {
        section_code: sectionCode,
        faculty: user.faculty || null,
        department: user.department || null,
      })
    );
  };

  const resetPassword = (user) => {
    const password = window.prompt(`New password for ${user.full_name} (at least 8 characters):`);
    if (!password) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    return run('Password reset.', () => adminApi.resetPassword(user.id, password));
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const officers = users.filter((u) => u.role === 'officer');
  const admins = users.filter((u) => u.role === 'admin');

  // Filter officers
  const filteredOfficers = officers.filter((off) => {
    if (sectionFilter && off.section_code !== sectionFilter) return false;
    if (facultyFilter) {
      const fNorm = facultyFilter.replace(/^Faculty of\s+/i, '').toLowerCase().trim();
      if (!(off.faculty || '').toLowerCase().includes(fNorm)) return false;
    }
    if (hallFilter && off.hall !== hallFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        off.full_name?.toLowerCase().includes(q) ||
        off.email?.toLowerCase().includes(q) ||
        off.department?.toLowerCase().includes(q) ||
        off.faculty?.toLowerCase().includes(q) ||
        off.hall?.toLowerCase().includes(q) ||
        off.phone_number?.includes(q) ||
        off.stage_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Active sections with nobody assigned
  const unstaffed = sections.filter(
    (s) => s.is_active && !officers.some((o) => o.section_code === s.code && o.is_active)
  );

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {unstaffed.length > 0 && (
        <div className="notice-warn">
          <strong>
            {unstaffed.length} active section{unstaffed.length === 1 ? '' : 's'} have no officer:
          </strong>{' '}
          {unstaffed.map((s) => s.stage_name).join(', ')}. Students who reach {unstaffed.length === 1 ? 'it' : 'them'}{' '}
          will wait indefinitely.
        </div>
      )}

      <div className="card">
        <SectionHeader
          title="Section Officers"
          description={`${officers.length} staff accounts across sections, faculties, and departments`}
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)} type="button">
              <IconPlus width={15} height={15} />
              {showAdd ? 'Cancel' : 'Add officer'}
            </button>
          }
        />

        {showAdd && (
          <form className="inline-form" onSubmit={handleCreate}>
            <p className="inline-form-hint">
              Create an account for a departmental, faculty, or central clearance officer. Department officers only see
              submissions from students in their department.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label>Full name</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g. Dr. Babatunde Adeleke"
                  required
                />
              </div>
              <div className="form-group">
                <label>Clearance Section</label>
                <select
                  value={form.section_code}
                  onChange={(e) => setForm({ ...form, section_code: e.target.value, department: '' })}
                  required
                >
                  <option value="">Select a section…</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.stage_order}. {s.stage_name}
                      {s.is_active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cascading Faculty & Department pickers for Faculty and Department clearance */}
            {(form.section_code === 'department' || form.section_code === 'faculty') && (
              <div className="form-row">
                <div className="form-group">
                  <label>Faculty</label>
                  <select
                    value={form.faculty}
                    onChange={(e) => setForm({ ...form, faculty: e.target.value, department: '' })}
                    required
                  >
                    <option value="">Select Faculty…</option>
                    {faculties.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                {form.section_code === 'department' && (
                  <div className="form-group">
                    <label>Department</label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      disabled={!formDepts.length}
                      required
                    >
                      <option value="">{form.faculty ? 'Select Department…' : 'First select a faculty'}</option>
                      {formDepts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Residential Hall picker for Caution and Hall clearance */}
            {form.section_code === 'hall' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Assigned Residential Hall</label>
                  <select
                    value={form.hall}
                    onChange={(e) => setForm({ ...form, hall: e.target.value })}
                    required
                  >
                    <option value="">Select Hall of Residence…</option>
                    {UI_HALLS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Official Email</label>
                <input
                  type="email"
                  value={form.email}
                  placeholder="e.g. dept.computer-science@ui.edu.ng"
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
                  placeholder="At least 8 characters"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Phone number (optional)</label>
              <input
                value={form.phone_number}
                placeholder="e.g. 08012345678"
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create officer account'}
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '1rem 0 1.25rem' }}>
          <div style={{ flex: 2, minWidth: '220px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search officer by name, email, department, or faculty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All Sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.stage_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <select
              value={facultyFilter}
              onChange={(e) => setFacultyFilter(e.target.value)}
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

          {(search || sectionFilter || facultyFilter || hallFilter) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setSectionFilter('');
                setFacultyFilter('');
                setHallFilter('');
              }}
            >
              Reset
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
          Showing <strong>{filteredOfficers.length}</strong> of {officers.length} officer accounts
        </div>

        {filteredOfficers.length === 0 ? (
          <EmptyState
            icon={IconUsers}
            title="No matching officers"
            message="No officer accounts match the search or filter criteria."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Officer Name</th>
                  <th>Email</th>
                  <th>Section</th>
                  <th>Scope (Dept / Faculty)</th>
                  <th>Last signed in</th>
                  <th>Status</th>
                  <th className="row-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOfficers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.full_name}</strong>
                    </td>
                    <td className="cell-muted">{user.email}</td>
                    <td>
                      <select
                        value={user.section_code || ''}
                        onChange={(e) => reassign(user, e.target.value)}
                        disabled={busy}
                        aria-label={`Section for ${user.full_name}`}
                      >
                        {!user.section_code && <option value="">Unassigned</option>}
                        {sections.map((s) => (
                          <option key={s.id} value={s.code}>
                            {s.stage_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {user.department ? (
                        <div>
                          <strong>{user.department}</strong>
                          {user.faculty && <div className="cell-muted" style={{ fontSize: '0.75rem' }}>Faculty of {user.faculty}</div>}
                        </div>
                      ) : user.faculty ? (
                        <span style={{ fontWeight: 600, color: '#15803d' }}>Faculty of {user.faculty}</span>
                      ) : user.hall ? (
                        <span style={{ fontWeight: 600, color: '#92400e' }}>{user.hall}</span>
                      ) : (
                        <span className="cell-muted">Central Unit</span>
                      )}
                    </td>
                    <td className="cell-muted">{user.last_login_at ? formatDate(user.last_login_at) : 'Never'}</td>
                    <td>
                      <span className={`status-badge status-${user.is_active ? 'approved' : 'rejected'}`}>
                        {user.is_active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => resetPassword(user)}
                        disabled={busy}
                        type="button"
                      >
                        Reset password
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleStatus(user)}
                        disabled={busy}
                        type="button"
                      >
                        {user.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <SectionHeader title="Administrators" description="Full access to every section and student record" />

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Last signed in</th>
                <th>Status</th>
                <th className="row-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name}</strong>
                  </td>
                  <td className="cell-muted">{user.email}</td>
                  <td className="cell-muted">{user.last_login_at ? formatDate(user.last_login_at) : 'Never'}</td>
                  <td>
                    <span className={`status-badge status-${user.is_active ? 'approved' : 'rejected'}`}>
                      {user.is_active ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => resetPassword(user)}
                      disabled={busy}
                      type="button"
                    >
                      Reset password
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => toggleStatus(user)}
                      disabled={busy}
                      type="button"
                    >
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
