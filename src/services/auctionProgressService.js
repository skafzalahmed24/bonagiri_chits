// Auction Progress (tester sheet row 36): one row per chit group with how many auctions are recorded,
// how many remain and how many are overdue. Read only; the company comes from the caller's token.
//
// Rules agreed with the tester (2026-11-22):
//   - Running groups are listed; Completed groups only while they still have unrecorded auctions;
//     Upcoming groups (not started yet) are never listed.
//   - An auction is Overdue when its scheduled date has passed and nothing is recorded for that month.
//   - A company month (company_chit_number / self chits as company months) is never auctioned, so it is
//     not counted as owed, unless an auction row exists for it anyway.
const { Op } = require('sequelize');
const { ChitsGroup, Auction } = require('../models');
const SystemSettingsService = require('./systemSettingsService');
const { lastInstalmentDate, getGroupCompanySeats } = require('../utils/schemeHelpers');

const toDateStr = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

/** Scheduled date of auction month `n` (1-based): the group's due day in start month + n - 1. */
const scheduledDate = (group, n) =>
  lastInstalmentDate(toDateStr(group.commencement_date || group.chit_start_date), n, group.due_date_number_count);

/**
 * @param {{ companyId: string, groupId?: string, search?: string }} p
 * @returns {Promise<{ rows: object[], total: number }>}
 */
async function getAuctionProgress({ companyId, groupId, search }) {
  const today = toDateStr(await SystemSettingsService.getBusinessDate());

  const where = {
    company_id: companyId,
    is_deleted_status: 0,
    ...(groupId ? { id: groupId } : {}),
    ...(search ? { group_name: { [Op.iLike]: `%${search}%` } } : {}),
  };
  const groups = await ChitsGroup.findAll({
    where,
    attributes: ['id', 'group_name', 'chits_group_status', 'commencement_date', 'chit_start_date', 'chit_end_date',
      'no_of_installments', 'due_date_number_count', 'company_chit_number', 'self_chits_as_company_months'],
    order: [['group_name', 'ASC']],
  });
  if (groups.length === 0) return { rows: [], total: 0 };

  const auctions = await Auction.findAll({
    where: { company_id: companyId, group_id: { [Op.in]: groups.map((g) => g.id) } },
    attributes: ['group_id', 'auction_number'],
    raw: true,
  });
  const recordedByGroup = new Map();
  for (const a of auctions) {
    if (!recordedByGroup.has(a.group_id)) recordedByGroup.set(a.group_id, new Set());
    if (a.auction_number != null) recordedByGroup.get(a.group_id).add(Number(a.auction_number));
  }

  const rows = [];
  for (const g of groups) {
    const start = toDateStr(g.commencement_date || g.chit_start_date);
    const status = Number(g.chits_group_status);
    // Upcoming: not started yet. The status is only refreshed on save, so a start date that has arrived counts as started.
    if (status !== 2 && (!start || start > today)) continue;

    const totalMonths = parseInt(g.no_of_installments, 10) || 0;
    const recorded = recordedByGroup.get(g.id) || new Set();
    const seats = await getGroupCompanySeats(g);
    // Months that must be auctioned: every month except a company month nobody recorded.
    const owed = [];
    for (let n = 1; n <= totalMonths; n += 1) {
      if (seats.includes(n) && !recorded.has(n)) continue;
      owed.push(n);
    }
    const completed = owed.filter((n) => recorded.has(n)).length;
    const remaining = owed.length - completed;
    const overdue = owed.filter((n) => {
      if (recorded.has(n)) return false;
      const due = scheduledDate(g, n);
      return !!due && due < today;
    }).length;

    // A Completed group drops off once every auction is recorded.
    if (status === 2 && remaining === 0) continue;

    rows.push({
      group_id: g.id,
      group_name: g.group_name,
      chit_start_date: start,
      chit_end_date: toDateStr(g.chit_end_date) || lastInstalmentDate(start, totalMonths, g.due_date_number_count),
      group_status: status === 2 ? 'completed' : 'running',
      total_auctions: owed.length,
      completed_auctions: completed,
      remaining_auctions: remaining,
      overdue_auctions: overdue,
    });
  }
  return { rows, total: rows.length };
}

module.exports = { getAuctionProgress, scheduledDate };
