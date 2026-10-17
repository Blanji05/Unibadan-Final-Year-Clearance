const express = require('express');
const paymentService = require('../services/paymentService');
const certificateService = require('../services/certificateService');
const { protect } = require('../middleware/authMiddleware');
const { sendSuccess, asyncHandler } = require('../utils/apiResponse');

const router = express.Router();

/**
 * GET /api/payment/verify/:reference
 * Called by the frontend after the Remita redirect. `reference` may be our order
 * reference or the Remita RRR.
 */
router.get(
  '/verify/:reference',
  protect,
  asyncHandler(async (req, res) => {
    const result = await paymentService.verifyPayment(req.params.reference);
    return sendSuccess(res, result);
  })
);

/**
 * POST /api/payment/webhook
 *
 * Called by Paystack when transactions succeed. Validated using HMAC SHA512.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-paystack-signature'];
    const result = await paymentService.handleWebhook(req.body, signature);
    return sendSuccess(res, result);
  })
);

/**
 * GET /api/payment/verify-certificate/:code
 * Public endpoint — lets a third party confirm a certificate is genuine.
 */
router.get(
  '/verify-certificate/:code',
  asyncHandler(async (req, res) => {
    const record = await certificateService.verifyCertificate(req.params.code);
    return sendSuccess(res, { certificate: record, valid: true });
  })
);

module.exports = router;
