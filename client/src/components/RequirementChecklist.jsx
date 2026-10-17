import { useState } from 'react';
import { studentApi } from '../services/api';
import { IconCheck, IconFile, IconUpload } from './Icons';
import { EmptyState } from './Ui';

/**
 * The student's cross-section upload checklist.
 *
 * Section officers each maintain their own stage's requirements, so this list is
 * assembled from all of them and de-duplicated by document type: a file several
 * sections want (school fee receipts, statement of result) appears once, with
 * every section that asked for it named. Uploading it satisfies all of them.
 *
 * Outstanding items are shown first — a student opening this page wants to know
 * what is still missing, not to scroll past what they've already done.
 */
export default function RequirementChecklist({ requirements = [], onChanged }) {
  const [busyTypeId, setBusyTypeId] = useState(null);
  const [error, setError] = useState('');

  const handleUpload = async (requirement, file) => {
    if (!file) return;
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type_id', requirement.document_type_id);

    try {
      setBusyTypeId(requirement.document_type_id);
      await studentApi.upload(formData);
      await onChanged?.();
    } catch (err) {
      setError(`${requirement.label}: ${err.message}`);
    } finally {
      setBusyTypeId(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Remove "${doc.original_name}"?`)) return;
    setError('');

    try {
      setBusyTypeId(doc.document_type_id);
      await studentApi.deleteDocument(doc.id);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyTypeId(null);
    }
  };

  if (requirements.length === 0) {
    return (
      <EmptyState
        icon={IconCheck}
        title="Nothing requested yet"
        message="No section is asking for documents at the moment. Check back — officers can add requirements at any time."
      />
    );
  }

  // Outstanding first, then satisfied, alphabetical within each group.
  const ordered = [...requirements].sort((a, b) => {
    if (a.is_satisfied !== b.is_satisfied) return a.is_satisfied ? 1 : -1;
    if (a.is_mandatory !== b.is_mandatory) return a.is_mandatory ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  const outstanding = ordered.filter((r) => r.is_mandatory && !r.is_satisfied).length;

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className={`notice${outstanding ? ' notice-warn' : ''}`}>
        {outstanding === 0
          ? 'You have uploaded everything the sections currently ask for.'
          : `${outstanding} required document${outstanding === 1 ? '' : 's'} still to upload.`}
      </div>

      <ul className="req-list">
        {ordered.map((req) => {
          const busy = busyTypeId === req.document_type_id;
          const uploaded = req.documents || [];
          const askedBy = [...req.required_by, ...req.optional_for];

          return (
            <li
              key={req.document_type_id}
              className={`req-item${req.is_satisfied ? ' req-item-done' : ''}`}
            >
              <div className="req-head">
                <div>
                  <strong>{req.label}</strong>
                  {req.is_mandatory ? (
                    <span className="req-tag req-tag-required">required</span>
                  ) : (
                    <span className="req-tag">optional</span>
                  )}
                  {req.is_shared && (
                    <span className="req-tag" title="Several sections ask for this">
                      shared
                    </span>
                  )}

                  {/* Naming the sections is the point of this view — students
                      otherwise have no idea who wants what. */}
                  <p className="req-asked-by">
                    Asked for by: {askedBy.join(', ')}
                  </p>

                  {req.description && <p className="req-desc">{req.description}</p>}
                </div>

                <span
                  className={`status-badge status-${req.is_satisfied ? 'approved' : 'not_started'}`}
                >
                  {req.is_satisfied ? 'uploaded' : 'missing'}
                </span>
              </div>

              {uploaded.length > 0 && (
                <ul className="req-files">
                  {uploaded.map((doc) => (
                    <li key={doc.id}>
                      <a href={doc.file_url} target="_blank" rel="noreferrer" className="file-link">
                        <IconFile width={14} height={14} />
                        {doc.original_name}
                      </a>
                      <button
                        type="button"
                        className="link-danger"
                        onClick={() => handleDelete(doc)}
                        disabled={busy}
                      >
                        Cancel / Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <label className="req-upload">
                <span className="btn btn-secondary btn-sm">
                  <IconUpload width={14} height={14} />
                  {busy ? 'Uploading…' : uploaded.length ? 'Replace / add another' : 'Upload file'}
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={busy}
                  onChange={(e) => {
                    handleUpload(req, e.target.files[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
