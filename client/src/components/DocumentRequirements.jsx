import { useState } from 'react';
import { studentApi } from '../services/api';
import CameraScannerModal from './CameraScannerModal';
import { IconCamera, IconEye, IconRefresh, IconTrash, IconUpload } from './Icons';

/**
 * Renders one row per document a stage requires, with complete real-time capability
 * for students to edit/replace, snap new copies, or cancel/remove uploaded documents
 * in any section.
 */
export default function DocumentRequirements({ requirements = [], onChanged, readOnly = false }) {
  const [busyTypeId, setBusyTypeId] = useState(null);
  const [busyDocId, setBusyDocId] = useState(null);
  const [scanningReq, setScanningReq] = useState(null);
  const [scanningDoc, setScanningDoc] = useState(null);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const handleUpload = async (requirement, file) => {
    if (!file) return;
    setError('');
    setSuccessNotice('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type_id', requirement.document_type_id);

    try {
      setBusyTypeId(requirement.document_type_id);
      await studentApi.upload(formData);
      setSuccessNotice(`Uploaded ${requirement.label} successfully.`);
      await onChanged?.();
    } catch (err) {
      setError(`${requirement.label}: ${err.message}`);
    } finally {
      setBusyTypeId(null);
    }
  };

  const handleReplace = async (doc, file) => {
    if (!file) return;
    setError('');
    setSuccessNotice('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setBusyDocId(doc.id);
      await studentApi.replaceDocument(doc.id, formData);
      setSuccessNotice(`Replaced "${doc.original_name}" with "${file.name}" successfully.`);
      await onChanged?.();
    } catch (err) {
      setError(`Failed to replace document: ${err.message}`);
    } finally {
      setBusyDocId(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Are you sure you want to cancel and remove "${doc.original_name}"?`)) return;
    setError('');
    setSuccessNotice('');

    try {
      setBusyDocId(doc.id);
      await studentApi.deleteDocument(doc.id);
      setSuccessNotice(`Document "${doc.original_name}" removed successfully.`);
      await onChanged?.();
    } catch (err) {
      setError(`Failed to remove document: ${err.message}`);
    } finally {
      setBusyDocId(null);
    }
  };

  if (requirements.length === 0) {
    return (
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        This stage has no documents to upload — an officer verifies it in person.
      </p>
    );
  }

  return (
    <div>
      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {successNotice && <div className="notice" style={{ marginBottom: '1rem' }}>{successNotice}</div>}

      <ul className="req-list">
        {requirements.map((req) => {
          const busy = busyTypeId === req.document_type_id;
          const uploaded = req.documents || [];

          return (
            <li key={req.document_type_id} className="req-item">
              <div className="req-head">
                <div>
                  <strong>{req.label}</strong>
                  {req.is_mandatory ? (
                    <span className="req-tag req-tag-required">required</span>
                  ) : (
                    <span className="req-tag">optional</span>
                  )}
                  {req.is_shared && (
                    <span className="req-tag" title="Used by more than one stage">
                      shared
                    </span>
                  )}
                  {req.description && (
                    <p style={{ fontSize: '0.85rem', color: '#666', margin: '0.2rem 0 0' }}>
                      {req.description}
                    </p>
                  )}
                </div>

                <span className={`status-badge status-${uploaded.length ? 'approved' : 'not_started'}`}>
                  {uploaded.length ? `${uploaded.length} uploaded` : 'missing'}
                </span>
              </div>

              {/* Uploaded Documents List with Edit / Replace & Cancel Actions */}
              {uploaded.length > 0 && (
                <ul className="req-files" style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0' }}>
                  {uploaded.map((doc) => {
                    const isDocBusy = busyDocId === doc.id;

                    return (
                      <li
                        key={doc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          padding: '0.65rem 0.85rem',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          marginBottom: '0.45rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '220px' }}>
                          <span style={{ color: '#0284c7', display: 'flex', alignItems: 'center' }}>
                            <IconEye width={16} height={16} />
                          </span>
                          <div>
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontWeight: 600, color: '#0369a1', textDecoration: 'none', wordBreak: 'break-all' }}
                              title="Click to view / inspect document"
                            >
                              {doc.original_name}
                            </a>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                              Uploaded on {new Date(doc.uploaded_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        {/* Real-Time Document Actions: Edit/Replace and Cancel/Remove */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Preview uploaded document in new tab"
                          >
                            <IconEye width={13} height={13} /> View
                          </a>

                          {!readOnly && (
                            <>
                              {/* Replace File (File Picker) */}
                              <label
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: '0.3rem 0.65rem',
                                  fontSize: '0.8rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  cursor: isDocBusy ? 'not-allowed' : 'pointer',
                                  margin: 0,
                                }}
                                title="Edit / replace with a new file from your device"
                              >
                                <IconRefresh width={13} height={13} />
                                {isDocBusy ? 'Updating…' : 'Replace'}
                                <input
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg"
                                  style={{ display: 'none' }}
                                  disabled={isDocBusy || busy}
                                  onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                      handleReplace(doc, e.target.files[0]);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                              </label>

                              {/* Snap New Copy (Camera Scanner) */}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                disabled={isDocBusy || busy}
                                onClick={() => setScanningDoc({ req, doc })}
                                title="Snap a new photo with camera to replace this document"
                              >
                                <IconCamera width={13} height={13} /> Snap New
                              </button>

                              {/* Cancel / Remove Document */}
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{
                                  padding: '0.3rem 0.65rem',
                                  fontSize: '0.8rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  backgroundColor: '#ef4444',
                                  color: '#fff',
                                }}
                                disabled={isDocBusy || busy}
                                onClick={() => handleDelete(doc)}
                                title="Cancel and remove this uploaded document"
                              >
                                <IconTrash width={13} height={13} /> Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Upload Controls for New Documents */}
              {!readOnly && (
                <div className="req-upload-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => setScanningReq(req)}
                    title="Scan or snap this document directly with device camera"
                  >
                    <IconCamera width={15} height={15} />
                    {uploaded.length ? 'Snap Additional' : 'Snap / Scan'}
                  </button>

                  <label className="req-upload">
                    <span className="btn btn-secondary btn-sm">
                      <IconUpload width={15} height={15} />
                      {busy ? 'Uploading…' : uploaded.length ? 'Upload Additional' : 'Choose file'}
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
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Camera Snapper for Initial Upload */}
      {scanningReq && (
        <CameraScannerModal
          isOpen={Boolean(scanningReq)}
          requirementLabel={scanningReq.label}
          onClose={() => setScanningReq(null)}
          onCapture={(file) => {
            const target = scanningReq;
            setScanningReq(null);
            if (target && file) {
              handleUpload(target, file);
            }
          }}
        />
      )}

      {/* Camera Snapper for Replacement / Edit of Existing Document */}
      {scanningDoc && (
        <CameraScannerModal
          isOpen={Boolean(scanningDoc)}
          requirementLabel={`Replace: ${scanningDoc.req?.label || scanningDoc.doc?.original_name}`}
          onClose={() => setScanningDoc(null)}
          onCapture={(file) => {
            const target = scanningDoc;
            setScanningDoc(null);
            if (target?.doc && file) {
              handleReplace(target.doc, file);
            }
          }}
        />
      )}
    </div>
  );
}
