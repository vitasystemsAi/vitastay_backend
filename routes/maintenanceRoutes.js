const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');
const authenticate = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const upload = require('../middleware/upload');

router.use(authenticate);
router.use(authorize('owner', 'supervisor'));

router.get('/', maintenanceController.getAll);
router.get('/:id', maintenanceController.getById);
router.post('/', (req, res, next) => { req.uploadFolder = 'maintenance'; next(); }, upload.array('images', 5), maintenanceController.create);
router.put('/:id', maintenanceController.update);
router.delete('/:id', maintenanceController.remove);

module.exports = router;
