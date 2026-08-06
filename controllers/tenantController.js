const dayjs = require('dayjs');
const {
  Tenant, User, Room, Bed, Hostel, BedAssignment, RentPayment, TenantDocument,
} = require('../models');
const { success, created, paginated, error } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { hashPassword } = require('../helpers/password');
const { generateReceiptNumber, generateInvoiceNumber } = require('../helpers/token');

const USER_FIELDS = new Set(['email', 'password', 'first_name', 'last_name', 'phone']);
const SKIP_FIELDS = new Set([
  ...USER_FIELDS,
  'identities',
  'hostel_id',
  'room_id',
  'bed_id',
  'status',
]);

const parseMaybeJson = (value, fallback = []) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const splitFullName = (fullName = '', firstName = '', lastName = '') => {
  const cleaned = String(fullName || '').trim();
  if (!cleaned) {
    return {
      first_name: firstName || 'Tenant',
      last_name: lastName || 'User',
    };
  }
  const parts = cleaned.split(/\s+/);
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ') || parts[0],
  };
};

const pickTenantFields = (body) => {
  const data = {};
  Object.keys(body || {}).forEach((key) => {
    if (SKIP_FIELDS.has(key)) return;
    if (body[key] === undefined) return;
    data[key] = body[key];
  });

  data.same_as_permanent = toBool(body.same_as_permanent, true);
  data.is_student = toBool(body.is_student, false);

  if (data.same_as_permanent && data.permanent_address) {
    data.current_address = data.permanent_address;
  }

  if (data.permanent_address && !data.address) {
    data.address = data.permanent_address;
  }

  ['monthly_rent', 'deposit_amount', 'advance_amount'].forEach((field) => {
    if (data[field] !== undefined && data[field] !== '') {
      data[field] = Number(data[field]) || 0;
    }
  });

  return data;
};

const syncIdNumberColumns = (tenantData, identities = []) => {
  identities.forEach((identity) => {
    const type = identity.document_type || identity.id_type;
    const number = identity.id_number;
    if (!type || !number) return;
    if (type === 'aadhar') tenantData.aadhar = number;
    if (type === 'pan') tenantData.pan = number;
    if (type === 'passport') tenantData.passport = number;
    if (type === 'driving_license') tenantData.driving_license = number;
    if (type === 'voter_id') tenantData.voter_id = number;
  });
};

const saveIdentityDocuments = async ({ tenantId, identities, files, userId, transaction, DocumentModel }) => {
  const Doc = DocumentModel || TenantDocument;
  const docs = [];
  for (let i = 0; i < identities.length; i += 1) {
    const identity = identities[i];
    const type = identity.document_type || identity.id_type;
    const number = identity.id_number;
    if (!type || !number) continue;

    const front = files?.[`id_${i}_front`]?.[0] || (i === 0 ? files?.id_front?.[0] : null);
    const back = files?.[`id_${i}_back`]?.[0] || (i === 0 ? files?.id_back?.[0] : null);
    if (!front) continue;

    const labels = {
      aadhar: 'Aadhaar Card',
      pan: 'PAN Card',
      passport: 'Passport',
      driving_license: 'Driving License',
      voter_id: 'Voter ID',
      other: 'ID Document',
    };

    docs.push({
      tenant_id: tenantId,
      document_type: type,
      title: `${labels[type] || 'ID'} - ${number}`,
      id_number: number,
      file_path: `/uploads/tenants/${front.filename}`,
      back_file_path: back ? `/uploads/tenants/${back.filename}` : null,
      expiry_date: identity.expiry_date || null,
      file_size: front.size,
      mime_type: front.mimetype,
      uploaded_by: userId,
    });
  }

  if (docs.length) {
    await Doc.bulkCreate(docs, { transaction });
  }
  return docs;
};

