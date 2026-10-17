const express = require('express');
const { body, param } = require('express-validator');
const controller = require('../controllers/adminController');
const reports = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.use(protect, restrictTo('admin'));

// --- Read-only overviews ----------------------------------------------------
router.get('/analytics', controller.getAnalytics);
router.get('/activity', controller.getActivity);
router.get('/users', controller.getUsers);
router.get('/stages', controller.getStages);

// --- Sections (clearance stages) --------------------------------------------
router.get('/sections', controller.getSections);

// Declared before '/sections/:stageId' so "reorder" is not read as an id.
router.patch(
  '/sections/reorder',
  [body('order').isArray({ min: 1 }).withMessage('Provide the new order as an array of section ids.')],
  validate,
  controller.reorderSections
);

router.post(
  '/sections',
  [
    body('code')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Give the section a short code (2–50 characters).')
      .matches(/^[A-Za-z0-9_ -]+$/)
      .withMessage('Section codes may only contain letters, numbers, spaces, hyphens and underscores.'),
    body('stage_name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Give the section a name between 3 and 100 characters.'),
    body('location').optional({ values: 'falsy' }).trim().isLength({ max: 150 }),
    body('description').optional({ values: 'falsy' }).trim(),
    body('estimated_duration_days').optional({ values: 'falsy' }).isInt({ min: 1, max: 60 })
      .withMessage('Expected duration must be between 1 and 60 days.'),
    body('requires_payment').optional().isBoolean(),
    body('payment_amount').optional({ values: 'falsy' }).isFloat({ min: 0 })
      .withMessage('Payment amount cannot be negative.'),
    body('stage_order').optional({ values: 'falsy' }).isInt({ min: 1 }),
  ],
  validate,
  controller.createSection
);

router.patch(
  '/sections/:stageId',
  [
    param('stageId').isInt({ min: 1 }),
    body('stage_name').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 100 }),
    body('location').optional({ values: 'falsy' }).trim().isLength({ max: 150 }),
    body('description').optional({ values: 'falsy' }).trim(),
    body('estimated_duration_days').optional({ values: 'falsy' }).isInt({ min: 1, max: 60 }),
    body('requires_payment').optional().isBoolean(),
    body('payment_amount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  ],
  validate,
  controller.updateSection
);

router.patch(
  '/sections/:stageId/status',
  [param('stageId').isInt({ min: 1 }), body('is_active').isBoolean().withMessage('is_active must be true or false.')],
  validate,
  controller.setSectionStatus
);

router.put(
  '/sections/:stageId/prerequisites',
  [
    param('stageId').isInt({ min: 1 }),
    body('prerequisite_ids').isArray().withMessage('Provide prerequisite_ids as an array (empty to clear).'),
  ],
  validate,
  controller.setPrerequisites
);

router.delete('/sections/:stageId', [param('stageId').isInt({ min: 1 })], validate, controller.deleteSection);

// --- Students ---------------------------------------------------------------
router.get('/students', controller.getStudents);
router.get('/students/:studentId', [param('studentId').isInt({ min: 1 })], validate, controller.getStudent);
router.get(
  '/students/:studentId/clearance',
  [param('studentId').isInt({ min: 1 })],
  validate,
  controller.getStudentClearance
);

router.post(
  '/students',
  [
    body('full_name').trim().isLength({ min: 3, max: 100 }).withMessage('Full name is required.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('matric_number')
      .trim()
      .isLength({ min: 3, max: 20 })
      .withMessage('Matriculation number is required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('department').trim().isLength({ min: 2, max: 100 }).withMessage('Department is required.'),
    body('faculty').trim().isLength({ min: 2, max: 100 }).withMessage('Faculty is required.'),
    body('hall').trim().isLength({ min: 2, max: 100 }).withMessage('Hall of residence is compulsory.'),
    body('phone_number').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  ],
  validate,
  controller.createStudent
);

router.patch(
  '/students/:studentId',
  [
    param('studentId').isInt({ min: 1 }),
    body('full_name').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 100 }),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email.').normalizeEmail(),
    body('matric_number').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 20 }),
    body('department').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('faculty').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('hall').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('phone_number').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  ],
  validate,
  controller.updateStudent
);

router.delete('/students', controller.deleteAllStudents);
router.delete('/students/:studentId', [param('studentId').isInt({ min: 1 })], validate, controller.deleteStudent);

// --- Officers and shared account actions ------------------------------------
router.post(
  '/officers',
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('section_code').trim().notEmpty().withMessage('Section code is required.'),
    body('faculty').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('department').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('hall').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  ],
  validate,
  controller.createOfficer
);

router.patch(
  '/users/:userId/status',
  [body('is_active').isBoolean().withMessage('is_active must be true or false.')],
  validate,
  controller.setUserStatus
);

router.patch(
  '/users/:userId/section',
  [
    param('userId').isInt({ min: 1 }),
    body('section_code').trim().notEmpty().withMessage('Section code is required.'),
    body('faculty').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('department').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  ],
  validate,
  controller.setOfficerSection
);

router.post(
  '/users/:userId/reset-password',
  [
    param('userId').isInt({ min: 1 }),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  ],
  validate,
  controller.resetPassword
);

// --- Clearance overrides and certificates -----------------------------------
router.patch(
  '/override/:studentId/:stageId',
  [
    body('status')
      .isIn(['not_started', 'pending', 'approved', 'rejected'])
      .withMessage('Invalid status value.'),
    body('remarks').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  ],
  validate,
  controller.overrideStage
);

router.post('/generate-certificate/:studentId', controller.generateCertificate);

// --- Reports, deadline and reminders ----------------------------------------
router.post(
  '/students/import',
  [body('csv').isString().notEmpty().withMessage('Choose a CSV file to import.')],
  validate,
  reports.importStudents
);
router.get('/export/students.csv', reports.exportStudents);
router.get('/export/payments.csv', reports.exportPayments);
router.get('/settings', reports.getSettings);
router.put(
  '/settings/deadline',
  [body('deadline').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('Use a valid date (YYYY-MM-DD).')],
  validate,
  reports.setDeadline
);
router.post('/send-reminders', reports.sendReminders);

module.exports = router;
