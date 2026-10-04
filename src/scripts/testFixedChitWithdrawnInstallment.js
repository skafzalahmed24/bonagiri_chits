'use strict';

const assert = require('assert');
const { getSchemeOriginalAmount } = require('../utils/schemeHelpers');
const userService = require('../services/userService');
const { FixedSchemeChitsConfiguration, ChitsGroup, Enrollment, Auction, Member, ChitsInstallment, sequelize } = require('../models');

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function(data) {
    this.body = data;
    return this;
  };
  return res;
};

async function runTests() {
  console.log('--- 1. Testing getSchemeOriginalAmount helper for Scheme Type 62 ---');

  const mockScheme62 = {
    scheme_type: 62,
    prices: JSON.stringify([
      { month: 1, not_withdrawn: 10000, withdrawn: 10500, chit_amount: 100000 },
      { month: 2, not_withdrawn: 10000, withdrawn: 10600, chit_amount: 100000 },
      { month: 3, not_withdrawn: 10000, withdrawn: 10700, chit_amount: 100000 }
    ])
  };

  // Test non-withdrawn
  const m1NotWithdrawn = getSchemeOriginalAmount(mockScheme62, 1, false);
  const m2NotWithdrawn = getSchemeOriginalAmount(mockScheme62, 2, false);
  const m3NotWithdrawn = getSchemeOriginalAmount(mockScheme62, { auction_number: 3 }, false);

  assert.strictEqual(m1NotWithdrawn, 10000, `Month 1 not_withdrawn should be 10000, got ${m1NotWithdrawn}`);
  assert.strictEqual(m2NotWithdrawn, 10000, `Month 2 not_withdrawn should be 10000, got ${m2NotWithdrawn}`);
  assert.strictEqual(m3NotWithdrawn, 10000, `Month 3 not_withdrawn should be 10000, got ${m3NotWithdrawn}`);
  console.log('✓ Non-withdrawn returns not_withdrawn price (10,000)');

  // Test withdrawn
  const m1Withdrawn = getSchemeOriginalAmount(mockScheme62, 1, true);
  const m2Withdrawn = getSchemeOriginalAmount(mockScheme62, 2, true);
  const m3Withdrawn = getSchemeOriginalAmount(mockScheme62, { auction_number: 3 }, true);

  assert.strictEqual(m1Withdrawn, 10500, `Month 1 withdrawn should be 10500, got ${m1Withdrawn}`);
  assert.strictEqual(m2Withdrawn, 10600, `Month 2 withdrawn should be 10600, got ${m2Withdrawn}`);
  assert.strictEqual(m3Withdrawn, 10700, `Month 3 withdrawn should be 10700, got ${m3Withdrawn}`);
  console.log('✓ Withdrawn returns withdrawn prices (10500, 10600, 10700)');

  console.log('\n--- 2. End-to-End Simulation of getChitDetailsService for Scheme 62 ---');

  let createdGroupId = null;
  let createdSchemeId = null;
  let createdEnrollmentIds = [];
  let createdAuctionIds = [];

  try {
    // Get 2 test members
    const members = await Member.findAll({ limit: 2 });
    if (members.length < 2) {
      console.log('Less than 2 members in DB, skipping live group simulation.');
      process.exit(0);
    }
    const [memberA, memberB] = members;

    // Create Scheme 62 in DB
    const companyId = memberA.company_id || '3e5562eb-9d67-4116-aae9-fbf124b72918';
    const schemeConfig = await FixedSchemeChitsConfiguration.create({
      title: 'Test 62 Withdrawn Scheme',
      company_id: companyId,
      months_count: 4,
      members_count: 4,
      scheme_type: 62,
      prices: JSON.stringify([
        { month: 1, not_withdrawn: 10000, withdrawn: 10500, chit_amount: 200000 },
        { month: 2, not_withdrawn: 10000, withdrawn: 10600, chit_amount: 200000 },
        { month: 3, not_withdrawn: 10000, withdrawn: 10700, chit_amount: 200000 },
        { month: 4, not_withdrawn: 10000, withdrawn: 10800, chit_amount: 200000 }
      ]),
      status: 1
    });
    createdSchemeId = schemeConfig.id;

    // Create Test Group
    const group = await ChitsGroup.create({
      group_name: 'Test Scheme 62 Group',
      scheme_configuration_id: schemeConfig.id,
      company_id: companyId,
      chit_series_term: 1,
      auction_type: 2,
      chit_amount: 200000,
      no_of_installments: 4,
      installment_amount: 10000,
      chits_group_status: 1,
      is_deleted_status: 0
    });
    createdGroupId = group.id;

    // Create Enrollments
    const enrA = await Enrollment.create({
      group_id: group.id,
      subscriber_id: memberA.id,
      group_position_number: 1,
      delete_status: 0
    });
    createdEnrollmentIds.push(enrA.id);

    const enrB = await Enrollment.create({
      group_id: group.id,
      subscriber_id: memberB.id,
      group_position_number: 2,
      delete_status: 0
    });
    createdEnrollmentIds.push(enrB.id);

    // Create Installments for 4 months
    for (let m = 1; m <= 4; m++) {
      await ChitsInstallment.create({
        enrollment_id: enrA.id,
        group_id: group.id,
        type: 1,
        installment_no: m,
        due_date: `2026-0${m}-15`,
        payable_amount: 10000
      });

      await ChitsInstallment.create({
        enrollment_id: enrB.id,
        group_id: group.id,
        type: 1,
        installment_no: m,
        due_date: `2026-0${m}-15`,
        payable_amount: 10000
      });
    }

    // Member A wins auction in Month 2
    const auc = await Auction.create({
      group_id: group.id,
      bidder_id: memberA.id,
      ticket_number: 1,
      auction_number: 2,
      auction_date: '2026-02-15',
      bid_amount: 180000,
      subscription_amount: 10600
    });
    createdAuctionIds.push(auc.id);

    // Update installments according to winner scheme logic
    await ChitsInstallment.update(
      { payable_amount: 10600 },
      { where: { enrollment_id: enrA.id, installment_no: 2 } }
    );
    await ChitsInstallment.update(
      { payable_amount: 10700 },
      { where: { enrollment_id: enrA.id, installment_no: 3 } }
    );
    await ChitsInstallment.update(
      { payable_amount: 10800 },
      { where: { enrollment_id: enrA.id, installment_no: 4 } }
    );

    // Test getChitDetailsService for Member A (Winner in Month 2)
    const resA = mockRes();
    await userService.getChitDetailsService(resA, { id: memberA.id, role: 'member' }, group.id, null);
    assert.strictEqual(resA.statusCode, 200);

    const monthlyActivityA = resA.body?.data?.monthly_activity;
    console.log('\n--- Member A Monthly Activity (Won Month 2) ---');
    monthlyActivityA.forEach(m => {
      console.log(`Month ${m.month_count}: original_amount=${m.original_amount}, payable=${m.payable}, is_winner=${m.is_winner_status}`);
    });

    assert.strictEqual(monthlyActivityA[0].original_amount, 10000, 'Member A Month 1 should be 10000 (not withdrawn)');
    assert.strictEqual(monthlyActivityA[1].original_amount, 10600, 'Member A Month 2 should be 10600 (withdrawn)');
    assert.strictEqual(monthlyActivityA[2].original_amount, 10700, 'Member A Month 3 should be 10700 (withdrawn)');
    assert.strictEqual(monthlyActivityA[3].original_amount, 10800, 'Member A Month 4 should be 10800 (withdrawn)');

    // Test getChitDetailsService for Member B (Non-Winner)
    const resB = mockRes();
    await userService.getChitDetailsService(resB, { id: memberB.id, role: 'member' }, group.id, null);
    assert.strictEqual(resB.statusCode, 200);

    const monthlyActivityB = resB.body?.data?.monthly_activity;
    console.log('\n--- Member B Monthly Activity (Non-Winner) ---');
    monthlyActivityB.forEach(m => {
      console.log(`Month ${m.month_count}: original_amount=${m.original_amount}, payable=${m.payable}, is_winner=${m.is_winner_status}`);
    });

    assert.strictEqual(monthlyActivityB[0].original_amount, 10000, 'Member B Month 1 should be 10000 (not withdrawn)');
    assert.strictEqual(monthlyActivityB[1].original_amount, 10000, 'Member B Month 2 should be 10000 (not withdrawn)');
    assert.strictEqual(monthlyActivityB[2].original_amount, 10000, 'Member B Month 3 should be 10000 (not withdrawn)');
    assert.strictEqual(monthlyActivityB[3].original_amount, 10000, 'Member B Month 4 should be 10000 (not withdrawn)');

    console.log('\n✓ ALL TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Cleanup created test data
    if (createdEnrollmentIds.length > 0) {
      await ChitsInstallment.destroy({ where: { enrollment_id: createdEnrollmentIds } });
      await Enrollment.destroy({ where: { id: createdEnrollmentIds } });
    }
    if (createdAuctionIds.length > 0) {
      await Auction.destroy({ where: { id: createdAuctionIds } });
    }
    if (createdGroupId) {
      await ChitsGroup.destroy({ where: { id: createdGroupId } });
    }
    if (createdSchemeId) {
      await FixedSchemeChitsConfiguration.destroy({ where: { id: createdSchemeId } });
    }
  }
  process.exit(0);
}

runTests();
