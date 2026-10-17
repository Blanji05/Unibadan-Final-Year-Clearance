import { useRef, useState } from 'react';
import { adminApi } from '../../services/api';
import { saveBlob } from '../../services/download';
import { IconUpload } from '../../components/Icons';

const TEMPLATE =
  'full_name,gender,matric_no,email,Date Of birth,phone_number,department,faculty,Graduating Session,hall_of_residence,password,Blood Group,Genotype,State of origin/LGA,Residentaial Addresss,profile_picture\r\n' +
  'Musa Adaeze Oluwatoyin,Female,230147,amusa147@stu.ui.edu.ng,2005-04-13,,Fisheries and Wildlife Management,Agriculture,2025/2026,Queen Idia Hall,,,,,,,\r\n' +
  'Oyewole Anjolaoluwa,Male,201512,aoyewole512@stu.ui.edu.ng,2001-04-28,,Veterinary Medicine,Veterinary Medicine,2025/2026,Independence Hall,,,,,,,\r\n';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (supports 10,000+ students)

/**
 * Bulk-create students from a CSV file.
 *
 * The result panel matters as much as the upload: rows that failed are listed
 * with their line number, and the generated passwords are offered as a download
 * exactly once - the server only keeps them hashed, so closing this panel
 * without saving them means resetting each password individually.
 */
export default function StudentImport({ onImported }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const input = useRef(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    if (input.current) input.current.value = '';
  };

  const chooseFile = (e) => {
    setError('');
    setResult(null);
    const chosen = e.target.files?.[0] || null;
    if (chosen && chosen.size > MAX_BYTES) {
      setError('That file is too large. Keep it under 25 MB.');
      e.target.value = '';
      return;
    }
    setFile(chosen);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const csv = await file.text();
      const data = await adminApi.importStudents(csv);
      setResult(data);
      if (data.created > 0 || data.updated > 0) onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadCredentials = () =>
    saveBlob(new Blob([result.credentials_csv], { type: 'text/csv;charset=utf-8' }), 'student-credentials.csv');

  const downloadTemplate = () =>
    saveBlob(new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv;charset=utf-8' }), 'student-profile-template.csv');

  if (!open) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
          <IconUpload width={15} height={15} /> Bulk import students (CSV - 6,000+ capacity)
        </button>
      </div>
    );
  }

  return (
    <div className="inline-form">
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          backgroundColor: '#e0f2fe',
          color: '#0369a1',
          padding: '0.35rem 0.75rem',
          borderRadius: '4px',
          fontWeight: '600',
          fontSize: '0.85rem',
          marginBottom: '0.75rem',
        }}
      >
        <span>⚡ High-Capacity Engine: Supports 6,000+ students per file (up to 25 MB)</span>
      </div>

      <p className="inline-form-hint">
        Upload a CSV matching the official profile columns: <strong>full_name, gender, matric_no, email, Date Of birth, phone_number, department, faculty, Graduating Session, hall_of_residence, password, Blood Group, Genotype, State of origin/LGA, Residentaial Addresss, profile_picture</strong>.
        <br />
        <span style={{ color: '#92400e', fontWeight: 600 }}>Compulsory Fields:</span> <em>full_name, matric_no, department, faculty, and hall_of_residence</em> are compulsory for every student. If email is omitted, it will be automatically generated.
      </p>

      {error && <div className="error">{error}</div>}

      {busy && (
        <div className="notice" style={{ marginBottom: '1rem' }}>
          ⏳ Processing bulk import: validating records, hashing credentials, and generating student clearance profiles. Please wait...
        </div>
      )}

      {!result && (
        <form onSubmit={submit}>
          <input ref={input} type="file" accept=".csv,text/csv" onChange={chooseFile} disabled={busy} />
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" type="submit" disabled={!file || busy}>
              {busy ? 'Processing bulk import…' : 'Import students'}
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={downloadTemplate}>
              Download template
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Close
            </button>
          </div>
        </form>
      )}

      {result && (
        <div>
          <div className={result.created ? 'notice' : 'error'}>
            Imported {result.created} of {result.total} student{result.total === 1 ? '' : 's'}.
            {result.failed.length > 0 && ` ${result.failed.length} skipped.`}
          </div>

          {result.credentials_csv && (
            <div className="notice-warn" style={{ padding: '0.7rem', borderRadius: 4, marginBottom: '0.8rem' }}>
              <strong>Save the passwords now.</strong> They are stored hashed and cannot be shown again.{' '}
              <button className="btn btn-primary btn-sm" type="button" onClick={downloadCredentials}>
                Download credentials CSV
              </button>
            </div>
          )}

          {result.failed.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Matric</th>
                    <th>Email</th>
                    <th>Why it was skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failed.map((f) => (
                    <tr key={f.line}>
                      <td className="cell-muted">{f.line}</td>
                      <td>{f.matric_number || '—'}</td>
                      <td>{f.email || '—'}</td>
                      <td className="cell-wrap">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>
              Import another file
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

