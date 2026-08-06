const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const authenticate = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get('/', authorize('owner', 'supervisor', 'tenant'), leaveController.getAll);
router.get('/:id', authorize('owner', 'supervisor', 'tenant'), leaveController.getById);
router.post('/', authorize('tenant', 'owner', 'supervisor'), leaveController.create);
router.put('/:id', authorize('owner', 'supervisor'), leaveController.update);
router.post('/:id/approve', authorize('owner', 'supervisor'), leaveController.approve);
router.delete('/:id', authorize('owner', 'supervisor'), leaveController.remove);

module.exports = router;
