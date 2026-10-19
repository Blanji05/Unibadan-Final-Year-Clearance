import { useCallback, useEffect, useMemo, useState } from 'react';
import { officerApi } from '../../services/api';
import { realtime } from '../../services/realtime';
import { IconSearch, IconUsers, IconUser } from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, StatusBadge } from '../../components/Ui';
import { ACADEMIC_STRUCTURE, getFaculties, UI_HALLS } from '../../data/academicStructure';

export default function OfficerDirectory() {
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedHall, setSelectedHall] = useState('');

  const faculties = useMemo(() => getFaculties(), []);

  const load = useCallback(async () => {
    try {
      const list = await officerApi.directory();
      setOfficers(list || []);
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

  const filteredOfficers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return officers.filter((off) => {
      if (selectedSection && off.section_code !== selectedSection) return false;
      if (selectedFaculty && off.faculty !== selectedFaculty) return false;
      if (selectedHall && off.hall !== selectedHall) return false;
      if (!q) return true;
      return (
        off.full_name?.toLowerCase().includes(q) ||
        off.email?.toLowerCase().includes(q) ||
        off.department?.toLowerCase().includes(q) ||
        off.faculty?.toLowerCase().includes(q) ||
        off.hall?.toLowerCase().includes(q) ||
        off.stage_name?.toLowerCase().includes(q) ||
        off.phone_number?.includes(q)
      );
    });
  }, [officers, search, selectedSection, selectedFaculty, selectedHall]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={6} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <div className="card">
        <SectionHeader
          title="Section Officers & Staff Directory"
          description={`Directory of all clearance section, faculty, and departmental officers across the University of Ibadan (${officers.length} officers registered).`}
        />

        {/* Filter controls */}
        <div className="form-row" style={{ marginTop: '1rem', marginBottom: '1.25rem', gap: '0.75rem' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Search officer by name, email, department or faculty</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="e.g. Computer Science, Technology, Library, or officer name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label>Filter by Section</label>
            <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
              <option value="">All Sections</option>
              <option value="department">Departmental Clearance</option>
              <option value="faculty">Faculty Clearance</option>
              <option value="library">Library Clearance</option>
              <option value="hall">Caution & Hall Clearance</option>
              <option value="clinic">University Health Services Clearance</option>
              <option value="alumni">Alumni Clearance</option>
              <option value="sports">Sports Clearance</option>
              <option value="lodgings">Lodgings Clearance</option>
              <option value="bursar">Bursar Clearance</option>
              <option value="student_affairs">Student Affairs Clearance</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label>Filter by Faculty</label>
            <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
              <option value="">All 21 Faculties</option>
              {faculties.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label>Filter by Residential Hall</label>
            <select value={selectedHall} onChange={(e) => setSelectedHall(e.target.value)}>
              <option value="">All Residential Halls</option>
              {UI_HALLS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results summary chip */}
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
          Showing <strong>{filteredOfficers.length}</strong> of {officers.length} officer accounts
          {(selectedSection || selectedFaculty || selectedHall || search) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: '1rem', padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => {
                setSearch('');
                setSelectedSection('');
                setSelectedFaculty('');
                setSelectedHall('');
              }}
            >
              Reset filters
            </button>
          )}
        </div>

        {filteredOfficers.length === 0 ? (
          <EmptyState
            icon={IconUsers}
            title="No matching officers found"
            message="Try adjusting your search terms or clearing the faculty/section filters."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Officer Name</th>
                  <th>Clearance Section</th>
                  <th>Assigned Scope (Faculty / Department)</th>
                  <th>Official Email</th>
                  <th>Phone Number</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOfficers.map((off) => (
                  <tr key={off.id}>
                    <td>
                      <strong>{off.full_name}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: off.section_code === 'department' ? '#fef7ee' : off.section_code === 'faculty' ? '#f0fdf4' : '#f8fafc',
                          color: off.section_code === 'department' ? '#78350f' : off.section_code === 'faculty' ? '#15803d' : '#334155',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {off.stage_name || off.section_code}
                      </span>
                    </td>
                    <td>
                      {off.department ? (
                        <div>
                          <strong>{off.department}</strong>
                          {off.faculty && <div className="cell-muted" style={{ fontSize: '0.75rem' }}>Faculty of {off.faculty}</div>}
                        </div>
                      ) : off.faculty ? (
                        <span style={{ fontWeight: '600', color: '#166534' }}>
                          Faculty of {off.faculty}
                        </span>
                      ) : off.hall ? (
                        <span style={{ fontWeight: '600', color: '#92400e' }}>
                          {off.hall}
                        </span>
                      ) : (
                        <span className="cell-muted">Central University Unit</span>
                      )}
                    </td>
                    <td className="cell-muted">
                      <a href={`mailto:${off.email}`} style={{ color: '#92400e', textDecoration: 'none' }}>
                        {off.email}
                      </a>
                    </td>
                    <td className="cell-muted">{off.phone_number || '—'}</td>
                    <td>
                      <span className={`status-badge status-${off.is_active ? 'approved' : 'rejected'}`}>
                        {off.is_active ? 'Active' : 'Disabled'}
                      </span>
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

