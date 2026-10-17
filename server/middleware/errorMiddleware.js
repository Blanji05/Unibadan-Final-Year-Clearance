const { sendError } = require('../utils/apiResponse');
const { config } = require('../config/env');

/** 404 handler for unmatched API routes. */
function notFound(req, res) {
  return sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/**
 * Central error handler. Translates known error shapes into the standard
 * response envelope and avoids leaking internals in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (error.name === 'ApiError') {
    return sendError(res, error.message, error.status, error.details);
  }

  // Multer upload failures
  if (error.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 'File is too large. Maximum size is 5MB.', 413);
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return sendError(res, 'Unexpected file field in upload.', 400);
  }

  // MySQL duplicate key
  if (error.code === 'ER_DUP_ENTRY') {
    return sendError(res, 'That record already exists.', 409);
  }
  // MySQL connection problems - the most common local setup failure
  if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(error.code)) {
    console.error('[db]', error.message);
    return sendError(res, 'Database unavailable. Check your MySQL server and server/.env settings.', 503);
  }

  console.error('[error]', error);
  return sendError(
    res,
    config.nodeEnv === 'production' ? 'An unexpected error occurred.' : error.message,
    error.status || 500
  );
}

module.exports = { notFound, errorHandler };
