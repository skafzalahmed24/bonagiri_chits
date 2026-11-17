'use strict';

/**
 * One-off repair (tester sheet, Recent Feedback row 15, 2026-11-17).
 *
 * Fixed-chit auctions recorded before the fix have an empty `bid_payable`, so Bid Payment shows them as
 * "fully paid" with 0 payable. New auctions now store `bid_payable` = the winning amount. This script gives
 * the old ones the same value (their `bid_amount`, which for a fixed chit is the winning amount of the month)
 * and recomputes the prize totals (net payable, status) from the payments already made.
 *
 * Only rows where bid_payable is NULL or 0 are touched. Dry run by default; nothing is written without --apply.
 *
 *   node src/scripts/repairFixedChitBidPayable.js           (list what would change)
 *   node src/scripts/repairFixedChitBidPayable.js --apply   (write it)
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { Auction, ChitsGroup, sequelize } = require('../models');
const { recalcPrizeTotals } = require('../services/prizePaymentService');

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await Auction.findAll({
    where: {
      [Op.or]: [{ bid_payable: null }, { bid_payable: 0 }],
      bid_amount: { [Op.gt]: 0 }
    },
    include: [{ model: ChitsGroup, as: 'group', attributes: ['group_name', 'scheme_configuration_id'], required: true, where: { scheme_configuration_id: { [Op.ne]: null } } }],
    order: [['group_id', 'ASC'], ['auction_number', 'ASC']]
  });

  console.log(`${rows.length} fixed-chit auction(s) with no payable amount.`);
  for (const a of rows) {
    console.log(` - ${a.group?.group_name} #${a.auction_number} ticket ${a.ticket_number}: payable ${a.bid_payable ?? 'empty'} -> ${a.bid_amount}`);
  }
  if (!apply) {
    console.log('Dry run: nothing written. Run with --apply to repair.');
    return;
  }

  for (const a of rows) {
    const transaction = await sequelize.transaction();
    try {
      await a.update({ bid_payable: a.bid_amount }, { transaction });
      await recalcPrizeTotals(a.id, transaction);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      console.error(`Failed for auction ${a.id}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log('Done.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => sequelize.close());
