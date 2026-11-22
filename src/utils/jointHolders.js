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
const { Enrollment, EnrollmentJointHolder, Auction, Member, ChitsInstallment, CustomerPayment, CollectionAgentAmount } = require('../models');

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

/**
 * What each holder of a JOINT ticket still owes, for the Member Receipt screen and the outstanding reports
 * (tester sheet rows 27 / 34 / 37). Returns { [enrollmentId]: [{ member_id, name, share_percent, due_amount }] }
 * (label A, B, … in holder order) and only has an entry for tickets with more than one active holder.
 *
 * Same rule the apps use (userService.js): a holder owes `share` of every instalment due by `asOn`; a verified
 * receipt that names its payer (office receipt `payer_member_id`, or the member who submitted it to a collection
 * agent) counts in full for that holder only; a receipt with no named payer counts for each holder by share.
 */
const holderDuesByEnrollment = async (enrollmentIds, asOn) => {
  const ids = [...new Set((enrollmentIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const enrollments = await Enrollment.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'subscriber_id', 'main_holder_share'],
    include: [
      { model: Member, as: 'subscriber', attributes: ['id', 'name'] },
      {
        model: EnrollmentJointHolder, as: 'joint_holders', required: false, where: { removed_on: null },
        attributes: ['id', 'member_id', 'share_percent'], include: [{ model: Member, as: 'member', attributes: ['id', 'name'] }]
      }
    ]
  });
  const jointOnly = enrollments.filter((e) => (e.joint_holders || []).some((j) => j.member));
  if (!jointOnly.length) return {};

  const installments = await ChitsInstallment.findAll({
    where: { enrollment_id: { [Op.in]: jointOnly.map((e) => e.id) }, payable_amount: { [Op.gt]: 0 }, due_date: { [Op.lte]: asOn } },
    attributes: ['id', 'enrollment_id', 'payable_amount'],
  });
  const payments = installments.length
    ? await CustomerPayment.findAll({
        where: { chits_installment_id: { [Op.in]: installments.map((i) => i.id) }, payment_status: 1 },
        attributes: ['chits_installment_id', 'received_amount', 'payer_member_id'],
        include: [{ model: CollectionAgentAmount, as: 'collection_submission', attributes: ['member_id'], required: false }],
      })
    : [];
  const paymentsByInst = new Map();
  payments.forEach((p) => {
    if (!paymentsByInst.has(p.chits_installment_id)) paymentsByInst.set(p.chits_installment_id, []);
    paymentsByInst.get(p.chits_installment_id).push(p);
  });
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  const out = {};
  jointOnly.forEach((e) => {
    const joint = (e.joint_holders || []).filter((j) => j.member);
    const jointTotal = joint.reduce((s, j) => s + (parseFloat(j.share_percent) || 0), 0);
    const mainShare = parseFloat(e.main_holder_share) || Math.max(0, 100 - jointTotal);
    const holders = [
      { member_id: Number(e.subscriber_id), name: e.subscriber && e.subscriber.name, share: mainShare },
      ...joint.map((j) => ({ member_id: Number(j.member.id), name: j.member.name, share: parseFloat(j.share_percent) || 0 })),
    ].map((h) => ({ ...h, due: 0 }));

    installments.filter((i) => i.enrollment_id === e.id).forEach((i) => {
      const payable = parseFloat(i.payable_amount) || 0;
      const pays = paymentsByInst.get(i.id) || [];
      holders.forEach((h) => {
        const ratio = h.share / 100;
        let paid = 0;
        pays.forEach((p) => {
          const amt = parseFloat(p.received_amount) || 0;
          const payer = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
          if (payer == null) paid += amt * ratio; // no named payer: counted by share
          else if (payer === h.member_id) paid += amt; // named payer: all of it is this holder's
        });
        h.due += Math.max(0, payable * ratio - paid);
      });
    });
    // `label` is the holder's letter on the ticket (A = main holder), kept even when a paid holder is left out later.
    out[e.id] = holders.map((h, i) => ({ label: String.fromCharCode(65 + i), member_id: h.member_id, name: h.name, share_percent: h.share, due_amount: round2(h.due) }));
  });
  return out;
};

module.exports = { ticketHolderIds, memberTicketsInGroup, ticketWin, isTicketPrized, prizedTicketIds, holderNamesByEnrollment, holderMembersOf, holderDuesByEnrollment };
