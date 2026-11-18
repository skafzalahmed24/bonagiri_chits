'use strict';

/**
 * One-off repair (tester sheet, 2026-11-17 / 2026-11-18).
 *
 * Fixed chit with the Withdrawn / Not Withdrawn template (scheme type 62): when one member held several tickets
 * and each ticket won a different auction, the auction save adjusted the member's FIRST ticket for every win.
 * So the other winning tickets stayed on the Not Withdrawn amounts, and the first ticket was switched to the
 * Withdrawn amounts from the wrong month (a win by one of the member's other tickets). The save is fixed now
 * (it uses the winning ticket's enrollment); this script puts the instalments of every ticket in such groups back
 * to what the template says:
 *   - a ticket that won auction W: months W and later = Withdrawn amount, earlier months = Not Withdrawn amount;
 *   - a ticket that never won: every month = Not Withdrawn amount.
 *
 * Only scheme type 62. Instalments that already have a payment are never touched (same rule as the auction save),
 * so a month someone has already paid stays as it was and is listed as "paid, differs" for a manual look.
 * It sets absolute amounts, so running it twice is harmless. Type 63 (adding) is NOT handled: that adjustment
 * adds to the amount, so an automatic repair could double it; check those by hand.
 *
 * Dry run by default; nothing is written without --apply.
 *
 *   node src/scripts/repairWithdrawnMultiTicketInstalments.js
 *   node src/scripts/repairWithdrawnMultiTicketInstalments.js --apply
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { Auction, ChitsGroup, Enrollment, ChitsInstallment, FixedSchemeChitsConfiguration, sequelize } = require('../models');

const PAID_INSTALLMENT_SUBQUERY = '(SELECT chits_installment_id FROM customer_payments WHERE payment_status = 1 AND chits_installment_id IS NOT NULL)';

function priceRows(config) {
  if (!config.prices) return [];
  return typeof config.prices === 'string' ? JSON.parse(config.prices) : config.prices;
}

/** Work out every instalment that differs from the template. Reads only. */
async function findDifferences(groupWhere = {}) {
  const groups = await ChitsGroup.findAll({
    where: { scheme_configuration_id: { [Op.ne]: null }, ...groupWhere },
    attributes: ['id', 'group_name', 'scheme_configuration_id'],
    order: [['id', 'ASC']]
  });
  const fixes = [];
  const paidDiffers = [];
  for (const group of groups) {
    const config = await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id);
    if (!config || config.scheme_type !== 62) continue;
    const prices = priceRows(config);
    const auctions = await Auction.findAll({ where: { group_id: group.id }, attributes: ['auction_number', 'ticket_number', 'bidder_id'] });
    const enrollments = await Enrollment.findAll({ where: { group_id: group.id, delete_status: 0 } });
    for (const enrollment of enrollments) {
      // The auction this ticket won (a ticket wins once). Old auctions without a ticket number match by member only
      // when the member holds a single ticket, so that is never ambiguous.
      const memberTickets = enrollments.filter((e) => e.subscriber_id === enrollment.subscriber_id).length;
      const won = auctions.find((a) => (a.ticket_number != null
        ? Number(a.ticket_number) === Number(enrollment.group_position_number)
        : memberTickets === 1 && a.bidder_id === enrollment.subscriber_id));
      const winMonth = won ? Number(won.auction_number) : null;
      const instalments = await ChitsInstallment.findAll({
        where: { enrollment_id: enrollment.id },
        attributes: { include: [[sequelize.literal(`("ChitsInstallment"."id" IN ${PAID_INSTALLMENT_SUBQUERY})`), 'is_paid']] },
        order: [['installment_no', 'ASC']]
      });
      for (const inst of instalments) {
        const row = prices[inst.installment_no - 1];
        if (!row || row.not_withdrawn == null) continue;
        const withdrawnNow = winMonth != null && inst.installment_no >= winMonth && row.withdrawn != null;
        const expected = Number(withdrawnNow ? row.withdrawn : row.not_withdrawn);
        if (Number(inst.payable_amount) === expected) continue;
        const item = { group, enrollment, inst, from: Number(inst.payable_amount), to: expected, winMonth };
        if (inst.get('is_paid')) paidDiffers.push(item); else fixes.push(item);
      }
    }
  }
  return { fixes, paidDiffers };
}

const describe = (t) => ` - ${t.group.group_name} ticket ${t.enrollment.group_position_number} month ${t.inst.installment_no}: ${t.from} -> ${t.to}` +
  (t.winMonth != null ? ` (won auction #${t.winMonth})` : ' (has not won)');

async function repair({ apply = false, groupWhere = {}, log = console.log } = {}) {
  const { fixes, paidDiffers } = await findDifferences(groupWhere);
  log(`${fixes.length} unpaid instalment(s) differ from the template.`);
  fixes.forEach((t) => log(describe(t)));
  if (paidDiffers.length) {
    log(`${paidDiffers.length} instalment(s) differ but already have a payment (NOT changed, check by hand):`);
    paidDiffers.forEach((t) => log(describe(t)));
  }
  if (!apply) {
    log('Dry run: nothing written. Run with --apply to repair.');
    return { fixes, paidDiffers, applied: 0 };
  }
  let applied = 0;
  for (const t of fixes) {
    await ChitsInstallment.update({ payable_amount: t.to }, { where: { id: t.inst.id } });
    applied += 1;
  }
  log(`Done. ${applied} instalment(s) updated.`);
  return { fixes, paidDiffers, applied };
}

module.exports = { repair, findDifferences };

if (require.main === module) {
  repair({ apply: process.argv.includes('--apply') })
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
