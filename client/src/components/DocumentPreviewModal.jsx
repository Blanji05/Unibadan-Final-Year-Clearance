import { IconDownload, IconFile, IconX } from './Icons';

/**
 * Document Preview Lightbox Modal
 *
 * Lets officers quickly preview student documents (receipts, certificates,
 * credentials, photos, and PDFs) inline without opening and closing multiple
 * browser tabs.
 */
export default function DocumentPreviewModal({ doc, docs = [], onClose, onSelectDoc }) {
  if (!doc) return null;

  const currentIndex = docs.findIndex((d) => d.id === doc.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < docs.length - 1;

  const isPdf =
    doc.file_url?.toLowerCase().endsWith('.pdf') ||
    doc.original_name?.toLowerCase().endsWith('.pdf');

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
                {doc.original_name} {docs.length > 1 ? `(${currentIndex + 1} of ${docs.length})` : ''}
              </span>
            </div>
          </div>

          <div className="doc-preview-header-actions">
            <a
              href={doc.file_url}
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

        <div className="doc-preview-body">
          {isPdf ? (
            <iframe
              src={doc.file_url}
              title={doc.original_name}
              className="doc-preview-iframe"
            />
          ) : (
            <div className="doc-preview-img-container">
              <img
                src={doc.file_url}
                alt={doc.original_name}
                className="doc-preview-image"
              />
            </div>
          )}
        </div>

        {docs.length > 1 && (
          <div className="doc-preview-footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!hasPrev}
              onClick={() => onSelectDoc?.(docs[currentIndex - 1])}
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
              onClick={() => onSelectDoc?.(docs[currentIndex + 1])}
            >
              Next Document →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