exports.getAll = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;
    const { getModelsForHostel } = require('../helpers/hostelContext');
    const master = require('../models');

    if (hostelId) {
      const ctx = await getModelsForHostel(hostelId);
      if (!ctx.hostel) return error(res, 'Hostel not found', 404);
      if (ctx.hostel.status === 'pending_approval') {
        return paginated(res, [], { page, limit, total: 0 });
      }

      const where = ctx.isolated ? {} : { hostel_id: hostelId };
      if (req.query.status) where.status = req.query.status;

      const { count, rows } = await ctx.models.Tenant.findAndCountAll({
        where,
        include: [
          { model: ctx.models.Room, as: 'room', attributes: ['id', 'room_number', 'floor'], required: false },
          { model: ctx.models.Bed, as: 'bed', attributes: ['id', 'bed_number'], required: false },
        ],
        order: getSort(req.query, ['created_at', 'move_in_date']),
        limit,
        offset,
      });

      const userIds = rows.map((r) => r.user_id).filter(Boolean);
      const users = userIds.length
        ? await master.User.findAll({
          where: { id: userIds },
          attributes: { exclude: ['password'] },
        })
        : [];
      const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

      const mapped = rows.map((row) => {
        const json = row.toJSON();
        json.user = userMap[row.user_id] || null;
        json.hostel = { id: ctx.hostel.id, name: ctx.hostel.name, database_name: ctx.databaseName };
        return json;
      });

      return paginated(res, mapped, { page, limit, total: count });
    }

    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.roomId) where.room_id = req.query.roomId;

    const { count, rows } = await Tenant.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: { exclude: ['password'] } },
        { model: Hostel, as: 'hostel', attributes: ['id', 'name', 'database_name'] },
        { model: Room, as: 'room', attributes: ['id', 'room_number', 'floor'] },
        { model: Bed, as: 'bed', attributes: ['id', 'bed_number'] },
      ],
      order: getSort(req.query, ['created_at', 'move_in_date']),
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
    const tenant = await Tenant.findByPk(req.params.id, {
      include: ['user', 'hostel', 'room', 'bed', 'documents', 'rentPayments'],
    });
    if (!tenant) return error(res, 'Tenant not found', 404);
    return success(res, tenant);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  const master = require('../models');
  const { getModelsForHostel } = require('../helpers/hostelContext');
  const t = await master.sequelize.transaction();
  let hostelTx = null;
  try {
    const body = req.body || {};
    const email = body.email;
    const phone = body.phone;
    const fullName = body.full_name;
    const names = splitFullName(fullName, body.first_name, body.last_name);
    const hostel_id = Number(body.hostel_id);
    const room_id = body.room_id ? Number(body.room_id) : null;
    const bed_id = body.bed_id ? Number(body.bed_id) : null;

    if (!email || !fullName || !hostel_id || !phone) {
      await t.rollback();
      return error(res, 'Full name, email, mobile and hostel are required', 400);
    }

    const catalogHostel = await master.Hostel.findByPk(hostel_id);
    if (!catalogHostel) {
      await t.rollback();
      return error(res, 'Hostel/branch not found', 404);
    }
    if (catalogHostel.status === 'pending_approval') {
      await t.rollback();
      return error(res, 'Hostel/branch is awaiting Super Admin approval', 403);
    }

    const identities = parseMaybeJson(body.identities, []);
    if (!identities.length || !identities[0]?.id_number) {
      await t.rollback();
      return error(res, 'At least one identity proof is required', 400);
    }

    if (toBool(body.is_student, false) && !body.guardian_name) {
      await t.rollback();
      return error(res, 'Parent/Guardian details are mandatory for students', 400);
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      await t.rollback();
      return error(res, 'Email already exists', 409);
    }

    const user = await User.create({
      email,
      password: await hashPassword(body.password || 'Tenant@123'),
      first_name: names.first_name,
      last_name: names.last_name,
      phone,
      role: 'tenant',
    }, { transaction: t });

    const ctx = await getModelsForHostel(catalogHostel);
    const db = ctx.models;
    hostelTx = ctx.isolated ? await db.sequelize.transaction() : t;

    if (bed_id) {
      const bed = await db.Bed.findByPk(bed_id, { transaction: hostelTx });
      if (bed) {
        await bed.update({ status: 'occupied' }, { transaction: hostelTx });
        await db.Room.update({ status: 'occupied' }, { where: { id: bed.room_id }, transaction: hostelTx });
      }
    }

    const tenantData = pickTenantFields(body);
    tenantData.full_name = fullName;
    if (req.files?.photo?.[0]) {
      tenantData.photo = `/uploads/tenants/${req.files.photo[0].filename}`;
    }
    syncIdNumberColumns(tenantData, identities);

    const tenant = await db.Tenant.create({
      user_id: user.id,
      hostel_id,
      room_id,
      bed_id,
      move_in_date: tenantData.move_in_date || dayjs().format('YYYY-MM-DD'),
      status: 'active',
      ...tenantData,
    }, { transaction: hostelTx });

    await saveIdentityDocuments({
      tenantId: tenant.id,
      identities,
      files: req.files,
      userId: req.user.id,
      transaction: hostelTx,
      DocumentModel: db.TenantDocument,
    });

    if (bed_id) {
      await db.BedAssignment.create({
        bed_id,
        tenant_id: tenant.id,
        assigned_by: req.user.id,
        status: 'active',
      }, { transaction: hostelTx });
    }

    if (tenantData.monthly_rent) {
      await db.RentPayment.create({
        tenant_id: tenant.id,
        hostel_id,
        room_id,
        amount: tenantData.monthly_rent,
        total_amount: tenantData.monthly_rent,
        due_date: dayjs().add(1, 'month').date(5).format('YYYY-MM-DD'),
        month_year: dayjs().format('YYYY-MM'),
        receipt_number: generateReceiptNumber(),
        invoice_number: generateInvoiceNumber(),
        status: 'pending',
      }, { transaction: hostelTx });
    }

    await t.commit();
    if (ctx.isolated && hostelTx) await hostelTx.commit();

    const result = await db.Tenant.findByPk(tenant.id, {
      include: [
        { model: db.Room, as: 'room', required: false },
        { model: db.Bed, as: 'bed', required: false },
        { model: db.TenantDocument, as: 'documents', required: false },
      ],
    });
    const payload = result?.toJSON?.() || result;
    payload.user = { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone };
    payload.hostel = { id: catalogHostel.id, name: catalogHostel.name, database_name: ctx.databaseName };
    return created(res, payload, ctx.isolated
      ? `Tenant created in branch database "${ctx.databaseName}"`
      : 'Tenant created successfully');
  } catch (err) {
    try { await t.rollback(); } catch { /* ignore */ }
    try { if (hostelTx) await hostelTx.rollback(); } catch { /* ignore */ }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();
  try {
    const tenant = await Tenant.findByPk(req.params.id, { include: ['user'], transaction: t });
    if (!tenant) {
      await t.rollback();
      return error(res, 'Tenant not found', 404);
    }

    const body = req.body || {};
    const fullName = body.full_name || tenant.full_name;
    const names = splitFullName(fullName, body.first_name, body.last_name);
    const identities = parseMaybeJson(body.identities, []);

    await tenant.user.update({
      first_name: names.first_name,
      last_name: names.last_name,
      phone: body.phone !== undefined ? body.phone : tenant.user.phone,
      email: body.email || tenant.user.email,
    }, { transaction: t });

    const tenantData = pickTenantFields(body);
    if (fullName) tenantData.full_name = fullName;
    if (req.files?.photo?.[0]) {
      tenantData.photo = `/uploads/tenants/${req.files.photo[0].filename}`;
    }
    if (identities.length) syncIdNumberColumns(tenantData, identities);

    if (body.hostel_id) tenantData.hostel_id = Number(body.hostel_id);
    if (body.room_id !== undefined) tenantData.room_id = body.room_id ? Number(body.room_id) : null;
    if (body.bed_id !== undefined) tenantData.bed_id = body.bed_id ? Number(body.bed_id) : null;
    if (body.status) tenantData.status = body.status;

    await tenant.update(tenantData, { transaction: t });

    if (identities.length) {
      await saveIdentityDocuments({
        tenantId: tenant.id,
        identities,
        files: req.files,
        userId: req.user.id,
        transaction: t,
      });
    }

    await t.commit();
    const result = await Tenant.findByPk(tenant.id, {
      include: ['user', 'hostel', 'room', 'bed', 'documents'],
    });
    return success(res, result, 'Tenant updated successfully');
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.moveOut = async (req, res, next) => {
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();
  try {
    const tenant = await Tenant.findByPk(req.params.id, { transaction: t });
    if (!tenant) {
      await t.rollback();
      return error(res, 'Tenant not found', 404);
    }

    await tenant.update({
      status: 'moved_out',
      move_out_date: req.body.move_out_date || dayjs().format('YYYY-MM-DD'),
    }, { transaction: t });

    if (tenant.bed_id) {
      await Bed.update({ status: 'vacant' }, { where: { id: tenant.bed_id }, transaction: t });
      await BedAssignment.update(
        { status: 'vacated', vacated_at: new Date() },
        { where: { tenant_id: tenant.id, status: 'active' }, transaction: t }
      );
      const vacantBeds = await Bed.count({ where: { room_id: tenant.room_id, status: 'vacant' }, transaction: t });
      const totalBeds = await Bed.count({ where: { room_id: tenant.room_id }, transaction: t });
      if (vacantBeds === totalBeds) {
        await Room.update({ status: 'vacant' }, { where: { id: tenant.room_id }, transaction: t });
      }
    }

    await t.commit();
    return success(res, tenant, 'Tenant moved out successfully');
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return error(res, 'Tenant not found', 404);
    await tenant.destroy();
    return success(res, null, 'Tenant deleted successfully');
  } catch (err) {
    next(err);
  }
};
