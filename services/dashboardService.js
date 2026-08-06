const { Op, fn, col, literal } = require('sequelize');
const dayjs = require('dayjs');
const {
  Hostel, Room, Bed, Tenant, RentPayment, Expense, Complaint, Maintenance,
  Visitor, StaffAttendance, FinanceTransaction, User, SupervisorHostel,
} = require('../models');

const getOwnerDashboard = async (ownerId) => {
  const hostels = await Hostel.findAll({ where: { owner_id: ownerId }, attributes: ['id'] });
  const hostelIds = hostels.map((h) => h.id);

  if (!hostelIds.length) {
    return {
      stats: { totalHostels: 0, occupiedRooms: 0, vacantRooms: 0, monthlyIncome: 0, pendingRent: 0, complaints: 0, maintenance: 0, visitorsToday: 0 },
      charts: { monthlyIncome: [], occupancyRate: [], expenses: [] },
      recentActivities: [],
    };
  }

  const [occupiedRooms, vacantRooms, monthlyIncome, pendingRent, complaints, maintenance, visitorsToday] = await Promise.all([
    Room.count({ where: { hostel_id: hostelIds, status: 'occupied' } }),
    Room.count({ where: { hostel_id: hostelIds, status: 'vacant' } }),
    RentPayment.sum('paid_amount', {
      where: {
        hostel_id: hostelIds,
        status: 'paid',
        month_year: dayjs().format('YYYY-MM'),
      },
    }),
    RentPayment.sum('total_amount', {
      where: { hostel_id: hostelIds, status: { [Op.in]: ['pending', 'partial', 'overdue'] } },
    }),
    Complaint.count({ where: { hostel_id: hostelIds, status: { [Op.notIn]: ['resolved', 'closed'] } } }),
    Maintenance.count({ where: { hostel_id: hostelIds, status: { [Op.notIn]: ['completed', 'cancelled'] } } }),
    Visitor.count({
      where: {
        hostel_id: hostelIds,
        in_time: { [Op.gte]: dayjs().startOf('day').toDate() },
      },
    }),
  ]);

  const monthlyIncomeChart = await RentPayment.findAll({
    attributes: [
      'month_year',
      [fn('SUM', col('paid_amount')), 'total'],
    ],
    where: { hostel_id: hostelIds, status: 'paid' },
    group: ['month_year'],
    order: [['month_year', 'ASC']],
    limit: 12,
    raw: true,
  });

  const totalRooms = occupiedRooms + vacantRooms;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const expensesChart = await Expense.findAll({
    attributes: ['category', [fn('SUM', col('amount')), 'total']],
    where: {
      hostel_id: hostelIds,
      expense_date: { [Op.gte]: dayjs().subtract(6, 'month').format('YYYY-MM-DD') },
    },
    group: ['category'],
    raw: true,
  });

  return {
    stats: {
      totalHostels: hostelIds.length,
      occupiedRooms,
      vacantRooms,
      monthlyIncome: monthlyIncome || 0,
      pendingRent: pendingRent || 0,
      complaints,
      maintenance,
      visitorsToday,
      occupancyRate,
    },
    charts: {
      monthlyIncome: monthlyIncomeChart,
      occupancyRate: [{ occupied: occupiedRooms, vacant: vacantRooms, rate: occupancyRate }],
      expenses: expensesChart,
    },
    recentActivities: [],
  };
};

const getSupervisorDashboard = async (supervisorId, hostelId) => {
  const assignment = await SupervisorHostel.findOne({
    where: { supervisor_id: supervisorId, hostel_id: hostelId },
  });
  if (!assignment) throw Object.assign(new Error('Hostel not assigned'), { statusCode: 403 });

  const today = dayjs().format('YYYY-MM-DD');

  const [checkIns, checkOuts, pendingRent, complaints, maintenance, visitors, attendance, rooms] = await Promise.all([
    Tenant.count({ where: { hostel_id: hostelId, move_in_date: today } }),
    Tenant.count({ where: { hostel_id: hostelId, move_out_date: today } }),
    RentPayment.count({ where: { hostel_id: hostelId, status: { [Op.in]: ['pending', 'overdue'] } } }),
    Complaint.count({ where: { hostel_id: hostelId, status: { [Op.notIn]: ['resolved', 'closed'] } } }),
    Maintenance.count({ where: { hostel_id: hostelId, status: { [Op.notIn]: ['completed', 'cancelled'] } } }),
    Visitor.count({ where: { hostel_id: hostelId, in_time: { [Op.gte]: dayjs().startOf('day').toDate() } } }),
    StaffAttendance.count({ where: { date: today, status: 'present' }, include: [{ model: require('../models').Staff, as: 'staff', where: { hostel_id: hostelId }, attributes: [] }] }),
    Room.findAll({ where: { hostel_id: hostelId }, attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true }),
  ]);

  return {
    stats: { checkIns, checkOuts, pendingRent, complaints, maintenance, visitors, attendance },
    rooms,
  };
};

const getTenantDashboard = async (userId) => {
  const tenant = await Tenant.findOne({
    where: { user_id: userId },
    include: ['hostel', 'room', 'bed', { model: User, as: 'user', attributes: ['first_name', 'last_name', 'email', 'phone', 'avatar'] }],
  });

  if (!tenant) throw Object.assign(new Error('Tenant profile not found'), { statusCode: 404 });

  const [rentDue, paymentHistory, complaints, visitors, documents, announcements] = await Promise.all([
    RentPayment.findOne({
      where: { tenant_id: tenant.id, status: { [Op.in]: ['pending', 'partial', 'overdue'] } },
      order: [['due_date', 'ASC']],
    }),
    RentPayment.findAll({
      where: { tenant_id: tenant.id, status: 'paid' },
      order: [['paid_date', 'DESC']],
      limit: 5,
    }),
    Complaint.count({ where: { tenant_id: tenant.id, status: { [Op.notIn]: ['resolved', 'closed'] } } }),
    Visitor.count({ where: { tenant_id: tenant.id, status: { [Op.in]: ['approved', 'checked_in'] } } }),
    require('../models').TenantDocument.count({ where: { tenant_id: tenant.id } }),
    require('../models').Notice.findAll({
      where: {
        [Op.and]: [
          { [Op.or]: [{ hostel_id: tenant.hostel_id }, { hostel_id: null }] },
          { [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }] },
        ],
      },
      order: [['created_at', 'DESC']],
      limit: 5,
    }),
  ]);

  return {
    profile: tenant,
    rentDue,
    paymentHistory,
    stats: { complaints, visitors, documents },
    announcements,
  };
};

module.exports = { getOwnerDashboard, getSupervisorDashboard, getTenantDashboard };
