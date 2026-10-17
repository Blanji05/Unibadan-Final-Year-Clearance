const express = require('express');
const { body, param } = require('express-validator');
const controller = require('../controllers/officerController');
const { protect, restrictTo, restrictToOwnSection } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.use(protect, restrictTo('officer', 'admin'));

// Officer Profile & Signature
router.get('/profile', controller.getOfficerProfile);
router.put('/profile', controller.updateOfficerProfile);
router.post('/signature', upload.single('signature'), controller.uploadOfficerSignature);
router.post('/signature-drawing', controller.saveOfficerSignatureDrawing);

router.get('/pending-requests', controller.getPendingRequests);
router.get('/history', controller.getHistory);
router.get('/directory', controller.getOfficerDirectory);
router.get('/students/search', controller.searchStudents);
router.get('/students/:studentId/clearance', [param('studentId').isInt({ min: 1 })], validate, controller.getStudentClearanceCard);
router.get('/students/:studentId/stages/:stageId/slip', [param('studentId').isInt({ min: 1 }), param('stageId').isInt({ min: 1 })], validate, controller.getStudentSlip);

// --- Document checklist for the officer's own stage -------------------------
// No restrictToOwnSection here: the stage is taken from the officer's own
// section_code rather than the URL, so there is no other section to reach.
router.get('/requirements', controller.getRequirements);

router.post(
  '/requirements',
  [
    body('document_type_id').isInt({ min: 1 }).withMessage('Select a document to request.'),
    body('is_mandatory').optional().isBoolean(),
  ],
  validate,
  controller.addRequirement
);

router.delete(
  '/requirements/:documentTypeId',
  [param('documentTypeId').isInt({ min: 1 })],
  validate,
  controller.removeRequirement
);

router.post(
  '/document-types',
  [
    body('label')
      .trim()
      .isLength({ min: 3, max: 150 })
      .withMessage('Give the document a name between 3 and 150 characters.'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
    body('is_mandatory').optional().isBoolean(),
  ],
  validate,
  controller.createDocumentType
);

// --- Custom section form builder --------------------------------------------
router.get('/form-fields', controller.getFormFields);
router.post('/form-fields', controller.addFormField);
router.put('/form-fields/:fieldId', [param('fieldId').isInt({ min: 1 })], validate, controller.updateFormField);
router.delete('/form-fields/:fieldId', [param('fieldId').isInt({ min: 1 })], validate, controller.deleteFormField);

router.post(
  '/review-bulk',
  [
    body('student_ids').isArray({ min: 1, max: 100 }).withMessage('Select between 1 and 100 students.'),
    body('decision')
      .isIn(['approved', 'rejected'])
      .withMessage('Decision must be either "approved" or "rejected".'),
    body('remarks').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  ],
  validate,
  controller.reviewBulk
);

router.patch(
  '/review/:studentId/:stageId',
  restrictToOwnSection, // officers may only act on their own section
  [
    body('decision')
      .isIn(['approved', 'rejected'])
      .withMessage('Decision must be either "approved" or "rejected".'),
    body('remarks').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  ],
  validate,
  controller.reviewSubmission
);

module.exports = router;
