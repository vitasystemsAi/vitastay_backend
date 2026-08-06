const { Op } = require('sequelize');
const { Hostel, User, Room, SupervisorHostel } = require('../models');
const { success, created, paginated, error } = require('../utils/response');
const { getPagination, getSort, buildSearchWhere } = require('../utils/pagination');
const { createAuditLog } = require('../helpers/audit');
const { ensureHostelDatabase } = require('../services/ensureHostelDatabase');
const { getModelsForHostel } = require('../helpers/hostelContext');

exports.getAll = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const where = {};

    if (req.user.role === 'super_admin') {
      // Platform-wide access
    } else if (req.user.role === 'owner') {
      where.owner_id = req.user.id;
    } else if (req.user.role === 'supervisor') {
      const assignments = await SupervisorHostel.findAll({ where: { supervisor_id: req.user.id } });
      where.id = { [Op.in]: assignments.map((a) => a.hostel_id) };
    }

    if (req.query.status) where.status = req.query.status;
    if (req.query.search) Object.assign(where, buildSearchWhere(req.query.search, ['name', 'city', 'address']));

    const { count, rows } = await Hostel.findAndCountAll({
      where,
      include: [{ model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'] }],
      order: getSort(req.query, ['name', 'created_at', 'city']),
      limit,
      offset,
    });

    return paginated(res, rows, { page, limit, total: count });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const hostel = await Hostel.findByPk(req.params.id, {
      include: [{ model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] }],
    });
    if (!hostel) return error(res, 'Hostel not found', 404);

    let rooms = [];
    try {
      const ctx = await getModelsForHostel(hostel);
      if (ctx.models.Room) {
        rooms = await ctx.models.Room.findAll({
          where: ctx.isolated ? {} : { hostel_id: hostel.id },
          limit: 10,
        });
      }
    } catch {
      rooms = [];
    }

    const payload = hostel.toJSON();
    payload.rooms = rooms;
    return success(res, payload);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = { ...req.body, owner_id: req.user.id };
    if (req.user.role === 'super_admin' && req.body.owner_id) {
      data.owner_id = req.body.owner_id;
    }
    if (req.files?.length) {
      data.images = req.files.map((f) => `/uploads/hostels/${f.filename}`);
    }

    // Owner branch → pending (DB created only after Super Admin approval)
    // Super Admin hostel → active + dedicated database immediately
    if (req.user.role === 'super_admin') {
      data.status = req.body.status || 'active';
    } else {
      data.status = 'pending_approval';
    }

    const hostel = await Hostel.create(data);

    let message = 'Branch submitted for Super Admin approval';
    if (hostel.status === 'active' || req.user.role === 'super_admin') {
      try {
        const databaseName = await ensureHostelDatabase(hostel);
        await hostel.reload();
        message = `Hostel created with isolated database "${databaseName}"`;
      } catch (provisionErr) {
        message = `Hostel created but database provisioning failed: ${provisionErr.message}`;
      }
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entityType: 'hostel',
      entityId: hostel.id,
      newValues: { ...data, database_name: hostel.database_name },
      req,
    });
    return created(res, hostel, message);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const hostel = await Hostel.findByPk(req.params.id);
    if (!hostel) return error(res, 'Hostel not found', 404);
    if (req.user.role === 'owner' && hostel.owner_id !== req.user.id) {
      return error(res, 'Forbidden', 403);
    }

    const payload = { ...req.body };
    // Only Super Admin can approve / change approval statuses
    if (req.user.role !== 'super_admin') {
      delete payload.status;
      if (['pending_approval', 'rejected'].includes(hostel.status) && req.user.role === 'supervisor') {
        return error(res, 'Hostel is awaiting Super Admin approval', 403);
      }
    }

    const oldValues = hostel.toJSON();
    if (req.files?.length) {
      payload.images = [...(hostel.images || []), ...req.files.map((f) => `/uploads/hostels/${f.filename}`)];
    }
    await hostel.update(payload);
    await createAuditLog({ userId: req.user.id, action: 'UPDATE', entityType: 'hostel', entityId: hostel.id, oldValues, newValues: payload, req });
    return success(res, hostel, 'Hostel updated successfully');
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const hostel = await Hostel.findByPk(req.params.id);
    if (!hostel) return error(res, 'Hostel not found', 404);
    if (req.user.role !== 'super_admin' && hostel.owner_id !== req.user.id) {
      return error(res, 'Forbidden', 403);
    }
    await hostel.destroy();
    await createAuditLog({ userId: req.user.id, action: 'DELETE', entityType: 'hostel', entityId: hostel.id, req });
    return success(res, null, 'Hostel deleted successfully');
  } catch (err) {
    next(err);
  }
};
