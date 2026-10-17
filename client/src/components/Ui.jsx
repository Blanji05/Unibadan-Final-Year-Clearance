/**
 * Shared presentational building blocks, so pages stay about behaviour rather
 * than repeating the same markup and inline styles.
 */

/** Headline figure with a label, used in the dashboard stat rows. */
export function StatCard({ label, value, hint, tone = 'default', icon: Icon }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      {Icon && (
        <span className="stat-icon">
          <Icon width={20} height={20} />
        </span>
      )}
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {hint && <p className="stat-hint">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Placeholder for a list with nothing in it. An explicit empty state matters
 * here because "no documents yet" and "still loading" otherwise look identical,
 * which makes a working page feel broken.
 */
export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-icon">
          <Icon width={28} height={28} />
        </span>
      )}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

/** Card heading with optional description and right-aligned action. */
export function SectionHeader({ title, description, action }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Labelled progress bar. */
export function ProgressBar({ value, total, showLabel = true }) {
  const percent = total ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      {showLabel && (
        <div className="progress-meta">
          <span>
            {value} of {total} stages approved
          </span>
          <strong>{percent}%</strong>
        </div>
      )}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Status pill. Falls back gracefully for statuses without a dedicated colour. */
export function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`}>{String(status).replace(/_/g, ' ')}</span>
  );
}

/** Skeleton rows shown while a list loads. */
export function SkeletonList({ rows = 3 }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-line skeleton-line-lg" />
          <div className="skeleton-line skeleton-line-sm" />
        </div>
      ))}
    </div>
  );
}

/** Human-readable file size. */
export function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Short date, e.g. "25 Aug 2026". */
export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
