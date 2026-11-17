'use strict';

/**
 * One-off repair (tester sheet, 2026-11-17).
 *
 * Fixed chit with the Withdrawn / Not Withdrawn template: when one member held several tickets and each ticket
 * won a different auction, the auction save switched only the member's FIRST ticket to the Withdrawn amounts;
 * the other winning tickets kept the Not Withdrawn amounts. The save is fixed now (it uses the winning ticket's
 * enrollment); this script applies the Withdrawn amounts to the tickets that were missed.
 *
 * Only scheme type 62 (Withdrawn / Not Withdrawn). It sets absolute amounts, so running it twice is harmless.
 * It never touches an instalment that already has a payment (same rule as the save). Types 63 (adding) is NOT
 * handled here: that adjustment adds to the amount, so an automatic repair could double it; check those by hand.
 *
 * Dry run by default; nothing is written without --apply.
 *
 *   node src/scripts/repairWithdrawnMultiTicketInstalments.js
 *   node src/scripts/repairWithdrawnMultiTicketInstalments.js --apply
 */
require('dotenv').config();
const { Auction, ChitsGroup, Enrollment, ChitsInstallment, FixedSchemeChitsConfiguration, sequelize } = require('../models');
const { applyWinnerSchemeAdjustments } = require('../utils/schemeHelpers');

function priceRows(config) {
  if (!config.prices) return [];
  return typeof config.prices === 'string' ? JSON.parse(config.prices) : config.prices;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const auctions = await Auction.findAll({
    where: {},
    include: [{ model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'scheme_configuration_id'], required: true }],
    order: [['group_id', 'ASC'], ['auction_number', 'ASC']]
  });

  const todo = [];
  for (const a of auctions) {
    if (!a.group?.scheme_configuration_id || a.ticket_number == null) continue;
    const config = await FixedSchemeChitsConfiguration.findByPk(a.group.scheme_configuration_id);
    if (!config || config.scheme_type !== 62) continue;
    const enrollment = await Enrollment.findOne({
      where: { group_id: a.group_id, subscriber_id: a.bidder_id, group_position_number: a.ticket_number, delete_status: 0 }
    });
    if (!enrollment) continue;
    const winRow = priceRows(config)[a.auction_number - 1];
    if (winRow?.withdrawn == null) continue;
    const inst = await ChitsInstallment.findOne({ where: { enrollment_id: enrollment.id, installment_no: a.auction_number } });
    if (!inst) continue;
    if (Number(inst.payable_amount) !== Number(winRow.withdrawn)) {
      todo.push({ auction: a, config, enrollment, from: Number(inst.payable_amount), to: Number(winRow.withdrawn) });
    }
  }

  console.log(`${todo.length} winning ticket(s) still on the Not Withdrawn amounts.`);
  for (const t of todo) {
    console.log(` - ${t.auction.group.group_name} auction #${t.auction.auction_number} ticket ${t.auction.ticket_number}: month ${t.auction.auction_number} instalment ${t.from} -> ${t.to}`);
  }
  if (!apply) {
    console.log('Dry run: nothing written. Run with --apply to repair.');
    return;
  }

  for (const t of todo) {
    const transaction = await sequelize.transaction();
    try {
      await applyWinnerSchemeAdjustments(t.auction.toJSON(), t.config, t.enrollment.id, transaction);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      console.error(`Failed for auction ${t.auction.id}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log('Done.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => sequelize.close());
