/**
 * Authentication + role-based authorisation.
 */
const { verifyToken } = require('../utils/token');
const { queryOne } = require('../config/db');
const { sendError, asyncHandler } = require('../utils/apiResponse');

/**
 * Verifies the Bearer token and loads the current user.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token payload, so deactivated accounts and role changes take effect
 * immediately instead of when the token expires.
 */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return sendError(res, 'Authentication required. Please log in.', 401);
  }

  let payload;
  try {
    payload = verifyToken(header.slice(7).trim());
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return sendError(res, expired ? 'Session expired. Please log in again.' : 'Invalid token.', 401);
  }

  const user = await queryOne(
    `SELECT id, full_name, email, role, matric_number, department, faculty, hall,
            section_code, phone_number, is_active, passport_url, signature_url, title,
            dob, gender, blood_group, genotype, next_of_kin_name, next_of_kin_phone,
            next_of_kin_address, contact_address, state_of_origin, lga, graduation_session, degree_program,
            must_change_password
       FROM users WHERE id = ?`,
    [payload.id]
  );

  if (!user) return sendError(res, 'Account no longer exists.', 401);
  if (!user.is_active) return sendError(res, 'This account has been deactivated.', 403);

  req.user = user;
  next();
});

/** Restrict a route to one or more roles. Usage: restrictTo('admin', 'officer') */
const restrictTo = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return sendError(res, 'You do not have permission to perform this action.', 403);
  }
  next();
};

/**
 * Officers may only act on their own section. Resolves the stage referenced by
 * the route and confirms it matches the officer's assigned section_code.
 * Admins bypass this check.
 */
const restrictToOwnSection = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'admin') return next();

  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId)) {
    return sendError(res, 'A valid stage id is required.', 400);
  }

  const stage = await queryOne('SELECT id, code FROM clearance_stages WHERE id = ?', [stageId]);
  if (!stage) return sendError(res, 'Clearance stage not found.', 404);

  if (stage.code !== req.user.section_code) {
    return sendError(res, 'You can only review submissions for your own section.', 403);
  }

  req.stage = stage;
  next();
});

module.exports = { protect, restrictTo, restrictToOwnSection };
