import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../services/api';
import { realtime } from '../../services/realtime';
import { IconFile, IconLock } from '../../components/Icons';
import {
  EmptyState,
  SectionHeader,
  SkeletonList,
  StatCard,
  formatBytes,
  formatDate,
} from '../../components/Ui';

/**
 * Documents page for students.
 *
 * In accordance with system design and modelling:
 * - This section ONLY displays documents that have already been uploaded.
 * - Students cannot upload from here; document uploads are submitted directly
 *   to each respective clearance stage under the Clearance Stages tab.
 * - Allows students to view/download uploaded documents and remove unlocked ones.
 */
export default function DocumentVault() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const docs = await studentApi.documents();
      setDocuments(docs || []);
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

    const unsubClear = realtime.on('clearance:update', () => load());
    const unsubDocs = realtime.on('documents:update', () => load());
    return () => {
      unsubClear();
      unsubDocs();
    };
  }, [load]);

  const handleReplace = async (doc, file) => {
    if (!file) return;
    try {
      setBusy(true);
      setError('');
      setNotice('');
      const formData = new FormData();
      formData.append('file', file);
      await studentApi.replaceDocument(doc.id, formData);
      setNotice(`"${doc.original_name}" replaced with "${file.name}" successfully.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Are you sure you want to cancel and remove "${doc.original_name}"?`)) return;
    try {
      setBusy(true);
      setError('');
      setNotice('');
      await studentApi.deleteDocument(doc.id);
      setNotice(`"${doc.original_name}" has been cancelled and removed.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={5} />
      </div>
    );
  }

  const totalSize = documents.reduce((sum, d) => sum + (Number(d.file_size) || 0), 0);
  const lockedCount = documents.filter((d) => d.is_locked).length;

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="stat-grid">
        <StatCard label="Documents uploaded" value={documents.length} icon={IconFile} />
        <StatCard
          label="Locked for review"
          value={lockedCount}
          hint={lockedCount > 0 ? 'Submitted for stage review' : 'None locked'}
          icon={IconLock}
        />
        <StatCard
          label="Total storage used"
          value={formatBytes(totalSize)}
          hint="Across all files"
        />
      </div>

      <div className="card">
        <SectionHeader
          title="Uploaded documents"
          description="Repository of documents uploaded to your clearance record"
          action={
            <Link to="/student/stages" className="btn btn-primary-sm">
              Go to Clearance Stages
            </Link>
          }
        />

        <div className="notice notice-info" style={{ marginBottom: '1.25rem' }}>
          <strong>Note:</strong> Documents are uploaded directly within each section on the{' '}
          <Link to="/student/stages">Clearance Stages</Link> tab. This page serves as your secure
          document repository to review and inspect your uploaded files.
        </div>

        {documents.length === 0 ? (
          <EmptyState
            icon={IconFile}
            title="No documents uploaded yet"
            message="You have not uploaded any clearance documents yet. Visit the Clearance Stages tab to view the requirements for each section and submit your files."
            action={
              <Link to="/student/stages" className="btn btn-primary">
                View clearance stages
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type / Category</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="file-link"
                        title="Click to view file"
                      >
                        <IconFile width={16} height={16} />
                        <strong>{doc.original_name || 'Document'}</strong>
                      </a>
                    </td>
                    <td>
                      <span className="req-tag">{doc.doc_label || 'General Document'}</span>
                    </td>
                    <td>{formatBytes(doc.file_size)}</td>
                    <td>{formatDate(doc.uploaded_at)}</td>
                    <td>
                      <span className="req-tag req-tag-success" style={{ color: '#059669', borderColor: '#a7f3d0' }}>
                        Uploaded
                      </span>
                    </td>
                    <td className="row-actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center' }}
                        >
                          View
                        </a>
                        <label
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}
                          title="Replace this document with a new file"
                        >
                          Replace
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            style={{ display: 'none' }}
                            disabled={busy}
                            onChange={(e) => {
                              if (e.target.files?.[0]) handleReplace(doc, e.target.files[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ backgroundColor: '#ef4444', color: '#fff' }}
                          onClick={() => handleDelete(doc)}
                          disabled={busy}
                          title="Cancel and remove this document"
                        >
                          Cancel
                        </button>
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
  );
}
