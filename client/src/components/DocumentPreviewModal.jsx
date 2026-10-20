import { useState } from 'react';
import { IconDownload, IconFile, IconX } from './Icons';
import { resolveFileUrl } from '../utils/resolveUrl';

/**
 * Document Preview Lightbox Modal
 *
 * Lets students and officers quickly preview uploaded documents (receipts,
 * certificates, credentials, photos, and PDFs) inline without opening and
 * closing multiple browser tabs.
 */
export default function DocumentPreviewModal({ doc, docs = [], onClose, onSelectDoc }) {
  if (!doc) return null;

  const [imgError, setImgError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const currentIndex = docs.findIndex((d) => d.id === doc.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < docs.length - 1;

  const isPdf =
    doc.file_url?.toLowerCase().endsWith('.pdf') ||
    doc.original_name?.toLowerCase().endsWith('.pdf') ||
    doc.mime_type === 'application/pdf';

  const fileSrc = resolveFileUrl(doc.file_url, doc.id);

  return (
    <div
      className="doc-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Document Preview"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="doc-preview-container">
        <div className="doc-preview-header">
          <div className="doc-preview-title">
            <IconFile width={18} height={18} />
            <div>
              <strong>{doc.doc_label || doc.original_name}</strong>
              <span className="doc-preview-meta">
                {doc.original_name} {docs.length > 1 ? `(${currentIndex + 1} of ${docs.length})` : ''} · {doc.mime_type || (isPdf ? 'PDF' : 'Image')}
              </span>
            </div>
          </div>

          <div className="doc-preview-header-actions">
            {!isPdf && !imgError && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsZoomed((prev) => !prev)}
                title="Toggle actual size zoom"
              >
                {isZoomed ? 'Fit to Screen' : '100% Zoom'}
              </button>
            )}
            <a
              href={fileSrc}
              download={doc.original_name}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              title="Download or open in new tab"
            >
              <IconDownload width={15} height={15} />
              Open Original
            </a>
            <button
              type="button"
              className="btn-icon-close"
              onClick={onClose}
              aria-label="Close preview"
            >
              <IconX width={20} height={20} />
            </button>
          </div>
        </div>

        <div className="doc-preview-body" style={{ overflow: 'auto' }}>
          {isPdf ? (
            <iframe
              src={fileSrc}
              title={doc.original_name}
              className="doc-preview-iframe"
            />
          ) : !imgError ? (
            <div
              className="doc-preview-img-container"
              style={{
                display: 'flex',
                alignItems: isZoomed ? 'flex-start' : 'center',
                justifyContent: isZoomed ? 'flex-start' : 'center',
                minHeight: '100%',
                padding: '0.5rem',
              }}
            >
              <img
                src={fileSrc}
                alt={doc.original_name}
                className="doc-preview-image"
                style={
                  isZoomed
                    ? { maxWidth: 'none', maxHeight: 'none', cursor: 'zoom-out', margin: 'auto' }
                    : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }
                }
                onClick={() => setIsZoomed((prev) => !prev)}
                onError={() => setImgError(true)}
                title="Click to toggle full resolution zoom"
              />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3rem 1.5rem',
                color: '#cbd5e1',
                textAlign: 'center',
              }}
            >
              <IconFile width={48} height={48} />
              <strong style={{ marginTop: '1rem', fontSize: '1.1rem', color: '#f8fafc' }}>
                {doc.original_name || 'Clearance Document'}
              </strong>
              <p style={{ marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.9rem', maxWidth: '400px' }}>
                Document record is verified on the clearance database. Click below to view or download the original file.
              </p>
              <a
                href={fileSrc}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
              >
                <IconDownload width={16} height={16} /> Open Document File
              </a>
            </div>
          )}
        </div>

        {docs.length > 1 && (
          <div className="doc-preview-footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!hasPrev}
              onClick={() => {
                setImgError(false);
                onSelectDoc?.(docs[currentIndex - 1]);
              }}
            >
              ← Previous Document
            </button>
            <span className="doc-preview-counter">
              Document {currentIndex + 1} of {docs.length}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!hasNext}
              onClick={() => {
                setImgError(false);
                onSelectDoc?.(docs[currentIndex + 1]);
              }}
            >
              Next Document →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
