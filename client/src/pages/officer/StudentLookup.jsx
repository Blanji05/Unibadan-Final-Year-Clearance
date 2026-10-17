import { useCallback, useEffect, useState } from 'react';
import { officerApi } from '../../services/api';
import { saveBlob } from '../../services/download';
import { realtime } from '../../services/realtime';
import { IconSearch, IconUser, IconCheck, IconClock, IconFile, IconX } from '../../components/Icons';
import { EmptyState, SectionHeader, StatusBadge, formatDate } from '../../components/Ui';
import { getFaculties, getDepartmentsForFaculty } from '../../data/academicStructure';

export default function StudentLookup() {
  const [search, setSearch] = useState('');
  const [faculty, setFaculty] = useState('');
  const [department, setDepartment] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Clearance card modal/detail
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [clearanceStages, setClearanceStages] = useState([]);
  const [loadingClearance, setLoadingClearance] = useState(false);
  const [downloadingSlipKey, setDownloadingSlipKey] = useState(null);

  const faculties = getFaculties();
  const availableDepts = faculty ? getDepartmentsForFaculty(faculty) : [];

  const refreshSearch = useCallback(async () => {
    if (!hasSearched) return;
    if (!search.trim() && !faculty && !department) return;
    try {
      const results = await officerApi.searchStudents({
        search: search.trim() || undefined,
        faculty: faculty || undefined,
        department: department || undefined,
      });
      setStudents(results || []);
    } catch {
      /* ignore background refresh error */
    }
  }, [hasSearched, search, faculty, department]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!search.trim() && !faculty && !department) {
      setError('Enter a student name or matric number, or select a faculty/department to search.');
      return;
    }
    setError('');
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await officerApi.searchStudents({
        search: search.trim() || undefined,
        faculty: faculty || undefined,
        department: department || undefined,
      });
      setStudents(results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const viewClearanceCard = async (student) => {
    setSelectedStudent(student);
    setLoadingClearance(true);
    try {
      const data = await officerApi.studentClearance(student.id);
      setClearanceStages(data.stages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingClearance(false);
    }
  };

  useEffect(() => {
    const refreshAll = async () => {
      refreshSearch();
      if (selectedStudent?.id) {
        try {
          const data = await officerApi.studentClearance(selectedStudent.id);
          setClearanceStages(data.stages || []);
        } catch {
          /* ignore */
        }
      }
    };
    const unsubClear = realtime.on('clearance:update', refreshAll);
    const unsubQueue = realtime.on('queue:update', refreshAll);
    const unsubUsers = realtime.on('users:update', refreshAll);
    return () => {
      unsubClear();
      unsubQueue();
      unsubUsers();
    };
  }, [refreshSearch, selectedStudent]);

  const handleDownloadSlip = async (stage) => {
    if (!selectedStudent) return;
    try {
      const key = `${selectedStudent.id}-${stage.stage_id}`;
      setDownloadingSlipKey(key);
      const blob = await officerApi.studentSlip(selectedStudent.id, stage.stage_id);
      saveBlob(blob, `UI-Clearance-Slip-${selectedStudent.matric_number}-${stage.stage_name || 'stage'}.pdf`);
    } catch (err) {
      setError(err.message || 'Failed to download clearance slip');
    } finally {
      setDownloadingSlipKey(null);
    }
  };

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <div className="card">
        <SectionHeader
          title="Student Clearance Search & Verification"
          description="Look up any student in the University of Ibadan by matriculation number, name, or department to verify their overall clearance status across all stages."
        />

        <form onSubmit={handleSearch} style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Student Name or Matriculation Number</label>
              <input
                type="text"
                placeholder="e.g. 230922, Osunlana, or student name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label>Filter by Faculty</label>
              <select
                value={faculty}
                onChange={(e) => {
                  setFaculty(e.target.value);
                  setDepartment('');
                }}
              >
                <option value="">All Faculties</option>
                {faculties.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label>Filter by Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={!availableDepts.length}
              >
                <option value="">All Departments</option>
                {availableDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>
              <IconSearch width={16} height={16} />
              {loading ? 'Searching...' : 'Search Students'}
            </button>
            {hasSearched && (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setSearch('');
                  setFaculty('');
                  setDepartment('');
                  setStudents([]);
                  setHasSearched(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {loading && <div className="notice">Searching student records...</div>}

        {!loading && hasSearched && students.length === 0 && (
          <EmptyState
            icon={IconUser}
            title="No students found"
            message="No matching student found. Check the matric number spelling or try searching by name or department."
          />
        )}

        {!loading && students.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Matric No.</th>
                  <th>Full Name</th>
                  <th>Faculty & Department</th>
                  <th>Hall</th>
                  <th>Clearance Progress</th>
                  <th className="row-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <strong>{st.matric_number || '—'}</strong>
                    </td>
                    <td>
                      <div>
                        <strong>{st.full_name}</strong>
                        <div className="cell-muted" style={{ fontSize: '0.75rem' }}>{st.email}</div>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{st.department || '—'}</strong>
                        <div className="cell-muted" style={{ fontSize: '0.75rem' }}>{st.faculty || '—'}</div>
                      </div>
                    </td>
                    <td className="cell-muted">{st.hall || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontWeight: 'bold',
                            color: st.approved_stages === st.total_stages ? '#166534' : '#0369a1',
                          }}
                        >
                          {st.approved_stages} / {st.total_stages} stages
                        </span>
                        {st.approved_stages === st.total_stages && (
                          <span className="status-badge status-approved" style={{ fontSize: '0.7rem' }}>Fully Cleared</span>
                        )}
                      </div>
                    </td>
                    <td className="row-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => viewClearanceCard(st)}
                      >
                        View Clearance Card
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Clearance status card modal */}
      {selectedStudent && (
        <div className="modal-backdrop" onClick={() => setSelectedStudent(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: '780px', maxHeight: '90dvh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                {selectedStudent.passport_url && (
                  <img
                    src={selectedStudent.passport_url}
                    alt={selectedStudent.full_name}
                    style={{
                      width: '48px',
                      height: '56px',
                      borderRadius: '4px',
                      objectFit: 'cover',
                      border: '1px solid #cbd5e1',
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{selectedStudent.full_name}</h2>
                  <p className="cell-muted" style={{ margin: '0.25rem 0 0' }}>
                    Matric: <strong>{selectedStudent.matric_number}</strong> | Dept: <strong>{selectedStudent.department}</strong> | Faculty: <strong>{selectedStudent.faculty}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedStudent(null)}
              >
                Close
              </button>
            </div>

            {loadingClearance ? (
              <div className="notice">Loading clearance history...</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Clearance Stage</th>
                      <th>Status</th>
                      <th>Reviewed By</th>
                      <th>Date / Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clearanceStages.map((stage, idx) => (
                      <tr key={stage.stage_id || idx}>
                        <td className="cell-muted">{stage.stage_order || idx + 1}</td>
                        <td>
                          <strong>{stage.stage_name}</strong>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <StatusBadge status={stage.status} />
                            {stage.status === 'approved' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleDownloadSlip(stage)}
                                disabled={downloadingSlipKey === `${selectedStudent.id}-${stage.stage_id}`}
                                title="Download official section clearance slip"
                              >
                                <IconFile width={12} height={12} />
                                {downloadingSlipKey === `${selectedStudent.id}-${stage.stage_id}` ? '...' : 'Slip'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="cell-muted">{stage.officer_name || '—'}</td>
                        <td>
                          <div>
                            {stage.reviewed_at ? formatDate(stage.reviewed_at) : stage.submitted_at ? `Submitted ${formatDate(stage.submitted_at)}` : 'Not submitted'}
                            {stage.remarks && (
                              <div style={{ fontSize: '0.8rem', color: stage.status === 'rejected' ? '#b91c1c' : '#475569', marginTop: '2px' }}>
                                <em>"{stage.remarks}"</em>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

