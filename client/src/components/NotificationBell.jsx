import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../services/api';
import { realtime } from '../services/realtime';
import { IconBell } from './Icons';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setItems(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silently swallow fetch errors on interval
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    const unsub = realtime.on('notification:new', (notif) => {
      setItems((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
      setUnreadCount((c) => c + 1);
    });
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [open]);

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const markOne = async (id) => {
    try {
      await notificationsApi.markAsRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore
    }
  };

  return (
    <div className="notif-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className="notif-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          <div className="notif-overlay" onClick={() => setOpen(false)} />
          <div className="notif-dropdown">
            <div className="notif-head">
              <span className="notif-title">Notifications</span>
              {unreadCount > 0 && (
                <button type="button" className="notif-mark-read" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </div>

            <div className="notif-body">
              {items.length === 0 && <p className="notif-empty">No notifications yet.</p>}

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
                  <span className="notif-item-time">
                    {timeAgo(n.created_at)}
                    {n.stage_name ? ` · ${n.stage_name}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
