const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const authenticate = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);
router.use(authorize('super_admin'));

router.get('/meta', superAdminController.getMeta);
router.get('/dashboard', superAdminController.getDashboard);

router.get('/hostels', superAdminController.getHostels);
router.post('/hostels', superAdminController.registerHostel);
router.put('/hostels/:id', superAdminController.updateHostel);
router.patch('/hostels/:id/hold', superAdminController.setHostelHold);
router.patch('/hostels/:id/features', superAdminController.updateFeatures);
router.post('/hostels/:id/approve', superAdminController.approveHostel);
router.post('/hostels/:id/reject', superAdminController.rejectHostel);

router.get('/users', superAdminController.getUsers);
router.get('/users-by-hostel', superAdminController.getUsersByHostel);
router.post('/owners', superAdminController.createOwner);
router.post('/users/:id/reset-password', superAdminController.resetUserPassword);
router.patch('/users/:id/lock', superAdminController.lockUser);

module.exports = router;
