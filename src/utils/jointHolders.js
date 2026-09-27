/**
 * Joint enrollment helpers: a ticket (Enrollment) is held by its main holder
 * (subscriber_id) plus any active rows in enrollment_joint_holders.
 *
 * Prize status belongs to the ticket, not to one member. Auctions record the winning
 * ticket's number (ticket_number) from now on; older auctions only recorded the
 * winning member (bidder_id), so for those a ticket counts as prized when its winner
 * is any of its holders.
 */
const { Op } = require('sequelize');
const { Enrollment, EnrollmentJointHolder, Auction, Member } = require('../models');

/** Member ids of everyone holding the ticket, main holder first. */
const ticketHolderIds = async (enrollment, { transaction } = {}) => {
  const joint = await EnrollmentJointHolder.findAll({
    where: { enrollment_id: enrollment.id, removed_on: null },
    attributes: ['member_id'],
    transaction
  });
  return [Number(enrollment.subscriber_id), ...joint.map((j) => Number(j.member_id))].filter((id) => !Number.isNaN(id));
};

/** The member's live tickets in a group, whether they hold them as main or joint holder. */
const memberTicketsInGroup = async (groupId, memberId, { transaction } = {}) => {
  const joint = await EnrollmentJointHolder.findAll({
    where: { member_id: memberId, removed_on: null },
    attributes: ['enrollment_id'],
    transaction
  });
  const jointIds = joint.map((j) => j.enrollment_id);
  return Enrollment.findAll({
    where: {
      group_id: groupId,
      delete_status: 0,
      [Op.or]: [{ subscriber_id: memberId }, ...(jointIds.length ? [{ id: { [Op.in]: jointIds } }] : [])]
    },
    order: [['group_position_number', 'ASC']],
    transaction
  });
};

/** The auction this ticket won, or null. */
const ticketWin = async (enrollment, { transaction } = {}) => {
  const holders = await ticketHolderIds(enrollment, { transaction });
  return Auction.findOne({
    where: {
      group_id: enrollment.group_id,
      [Op.or]: [
        { ticket_number: enrollment.group_position_number },
        { ticket_number: null, bidder_id: { [Op.in]: holders } }
      ]
    },
    transaction
  });
};

/** Is the ticket prized (has it won an auction)? */
const isTicketPrized = async (enrollment, opts = {}) => !!(await ticketWin(enrollment, opts));

/**
 * Batch form of isTicketPrized for reports: the Set of enrollment ids (from the list
 * given — each needs id, group_id, subscriber_id, group_position_number) that are prized.
 */
const prizedTicketIds = async (enrollments) => {
  const list = (enrollments || []).filter(Boolean);
  if (!list.length) return new Set();
  const groupIds = [...new Set(list.map((e) => e.group_id))];
  const [auctions, joint] = await Promise.all([
    Auction.findAll({ where: { group_id: { [Op.in]: groupIds } }, attributes: ['group_id', 'bidder_id', 'ticket_number'] }),
    EnrollmentJointHolder.findAll({ where: { enrollment_id: { [Op.in]: list.map((e) => e.id) }, removed_on: null }, attributes: ['enrollment_id', 'member_id'] })
  ]);
  const holders = {};
  list.forEach((e) => { holders[e.id] = new Set([Number(e.subscriber_id)]); });
  joint.forEach((j) => holders[j.enrollment_id] && holders[j.enrollment_id].add(Number(j.member_id)));
  const out = new Set();
  list.forEach((e) => {
    const won = auctions.some((a) => a.group_id === e.group_id && (a.ticket_number != null
      ? Number(a.ticket_number) === Number(e.group_position_number)
      : a.bidder_id != null && holders[e.id].has(Number(a.bidder_id))));
    if (won) out.add(e.id);
  });
  return out;
};

/** { [enrollmentId]: 'Main & Joint & …' } for display on receipts, notices and registers. */
const holderNamesByEnrollment = async (enrollmentIds) => {
  const ids = [...new Set((enrollmentIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const rows = await Enrollment.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id'],
    include: [
      { model: Member, as: 'subscriber', attributes: ['name'] },
      {
        model: EnrollmentJointHolder, as: 'joint_holders', required: false, where: { removed_on: null },
        attributes: ['id'], include: [{ model: Member, as: 'member', attributes: ['name'] }]
      }
    ]
  });
  const out = {};
  rows.forEach((e) => {
    const names = [e.subscriber && e.subscriber.name, ...(e.joint_holders || []).map((j) => j.member && j.member.name)].filter(Boolean);
    out[e.id] = names.join(' & ');
  });
  return out;
};

/** Every holder Member (with fcm_token) of the given tickets, de-duplicated — for notifications. */
const holderMembersOf = async (enrollmentIds, { transaction } = {}) => {
  const ids = [...new Set((enrollmentIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await Enrollment.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id'],
    include: [
      { model: Member, as: 'subscriber' },
      { model: EnrollmentJointHolder, as: 'joint_holders', required: false, where: { removed_on: null }, include: [{ model: Member, as: 'member' }] }
    ],
    transaction
  });
  const byId = new Map();
  rows.forEach((e) => {
    [e.subscriber, ...(e.joint_holders || []).map((j) => j.member)].forEach((m) => {
      if (m && Number(m.is_deleted_status) === 0 && !byId.has(m.id)) byId.set(m.id, m);
    });
  });
  return [...byId.values()];
};

module.exports = { ticketHolderIds, memberTicketsInGroup, ticketWin, isTicketPrized, prizedTicketIds, holderNamesByEnrollment, holderMembersOf };
