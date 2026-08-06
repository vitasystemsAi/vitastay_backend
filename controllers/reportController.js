const { Op, fn, col } = require('sequelize');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  Hostel, Room, Tenant, RentPayment, Expense, Visitor, Complaint,
  Maintenance, Staff, User,
} = require('../models');
const { success } = require('../utils/response');

const buildDateFilter = (query, field = 'created_at') => {
  const filter = {};
  if (query.startDate || query.endDate) {
    filter[field] = {};
    if (query.startDate) filter[field][Op.gte] = query.startDate;
    if (query.endDate) filter[field][Op.lte] = query.endDate;
  }
  return filter;
};

exports.occupancyReport = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;

    const rooms = await Room.findAll({
      where,
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    });

    const total = rooms.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
    const occupied = rooms.find((r) => r.status === 'occupied')?.count || 0;

    return success(res, {
      rooms,
      total,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
};

exports.rentCollectionReport = async (req, res, next) => {
  try {
    const where = { status: 'paid', ...buildDateFilter(req.query, 'paid_date') };
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;
    if (req.query.monthYear) where.month_year = req.query.monthYear;

    const payments = await RentPayment.findAll({
      where,
      include: [{ model: Tenant, as: 'tenant', include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name'] }] }],
      order: [['paid_date', 'DESC']],
    });

    const total = payments.reduce((sum, p) => sum + parseFloat(p.paid_amount), 0);
    return success(res, { payments, total });
  } catch (err) {
    next(err);
  }
};

exports.pendingRentReport = async (req, res, next) => {
  try {
    const where = { status: { [Op.in]: ['pending', 'partial', 'overdue'] } };
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;

    const payments = await RentPayment.findAll({
      where,
      include: [{ model: Tenant, as: 'tenant', include: [{ model: User, as: 'user' }, 'room'] }],
      order: [['due_date', 'ASC']],
    });

    const total = payments.reduce((sum, p) => sum + (parseFloat(p.total_amount) - parseFloat(p.paid_amount)), 0);
    return success(res, { payments, total });
  } catch (err) {
    next(err);
  }
};

exports.expenseReport = async (req, res, next) => {
  try {
    const where = buildDateFilter(req.query, 'expense_date');
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;
    if (req.query.category) where.category = req.query.category;

    const expenses = await Expense.findAll({
      where,
      order: [['expense_date', 'DESC']],
    });

    const byCategory = await Expense.findAll({
      where,
      attributes: ['category', [fn('SUM', col('amount')), 'total']],
      group: ['category'],
      raw: true,
    });

    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    return success(res, { expenses, byCategory, total });
  } catch (err) {
    next(err);
  }
};

exports.financeSummary = async (req, res, next) => {
  try {
    const hostelId = req.query.hostelId;
    const monthYear = req.query.monthYear || dayjs().format('YYYY-MM');

    const incomeWhere = { status: 'paid', month_year: monthYear };
    const expenseWhere = {};
    if (hostelId) {
      incomeWhere.hostel_id = hostelId;
      expenseWhere.hostel_id = hostelId;
    }

    const [income, expenses] = await Promise.all([
      RentPayment.sum('paid_amount', { where: incomeWhere }),
      Expense.sum('amount', { where: expenseWhere }),
    ]);

    return success(res, {
      income: income || 0,
      expenses: expenses || 0,
      profit: (income || 0) - (expenses || 0),
      monthYear,
    });
  } catch (err) {
    next(err);
  }
};

exports.exportExcel = async (req, res, next) => {
  try {
    const { type } = req.query;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    if (type === 'rent') {
      sheet.columns = [
        { header: 'Tenant', key: 'tenant', width: 25 },
        { header: 'Month', key: 'month', width: 12 },
        { header: 'Amount', key: 'amount', width: 12 },
        { header: 'Paid', key: 'paid', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Due Date', key: 'due_date', width: 15 },
      ];
      const payments = await RentPayment.findAll({
        where: req.query.hostelId ? { hostel_id: req.query.hostelId } : {},
        include: [{ model: Tenant, as: 'tenant', include: [{ model: User, as: 'user' }] }],
        limit: 1000,
      });
      payments.forEach((p) => {
        sheet.addRow({
          tenant: `${p.tenant?.user?.first_name} ${p.tenant?.user?.last_name}`,
          month: p.month_year,
          amount: p.total_amount,
          paid: p.paid_amount,
          status: p.status,
          due_date: p.due_date,
        });
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${dayjs().format('YYYY-MM-DD')}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

exports.globalSearch = async (req, res, next) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return success(res, { tenants: [], rooms: [], visitors: [], staff: [], complaints: [] });

    const like = { [Op.like]: `%${q}%` };
    const [tenants, rooms, visitors, staff, complaints] = await Promise.all([
      Tenant.findAll({
        limit: 5,
        include: [{ model: User, as: 'user', where: { [Op.or]: [{ first_name: like }, { last_name: like }, { email: like }] } }],
      }),
      Room.findAll({ where: { room_number: like }, limit: 5, include: ['hostel'] }),
      Visitor.findAll({ where: { [Op.or]: [{ name: like }, { phone: like }] }, limit: 5 }),
      Staff.findAll({
        limit: 5,
        include: [{ model: User, as: 'user', where: { [Op.or]: [{ first_name: like }, { last_name: like }] } }],
      }),
      Complaint.findAll({ where: { title: like }, limit: 5 }),
    ]);

    return success(res, { tenants, rooms, visitors, staff, complaints });
  } catch (err) {
    next(err);
  }
};
