const express = require('express');
const { body } = require('express-validator');
const { login, me, forgotPassword, resetPassword, changeInitialPassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/login',
  [
    body('email').trim().notEmpty().withMessage('Email or matriculation number is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  validate,
  login
);

router.get('/me', protect, me);

router.post(
  '/change-initial-password',
  protect,
  [
    body('password')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters.')
      .matches(/\d/)
      .withMessage('Password must contain at least one number.'),
  ],
  validate,
  changeInitialPassword
);

router.post(
  '/forgot-password',
  [body('email').trim().notEmpty().withMessage('A valid email or matriculation number is required.')],
  validate,
  forgotPassword
);

router.post(
  '/reset-password',
  [
    body('token').isString().isLength({ min: 20, max: 200 }).withMessage('The reset link is invalid.'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/\d/)
      .withMessage('Password must contain at least one number.'),
  ],
  validate,
  resetPassword
);

module.exports = router;
