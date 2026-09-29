/**
 * One-off: fill in the end date of chit groups whose stored end date is wrong.
 *
 * The group form used to send today's date as the end date, so groups created through it have
 * chit_end_date = the day they were created. The end date is now derived when a group is saved
 * (the due date of the last instalment); this brings the existing groups in line.
 *
 * Only groups whose end date is empty or not after their start date are touched: those cannot be right.
 * Dry run by default (lists what would change). Pass --apply to write.
 *
 *   node src/scripts/backfillGroupEndDates.js          # list
 *   node src/scripts/backfillGroupEndDates.js --apply  # write
 */
require('dotenv').config({ quiet: true });
const { ChitsGroup, sequelize } = require('../models');
const { lastInstalmentDate } = require('../utils/schemeHelpers');
const { toDateStr } = require('../utils/penalty');

(async () => {
  const apply = process.argv.includes('--apply');
  try {
    const groups = await ChitsGroup.findAll({ where: { is_deleted_status: 0 } });
    const changes = [];
    for (const g of groups) {
      const start = toDateStr(g.commencement_date || g.chit_start_date);
      const current = toDateStr(g.chit_end_date);
      if (!start || (current && current > start)) continue;
      const next = lastInstalmentDate(start, g.no_of_installments, g.due_date_number_count);
      if (next && next !== current) changes.push({ group: g, name: g.group_name, start, instalments: g.no_of_installments, from: current, to: next });
    }
    console.table(changes.map(({ name, start, instalments, from, to }) => ({ name, start, instalments, from, to })));
    if (!changes.length) console.log('Nothing to change.');
    else if (!apply) console.log(`${changes.length} group(s) would change. Run with --apply to write.`);
    else {
      for (const c of changes) await c.group.update({ chit_end_date: c.to });
      console.log(`Updated ${changes.length} group(s).`);
    }
  } finally {
    await sequelize.close();
  }
})();
