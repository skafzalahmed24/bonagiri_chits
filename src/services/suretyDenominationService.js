const { Surety, CashDenomination, Enrollment, Member, ChitsGroup, PaymentAccount } = require('../models');
const { Op } = require('sequelize');

const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));

// ---------------------------------------------------------------- Sureties

const SURETY_FIELDS = [
  'name', 'relation', 'father_name', 'mobile_number', 'address', 'occupation',
  'monthly_income', 'id_proof_type', 'id_proof_number', 'remarks',
];

const suretyRow = (s) => {
  const e = s.enrollment;
  return {
    id: s.id,
    enrollment_id: s.enrollment_id,
    ...Object.fromEntries(SURETY_FIELDS.map((f) => [f, s[f] ?? null])),
    monthly_income: s.monthly_income != null ? round2(s.monthly_income) : null,
    member_name: e && e.subscriber ? e.subscriber.name : '',
    member_code: e && e.subscriber ? e.subscriber.member_id : '',
    group_name: e && e.group ? e.group.group_name : '',
    ticket_number: e ? e.group_position_number : null,
    created_at: s.createdAt,
  };
};

const enrollmentInclude = {
  model: Enrollment,
  as: 'enrollment',
  attributes: ['id', 'group_id', 'group_position_number', 'subscriber_id'],
  include: [
    { model: Member, as: 'subscriber', attributes: ['id', 'name', 'member_id'] },
    { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name'] },
  ],
};

async function listSureties({ company_id, enrollment_id, group_id }) {
  const where = { company_id, is_deleted_status: 0 };
  if (enrollment_id) where.enrollment_id = enrollment_id;
  const include = [{ ...enrollmentInclude, ...(group_id ? { where: { group_id }, required: true } : {}) }];
  const rows = await Surety.findAll({ where, include, order: [['createdAt', 'DESC']] });
  return { count: rows.length, rows: rows.map(suretyRow) };
}

async function saveSurety({ company_id, data }) {
  if (!data.name || !String(data.name).trim()) throw new Error('Surety name is required');

  // The ticket must belong to this company — never trust an id from the body.
  const enrollment = await Enrollment.findOne({ where: { id: data.enrollment_id, company_id, delete_status: 0 } });
  if (!enrollment) throw new Error('Ticket not found');

  const patch = Object.fromEntries(SURETY_FIELDS.map((f) => [f, data[f] === '' ? null : data[f] ?? null]));
  patch.name = String(data.name).trim();

  let surety;
  if (data.id) {
    surety = await Surety.findOne({ where: { id: data.id, company_id, is_deleted_status: 0 } });
    if (!surety) throw new Error('Surety not found');
    await surety.update({ ...patch, enrollment_id: enrollment.id });
  } else {
    surety = await Surety.create({ ...patch, company_id, enrollment_id: enrollment.id });
  }
  const fresh = await Surety.findByPk(surety.id, { include: [enrollmentInclude] });
  return suretyRow(fresh);
}

async function deleteSurety({ company_id, id }) {
  const surety = await Surety.findOne({ where: { id, company_id, is_deleted_status: 0 } });
  if (!surety) throw new Error('Surety not found');
  await surety.update({ is_deleted_status: 1 }); // soft delete: guarantor history is evidence
  return { id: surety.id };
}

// ----------------------------------------------------------- Denominations

const NOTES = [500, 200, 100, 50, 20, 10];

const denominationTotal = (d) =>
  round2(NOTES.reduce((s, n) => s + (parseInt(d[`notes_${n}`], 10) || 0) * n, 0) + (parseFloat(d.coins_amount) || 0));

async function cashInBooks(company_id) {
  const accounts = await PaymentAccount.findAll({
    where: { company_id, account_type: 'CASH', is_active: true },
    attributes: ['id', 'name', 'current_balance'],
  });
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balance: round2(a.current_balance) })),
    total: round2(accounts.reduce((s, a) => s + (parseFloat(a.current_balance) || 0), 0)),
  };
}

async function getDenomination({ company_id, count_date }) {
  const row = await CashDenomination.findOne({ where: { company_id, count_date } });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  // Books can only be compared for today: account balances are current, not historical.
  const books = count_date === today ? await cashInBooks(company_id) : null;
  return {
    count_date,
    count: row ? row.toJSON() : null,
    cash_in_books: books,
  };
}

async function saveDenomination({ company_id, data, counted_by }) {
  if (!data.count_date) throw new Error('Count date is required');
  const values = { remarks: data.remarks || null, counted_by: counted_by || null };
  for (const n of NOTES) {
    const c = parseInt(data[`notes_${n}`], 10) || 0;
    if (c < 0) throw new Error(`Count of ₹${n} notes cannot be negative`);
    values[`notes_${n}`] = c;
  }
  values.coins_amount = Math.max(0, parseFloat(data.coins_amount) || 0);
  values.total_amount = denominationTotal(values);

  const existing = await CashDenomination.findOne({ where: { company_id, count_date: data.count_date } });
  if (existing) await existing.update(values);
  else await CashDenomination.create({ ...values, company_id, count_date: data.count_date });
  return getDenomination({ company_id, count_date: data.count_date });
}

module.exports = {
  listSureties, saveSurety, deleteSurety,
  getDenomination, saveDenomination, denominationTotal, NOTES,
};
