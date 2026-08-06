const { LeaveRequest, Tenant, User } = require('../models');
const createCrudController = require('../utils/crudController');
const { success } = require('../utils/response');

const base = createCrudController(LeaveRequest, {
  includes: [{ model: Tenant, as: 'tenant', include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name'] }] }],
  filterBuilder: (req) => {
    const where = {};
    if (req.query.tenantId) where.tenant_id = req.query.tenantId;
    if (req.query.status) where.status = req.query.status;
    return where;
  },
});

exports.getAll = base.getAll;
exports.getById = base.getById;
exports.create = base.create;
exports.remove = base.remove;

exports.approve = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findByPk(req.params.id);
    if (!leave) return require('../utils/response').error(res, 'Leave request not found', 404);
    await leave.update({
      status: req.body.status || 'approved',
      approved_by: req.user.id,
      approved_at: new Date(),
      rejection_reason: req.body.rejection_reason,
    });
    return success(res, leave, 'Leave request updated');
  } catch (err) {
    next(err);
  }
};

exports.update = base.update;
