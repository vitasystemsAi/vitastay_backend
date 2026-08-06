const { Maintenance, Hostel, Room } = require('../models');
const createCrudController = require('../utils/crudController');

module.exports = createCrudController(Maintenance, {
  includes: [
    { model: Hostel, as: 'hostel', attributes: ['id', 'name'] },
    { model: Room, as: 'room', attributes: ['id', 'room_number'] },
  ],
  searchFields: ['title', 'description', 'vendor'],
  filterBuilder: (req) => {
    const where = {};
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.type = req.query.type;
    return where;
  },
  beforeCreate: async (req) => ({
    ...req.body,
    created_by: req.user.id,
    images: req.files?.map((f) => `/uploads/maintenance/${f.filename}`) || [],
  }),
});
