'use strict';

/**
 * Tester sheet 2026-11-17: fixed chit with the Withdrawn / Not Withdrawn template (scheme type 62).
 * One member holds three tickets and each ticket wins a separate auction. Every winning ticket's instalments
 * must switch to the Withdrawn amounts; the tickets that have not won stay on Not Withdrawn.
 *
 * Creates throw-away rows (scheme, group, members' enrollments, instalments, auctions) and removes them at the end.
 *   node src/scripts/testFixedChitMultiTicketWithdrawn.js
 */
require('dotenv').config();
const assert = require('assert');
const adminService = require('../services/adminService');
const { repair } = require('./repairWithdrawnMultiTicketInstalments');
const { FixedSchemeChitsConfiguration, ChitsGroup, Enrollment, Auction, Member, ChitsInstallment, sequelize } = require('../models');

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = function (code) { this.statusCode = code; return this; };
  res.json = function (data) { this.body = data; return this; };
  return res;
};

const NOT_WITHDRAWN = 10000;
const WITHDRAWN = [10500, 10600, 10700, 10800];

async function run() {
  const members = await Member.findAll({ limit: 2 });
  if (members.length < 2) { console.log('Need 2 members in the database; skipping.'); return; }
  const [multi, other] = members;
  const companyId = multi.company_id;
  const created = { scheme: null, group: null, enrollments: [] };

  try {
    const scheme = await FixedSchemeChitsConfiguration.create({
      title: 'Test 62 multi-ticket', company_id: companyId, months_count: 4, members_count: 4, scheme_type: 62,
      prices: JSON.stringify(WITHDRAWN.map((w, i) => ({ month: i + 1, not_withdrawn: NOT_WITHDRAWN, withdrawn: w, chit_amount: 200000 }))),
      status: 1
    });
    created.scheme = scheme.id;
    const group = await ChitsGroup.create({
      group_name: 'Test multi-ticket 62', scheme_configuration_id: scheme.id, company_id: companyId, chit_series_term: 1,
      auction_type: 2, chit_amount: 200000, no_of_installments: 4, installment_amount: NOT_WITHDRAWN, chits_group_status: 1, is_deleted_status: 0
    });
    created.group = group.id;

    // Tickets 10, 11, 12 belong to the same member (the tester's "Ram"); ticket 13 to another member.
    const tickets = [[multi, 10], [multi, 11], [multi, 12], [other, 13]];
    const enrollmentByTicket = {};
    for (const [member, pos] of tickets) {
      const e = await Enrollment.create({ group_id: group.id, subscriber_id: member.id, company_id: companyId, group_position_number: pos, delete_status: 0 });
      created.enrollments.push(e.id);
      enrollmentByTicket[pos] = e.id;
      for (let m = 1; m <= 4; m++) {
        await ChitsInstallment.create({ enrollment_id: e.id, group_id: group.id, type: 1, installment_no: m, due_date: `2026-0${m}-15`, payable_amount: NOT_WITHDRAWN });
      }
    }

    // The three tickets of the same member win one auction each, and the FIRST enrollment (ticket 10) wins last.
    const wins = [[1, 12], [2, 11], [3, 10]];
    for (const [auctionNumber, ticket] of wins) {
      const res = mockRes();
      await adminService.storeOrUpdateAuctionService(res, {
        group_id: group.id, bidder_id: multi.id, ticket_number: ticket, auction_number: auctionNumber,
        auction_date: `2026-0${auctionNumber}-15`, bid_amount: 180000
      }, { role: 'company', id: companyId });
      assert.ok(res.statusCode < 300, `auction ${auctionNumber} save failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
    }
    const saved = await Auction.findAll({ where: { group_id: group.id }, order: [['auction_number', 'ASC']] });
    assert.strictEqual(saved.length, 3, 'three auctions saved');

    const payable = async (ticket, month) =>
      Number((await ChitsInstallment.findOne({ where: { enrollment_id: enrollmentByTicket[ticket], installment_no: month } })).payable_amount);

    // Winning month and every later month are Withdrawn for the winning ticket; earlier months stay Not Withdrawn.
    const expectedFor = (ticket, m) => {
      const win = wins.find(([, t]) => t === ticket);
      return win && m >= win[0] ? WITHDRAWN[m - 1] : NOT_WITHDRAWN;
    };
    const checkAll = async (label) => {
      for (const ticket of [10, 11, 12, 13]) {
        for (let m = 1; m <= 4; m++) {
          assert.strictEqual(await payable(ticket, m), expectedFor(ticket, m), `${label}: ticket ${ticket} month ${m}: expected ${expectedFor(ticket, m)}`);
        }
      }
      console.log(`ok ${label}: every ticket matches the template (winners Withdrawn from their win month, others Not Withdrawn)`);
    };
    await checkAll('after saving the three auctions');

    // The state the OLD code left behind: every win applied to the first ticket (10) -> Withdrawn from month 1,
    // tickets 11 and 12 never switched. The repair must put every ticket back to the template.
    for (let m = 1; m <= 4; m++) {
      await ChitsInstallment.update({ payable_amount: WITHDRAWN[m - 1] }, { where: { enrollment_id: enrollmentByTicket[10], installment_no: m } });
      await ChitsInstallment.update({ payable_amount: NOT_WITHDRAWN }, { where: { enrollment_id: [enrollmentByTicket[11], enrollmentByTicket[12]], installment_no: m } });
    }
    const quiet = () => {};
    const dry = await repair({ apply: false, groupWhere: { id: group.id }, log: quiet });
    assert.ok(dry.fixes.length > 0, 'dry run must list the wrong instalments');
    assert.strictEqual(await payable(10, 1), WITHDRAWN[0], 'dry run must not write');
    await repair({ apply: true, groupWhere: { id: group.id }, log: quiet });
    await checkAll('after the repair');
    const again = await repair({ apply: false, groupWhere: { id: group.id }, log: quiet });
    assert.strictEqual(again.fixes.length, 0, 'a second run finds nothing to change');
    console.log('ok repair is idempotent');
    console.log('ALL PASSED');
  } finally {
    if (created.group) await Auction.destroy({ where: { group_id: created.group } });
    if (created.enrollments.length) {
      await ChitsInstallment.destroy({ where: { enrollment_id: created.enrollments } });
      await Enrollment.destroy({ where: { id: created.enrollments } });
    }
    if (created.group) await ChitsGroup.destroy({ where: { id: created.group } });
    if (created.scheme) await FixedSchemeChitsConfiguration.destroy({ where: { id: created.scheme } });
  }
}

run()
  .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
