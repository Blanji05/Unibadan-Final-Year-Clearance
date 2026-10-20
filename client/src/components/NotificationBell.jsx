import { useCallback, useEffect, useState } from 'react';
import { notificationsApi } from '../services/api';
import { IconBell } from './Icons';
import { realtime } from '../services/realtime';

/** How often the unread count refreshes while the page stays open (fallback). */
const POLL_MS = 30000;

/** "3m ago" style stamp — precise timestamps add nothing in this panel. */
function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Topbar bell. Shows the unread count, opens the in-app inbox, and lets the
 * user mark items read. Listens to real-time events and polls on fallback.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      // The bell is a convenience surface; a failed poll stays silent rather
      // than interrupting whatever the user is doing.
    }
  }, []);

  useEffect(() => {
    load();
    const unsubNotif = realtime.on('notification:new', () => load());
    const unsubClear = realtime.on('clearance:update', () => load());
    const timer = setInterval(load, POLL_MS);
    return () => {
      unsubNotif();
      unsubClear();
      clearInterval(timer);
    };
  }, [load]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const markAll = async () => {
    await notificationsApi.markAllRead();
    await load();
  };

  const markOne = async (id) => {
    await notificationsApi.markRead(id);
    await load();
  };

  return (
    <div className="notif-wrap">
      <button className="notif-btn" onClick={toggle} type="button" aria-label="Notifications">
        <IconBell width={19} height={19} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <>
          {/* Invisible click-away layer, so any outside click closes the panel. */}
          <div className="notif-backdrop" onClick={() => setOpen(false)} />

          <div className="notif-panel">
            <div className="notif-head">
              <strong>Notifications</strong>
              {unread > 0 && (
                <button className="notif-mark" onClick={markAll} type="button">
                  Mark all read
                </button>
              )}
            </div>

            <div className="notif-list">
              {loading && items.length === 0 && <p className="notif-empty">Loading…</p>}
              {!loading && items.length === 0 && (
                <p className="notif-empty">Nothing yet. Updates about your clearance will appear here.</p>
              )}

              {items.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item${n.read_at ? '' : ' unread'}`}
                  onClick={() => !n.read_at && markOne(n.id)}
                  title={n.read_at ? undefined : 'Click to mark as read'}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && !n.read_at && markOne(n.id)}
                >
                  <span className="notif-item-title">
                    {!n.read_at && <span className="notif-dot" aria-hidden="true" />}
                    {n.title}
                  </span>
                  <span className="notif-item-msg">{n.message}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                    <span className="notif-item-time">
                      {timeAgo(n.created_at)}
                      {n.stage_name ? ` · ${n.stage_name}` : ''}
                    </span>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`*UI Clearance Notification: ${n.title}*\n\n${n.message}\n\nCheck status: https://unibadan-final-year-clearance.vercel.app`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        color: '#15803d',
                        backgroundColor: '#dcfce7',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                      title="Share / Open in WhatsApp"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
