const router = require('express').Router();
const controller = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

// Every signed-in role has an inbox — officers get submission alerts, students
// get decisions, admins get nothing yet but the endpoint costs nothing.
router.use(protect);

router.get('/', controller.list);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', controller.markRead);

module.exports = router;
