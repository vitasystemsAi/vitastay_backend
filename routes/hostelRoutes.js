const express = require('express');
const router = express.Router();
const hostelController = require('../controllers/hostelController');
const authenticate = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const upload = require('../middleware/upload');
const { validate } = require('../utils/response');
const { hostelValidation } = require('../middleware/validators');

router.use(authenticate);

router.get('/', authorize('super_admin', 'owner', 'supervisor'), hostelController.getAll);
router.get('/:id', authorize('super_admin', 'owner', 'supervisor'), hostelController.getById);
router.post('/', authorize('super_admin', 'owner'), (req, res, next) => { req.uploadFolder = 'hostels'; next(); }, upload.array('images', 10), hostelValidation, validate, hostelController.create);
router.put('/:id', authorize('super_admin', 'owner', 'supervisor'), (req, res, next) => { req.uploadFolder = 'hostels'; next(); }, upload.array('images', 10), hostelController.update);
router.delete('/:id', authorize('super_admin', 'owner'), hostelController.remove);

module.exports = router;
