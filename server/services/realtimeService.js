/**
 * Real-time event broadcasting service using Server-Sent Events (SSE).
 *
 * Provides real-time synchronization between Students, Section Officers,
 * and Administrators as mandated in Chapter 3 System Architecture.
 *
 * Events supported:
 *  - 'clearance:update'  (student stage approved/rejected/overridden)
 *  - 'queue:update'      (new student submission for officers to review)
 *  - 'notification:new'  (new notification created for a user)
 *  - 'payment:update'    (payment recorded or verified)
 *  - 'stages:update'     (admin reconfigured stages or deadline)
 */
const { verifyToken } = require('../utils/token');

// Map of connectionId -> { res, user }
const clients = new Map();

/**
 * Handle new SSE connection request.
 */
function handleSseConnection(req, res) {
  // Extract token from query or Authorization header
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication token required for real-time stream.' });
    return;
  }

  let user = null;
  try {
    user = verifyToken(token);
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    return;
  }

  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable buffering on Nginx reverse proxy
  });

  const connectionId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  clients.set(connectionId, { res, user });

  // Initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ connectionId, userId: user.id, role: user.role })}\n\n`);

  // Heartbeat ping every 25 seconds to keep HTTP connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      clients.delete(connectionId);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(connectionId);
  });
}

/**
 * Send an event to a specific client.
 */
function sendToClient(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.warn('[realtime] failed to write to client:', err.message);
  }
}

/**
 * Emit event to a specific user by userId.
 */
function emitToUser(userId, event, data = {}) {
  const targetId = Number(userId);
  for (const client of clients.values()) {
    if (client.user && Number(client.user.id) === targetId) {
      sendToClient(client, event, data);
    }
  }
}

/**
 * Emit event to all users with a specific role (e.g. 'officer', 'admin', 'student').
 */
function emitToRole(role, event, data = {}) {
  for (const client of clients.values()) {
    if (client.user && client.user.role === role) {
      sendToClient(client, event, data);
    }
  }
}

/**
 * Broadcast event to all connected users.
 */
function broadcast(event, data = {}) {
  for (const client of clients.values()) {
    sendToClient(client, event, data);
  }
}

module.exports = {
  handleSseConnection,
  emitToUser,
  emitToRole,
  broadcast,
};

