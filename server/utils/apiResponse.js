/**
 * Consistent response envelopes.
 *
 * Every endpoint returns either:
 *   { success: true,  data: ... }
 *   { success: false, message: "...", errors?: [...] }
 *
 * Keeping this shape uniform means the React client can use one error handler
 * for the whole API.
 */

function sendSuccess(res, data = null, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res, message, status = 400, errors = undefined) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

/**
 * An error carrying an intended HTTP status, thrown from services/controllers
 * and translated by the central error handler.
 */
class ApiError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async route handler so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { sendSuccess, sendError, ApiError, asyncHandler };
