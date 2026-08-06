const express = require('express');
const router = express.Router();
const rentController = require('../controllers/rentController');
const authenticate = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../utils/response');
const { rentPaymentValidation } = require('../middleware/validators');

router.use(authenticate);

router.get('/pending', authorize('owner', 'supervisor'), rentController.getPending);
router.get('/', authorize('owner', 'supervisor', 'tenant'), rentController.getAll);
router.get('/:id', authorize('owner', 'supervisor', 'tenant'), rentController.getById);
router.post('/', authorize('owner', 'supervisor'), rentPaymentValidation, validate, rentController.create);
router.post('/:id/collect', authorize('owner', 'supervisor'), rentController.collectPayment);

module.exports = router;
