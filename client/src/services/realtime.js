/**
 * Real-time event subscriber using Server-Sent Events (SSE).
 *
 * Automatically connects when authenticated and receives server-pushed events:
 *   - 'clearance:update'  (stage approved/rejected/overridden)
 *   - 'queue:update'      (new submission waiting in officer queue)
 *   - 'notification:new'  (new notification item)
 *   - 'payment:update'    (payment success)
 *   - 'stages:update'     (admin reconfigured stages or deadline)
 */

class RealtimeClient {
  constructor() {
    this.source = null;
    this.listeners = new Map();
    this.token = null;
  }

  connect(token) {
    if (!token) return;
    if (this.source && this.token === token) return;

    this.disconnect();
    this.token = token;

    try {
      const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
      const url = `${apiBase}/realtime/stream?token=${encodeURIComponent(token)}`;
      this.source = new EventSource(url);

      const eventNames = [
        'connected',
        'clearance:update',
        'queue:update',
        'notification:new',
        'payment:update',
        'stages:update',
        'documents:update',
      ];

      for (const name of eventNames) {
        this.source.addEventListener(name, (e) => {
          let data = {};
          try {
            data = JSON.parse(e.data);
          } catch {
            data = e.data;
          }
          if (import.meta.env.DEV) {
            console.log(`[realtime] ${name}:`, data);
          }
          this.emit(name, data);
        });
      }

      let errorCount = 0;
      this.source.onopen = () => {
        errorCount = 0;
      };

      this.source.onerror = () => {
        errorCount += 1;
        if (errorCount > 3) {
          // Prevent endless retry spam when server is sleeping or behind proxy
          this.disconnect();
        }
      };
    } catch (err) {
      console.warn('[realtime] failed to initialize SSE:', err);
    }
  }

  disconnect() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.token = null;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try {
          cb(data);
        } catch (err) {
          console.error('[realtime] callback error:', err);
        }
      }
    }
  }
}

export const realtime = new RealtimeClient();

