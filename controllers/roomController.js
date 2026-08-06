const { Room, Bed, Hostel, HostelBlock } = require('../models');
const { success, created, paginated, error } = require('../utils/response');
const { getPagination, getSort, buildSearchWhere } = require('../utils/pagination');
const { getModelsForHostel } = require('../helpers/hostelContext');
const masterDb = require('../models');

const createBedsForRoom = async (BedModel, room, sharingType) => {
  const beds = [];
  for (let i = 1; i <= sharingType; i++) {
    beds.push({ room_id: room.id, bed_number: String(i), status: 'vacant' });
  }
  await BedModel.bulkCreate(beds);
};

exports.getAll = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;

    // Branch-isolated read: never mix rooms across branch databases
    if (hostelId) {
      const ctx = await getModelsForHostel(hostelId);
      if (!ctx.hostel) return error(res, 'Hostel not found', 404);
      if (ctx.hostel.status === 'pending_approval') {
        return paginated(res, [], { page, limit, total: 0 });
      }

      const where = ctx.isolated ? {} : { hostel_id: hostelId };
      if (req.query.status) where.status = req.query.status;
      if (req.query.floor) where.floor = req.query.floor;
      if (req.query.search) Object.assign(where, buildSearchWhere(req.query.search, ['room_number']));

      const RoomModel = ctx.models.Room;
      const BedModel = ctx.models.Bed;
      const BlockModel = ctx.models.HostelBlock;

      const { count, rows } = await RoomModel.findAndCountAll({
        where,
        include: [
          { model: BedModel, as: 'beds', required: false },
          { model: BlockModel, as: 'block', attributes: ['id', 'name'], required: false },
        ],
        order: getSort(req.query, ['room_number', 'floor', 'created_at']),
        limit,
        offset,
      });

      const withHostel = rows.map((r) => {
        const json = r.toJSON();
        json.hostel = { id: ctx.hostel.id, name: ctx.hostel.name, database_name: ctx.databaseName };
        return json;
      });

      return paginated(res, withHostel, { page, limit, total: count });
    }

    // Fallback: master DB (legacy hostels without dedicated DB)
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.floor) where.floor = req.query.floor;
    if (req.query.search) Object.assign(where, buildSearchWhere(req.query.search, ['room_number']));

    const { count, rows } = await Room.findAndCountAll({
      where,
      include: [
        { model: Hostel, as: 'hostel', attributes: ['id', 'name', 'database_name'] },
        { model: Bed, as: 'beds' },
        { model: HostelBlock, as: 'block', attributes: ['id', 'name'] },
      ],
      order: getSort(req.query, ['room_number', 'floor', 'created_at']),
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
    const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;
    if (hostelId) {
      const ctx = await getModelsForHostel(hostelId);
      const room = await ctx.models.Room.findByPk(req.params.id, {
        include: [
          { model: ctx.models.Bed, as: 'beds', required: false },
          { model: ctx.models.HostelBlock, as: 'block', required: false },
        ],
      });
      if (!room) return error(res, 'Room not found', 404);
      return success(res, room);
    }

    const room = await Room.findByPk(req.params.id, {
      include: ['hostel', 'block', 'beds'],
    });
    if (!room) return error(res, 'Room not found', 404);
    return success(res, room);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const hostelId = Number(req.body.hostel_id);
    if (!hostelId) return error(res, 'hostel_id is required', 400);

    const catalogHostel = await masterDb.Hostel.findByPk(hostelId);
    if (!catalogHostel) return error(res, 'Hostel not found', 404);
    if (catalogHostel.status === 'pending_approval') {
      return error(res, 'Hostel/branch is awaiting Super Admin approval', 403);
    }
    if (!catalogHostel.database_name && catalogHostel.status === 'active') {
      // Legacy hostel without DB — use master
    }

    const sharingMap = { single: 1, double: 2, triple: 3, dormitory: req.body.sharing_type || 6 };
    const sharingType = sharingMap[req.body.room_type] || 1;
    req.body.sharing_type = sharingType;
    if (req.files?.length) {
      req.body.images = req.files.map((f) => `/uploads/rooms/${f.filename}`);
    }

    const ctx = await getModelsForHostel(catalogHostel);
    const payload = {
      ...req.body,
      hostel_id: hostelId,
    };

    const room = await ctx.models.Room.create(payload);
    await createBedsForRoom(ctx.models.Bed, room, sharingType);
    const result = await ctx.models.Room.findByPk(room.id, {
      include: [{ model: ctx.models.Bed, as: 'beds', required: false }],
    });
    return created(res, result, ctx.isolated
      ? `Room created in branch database "${ctx.databaseName}"`
      : 'Room created successfully');
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const hostelId = req.body.hostel_id || req.query.hostelId;
    let room;
    let BedModel = Bed;

    if (hostelId) {
      const ctx = await getModelsForHostel(Number(hostelId));
      room = await ctx.models.Room.findByPk(req.params.id);
      BedModel = ctx.models.Bed;
    } else {
      room = await Room.findByPk(req.params.id);
    }

    if (!room) return error(res, 'Room not found', 404);
    if (req.files?.length) {
      req.body.images = [...(room.images || []), ...req.files.map((f) => `/uploads/rooms/${f.filename}`)];
    }
    await room.update(req.body);
    return success(res, room, 'Room updated successfully');
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;
    let room;
    if (hostelId) {
      const ctx = await getModelsForHostel(hostelId);
      room = await ctx.models.Room.findByPk(req.params.id);
    } else {
      room = await Room.findByPk(req.params.id);
    }
    if (!room) return error(res, 'Room not found', 404);
    await room.destroy();
    return success(res, null, 'Room deleted successfully');
  } catch (err) {
    next(err);
  }
};

exports.getVacant = async (req, res, next) => {
  try {
    const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;

    if (hostelId) {
      const ctx = await getModelsForHostel(hostelId);
      if (!ctx.hostel) return error(res, 'Hostel not found', 404);

      const where = { status: 'vacant', ...(ctx.isolated ? {} : { hostel_id: hostelId }) };
      const rooms = await ctx.models.Room.findAll({
        where,
        include: [{ model: ctx.models.Bed, as: 'beds', required: false }],
        order: [['room_number', 'ASC']],
      });
      return success(res, rooms);
    }

    const where = { status: 'vacant' };
    if (req.query.floor) where.floor = req.query.floor;
    const rooms = await Room.findAll({
      where,
      include: [
        { model: Hostel, as: 'hostel', attributes: ['id', 'name'] },
        { model: Bed, as: 'beds' },
      ],
      order: [['room_number', 'ASC']],
    });
    return success(res, rooms);
  } catch (err) {
    next(err);
  }
};
