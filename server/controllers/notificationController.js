const notificationService = require('../services/notificationService');
const { sendSuccess, asyncHandler } = require('../utils/apiResponse');

/** GET /api/notifications?channel=in_app|sms|email */
const list = asyncHandler(async (req, res) => {
  const data = await notificationService.listForUser(req.user.id, req.query.channel || 'in_app');
  return sendSuccess(res, data);
});

/** PATCH /api/notifications/:id/read */
const markRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markRead(req.user.id, Number(req.params.id));
  return sendSuccess(res, result);
});

/** PATCH /api/notifications/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user.id);
  return sendSuccess(res, result);
});

module.exports = { list, markRead, markAllRead };
