const { body } = require('express-validator');

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

const resetPasswordValidation = [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const hostelValidation = [
  body('name').trim().notEmpty().withMessage('Hostel name is required'),
  body('address').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
  body('pincode').trim().notEmpty(),
];

const roomValidation = [
  body('hostel_id').isInt().withMessage('Hostel ID is required'),
  body('room_number').trim().notEmpty(),
  body('floor').isInt({ min: 0 }),
  body('room_type').isIn(['single', 'double', 'triple', 'dormitory']),
  body('rent').isFloat({ min: 0 }),
];

const tenantValidation = [
  body('email').isEmail().normalizeEmail(),
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  body('hostel_id').isInt(),
  body('phone').optional().isMobilePhone(),
];

const rentPaymentValidation = [
  body('tenant_id').isInt(),
  body('amount').isFloat({ min: 0 }),
  body('due_date').isDate(),
  body('month_year').matches(/^\d{4}-\d{2}$/),
];

module.exports = {
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  hostelValidation,
  roomValidation,
  tenantValidation,
  rentPaymentValidation,
};
