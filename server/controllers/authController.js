const authService = require('../services/authService');
const { sendSuccess, asyncHandler } = require('../utils/apiResponse');

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerStudent(req.body);
  return sendSuccess(res, result, 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  return sendSuccess(res, result);
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, { user: req.user });
});

/** POST /api/auth/forgot-password - identical response whether or not the email exists. */
const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  return sendSuccess(res, {
    message: 'If an account exists for that email, a reset link is on its way.',
  });
});

/** POST /api/auth/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body.token, req.body.password);
  return sendSuccess(res, result);
});

/** POST /api/auth/change-initial-password (first login mandatory change) */
const changeInitialPassword = asyncHandler(async (req, res) => {
  const result = await authService.changeInitialPassword(req.user.id, req.body.password);
  return sendSuccess(res, result);
});

module.exports = { login, me, forgotPassword, resetPassword, changeInitialPassword };
