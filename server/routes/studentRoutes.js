const express = require('express');
const { body, param } = require('express-validator');
const controller = require('../controllers/studentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');
const { validate } = require('../middleware/validate');

const router = express.Router();

// Every route here is student-only.
router.use(protect, restrictTo('student'));

router.get('/clearance-status', controller.getClearanceStatus);

router.get('/document-types', controller.getDocumentTypes);
router.get('/requirements', controller.getRequirementChecklist);
// Registered before '/documents' so the literal path is not shadowed.
router.get('/documents/by-stage', controller.getDocumentsByStage);
router.get('/documents', controller.getDocuments);
router.post('/documents', upload.single('file'), controller.uploadDocument);
router.put('/documents/:documentId', upload.single('file'), controller.replaceDocument);
router.post('/documents/:documentId/replace', upload.single('file'), controller.replaceDocument);
router.delete('/documents/:documentId', controller.deleteDocument);

router.post(
  '/submit/:stageId',
  [
    body('document_ids').optional().isArray().withMessage('document_ids must be an array.'),
    body('remarks').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  ],
  validate,
  controller.submitStage
);

router.post('/pay/:stageId', controller.initiatePayment);
router.get('/payments', controller.getPayments);
router.get('/payments/:paymentId/receipt', [param('paymentId').isInt({ min: 1 })], validate, controller.getReceipt);

router.get('/timeline', controller.getTimeline);

router.get('/certificate', controller.getCertificate);

// Profile management
router.get('/profile', controller.getProfile);
router.put('/profile', controller.updateProfile);
router.post('/profile/passport', upload.single('passport'), controller.uploadPassport);

// Sectional clearance slip download
router.get('/stages/:stageId/slip', [param('stageId').isInt({ min: 1 })], validate, controller.getClearanceSlip);

// Section clearance custom form
router.get('/stages/:stageId/form', [param('stageId').isInt({ min: 1 })], validate, controller.getStageForm);
router.post('/stages/:stageId/form', [param('stageId').isInt({ min: 1 })], validate, controller.saveStageForm);

module.exports = router;
