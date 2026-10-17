const { validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

/** Collects express-validator results into the standard error envelope. */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return sendError(res, errors[0].message, 422, errors);
}

module.exports = { validate };
