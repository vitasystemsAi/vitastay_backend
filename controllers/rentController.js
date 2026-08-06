const { Op } = require('sequelize');
const dayjs = require('dayjs');
const { RentPayment, Tenant, Hostel, Room, User, FinanceTransaction } = require('../models');
const { success, created, paginated, error } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { generateReceiptNumber, generateInvoiceNumber } = require('../helpers/token');
const { applyTenantScope, assertTenantOwnsRecord } = require('../helpers/tenantScope');

exports.getAll = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    let where = {};
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;
    if (req.query.tenantId) where.tenant_id = req.query.tenantId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.monthYear) where.month_year = req.query.monthYear;

    const scoped = await applyTenantScope(req, res, where);
    if (scoped.forbidden) return scoped.response;
    where = scoped.where;

    const { count, rows } = await RentPayment.findAndCountAll({
      where,
      include: [
        { model: Tenant, as: 'tenant', include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email'] }] },
        { model: Hostel, as: 'hostel', attributes: ['id', 'name'] },
        { model: Room, as: 'room', attributes: ['id', 'room_number'] },
      ],
      order: getSort(req.query, ['due_date', 'created_at', 'paid_date']),
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
    const payment = await RentPayment.findByPk(req.params.id, {
      include: [
        { model: Tenant, as: 'tenant', include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email', 'phone'] }] },
        { model: Hostel, as: 'hostel', attributes: ['id', 'name', 'address', 'city', 'state', 'pincode', 'contact_phone', 'contact_email'] },
        { model: Room, as: 'room', attributes: ['id', 'room_number'] },
      ],
    });
    if (!payment) return error(res, 'Payment not found', 404);

    const ownership = await assertTenantOwnsRecord(req, res, payment.tenant_id);
    if (ownership.forbidden) return ownership.response;

    return success(res, payment);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.body.tenant_id);
    if (!tenant) return error(res, 'Tenant not found', 404);

    const total = parseFloat(req.body.amount || 0)
      + parseFloat(req.body.penalty_amount || 0)
      - parseFloat(req.body.discount_amount || 0);

    const payment = await RentPayment.create({
      ...req.body,
      hostel_id: tenant.hostel_id,
      room_id: tenant.room_id,
      total_amount: total,
      receipt_number: generateReceiptNumber(),
      invoice_number: generateInvoiceNumber(),
      status: 'pending',
    });

    return created(res, payment, 'Rent invoice created');
  } catch (err) {
    next(err);
  }
};

exports.collectPayment = async (req, res, next) => {
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();
  try {
    const payment = await RentPayment.findByPk(req.params.id, { transaction: t });
    if (!payment) {
      await t.rollback();
      return error(res, 'Payment not found', 404);
    }

    const paidAmount = parseFloat(req.body.paid_amount);
    const newPaidTotal = parseFloat(payment.paid_amount) + paidAmount;
    const totalAmount = parseFloat(payment.total_amount);

    let status = 'partial';
    if (newPaidTotal >= totalAmount) status = 'paid';
    else if (newPaidTotal === 0) status = 'pending';

    await payment.update({
      paid_amount: newPaidTotal,
      paid_date: req.body.paid_date || dayjs().format('YYYY-MM-DD'),
      payment_method: req.body.payment_method,
      payment_reference: req.body.payment_reference,
      status,
      collected_by: req.user.id,
    }, { transaction: t });

    await FinanceTransaction.create({
      hostel_id: payment.hostel_id,
      type: 'income',
      category: 'rent',
      amount: paidAmount,
      reference_id: payment.id,
      reference_type: 'rent_payment',
      transaction_date: dayjs().format('YYYY-MM-DD'),
      description: `Rent payment - ${payment.month_year}`,
      created_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    return success(res, payment, 'Payment collected successfully');
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.getPending = async (req, res, next) => {
  try {
    const where = { status: { [Op.in]: ['pending', 'partial', 'overdue'] } };
    if (req.query.hostelId) where.hostel_id = req.query.hostelId;

    const payments = await RentPayment.findAll({
      where,
      include: [{ model: Tenant, as: 'tenant', include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'phone'] }] }],
      order: [['due_date', 'ASC']],
    });

    return success(res, payments);
  } catch (err) {
    next(err);
  }
};
