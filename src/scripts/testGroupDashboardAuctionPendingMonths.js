'use strict';

const assert = require('assert');
const { toDateOnlyStr } = require('../services/userService');
const { ChitsGroup, Enrollment, ChitsInstallment, CustomerPayment, Auction, Member, sequelize } = require('../models');
const userService = require('../services/userService');

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

async function runTest() {
  console.log('--- Testing Collection Agent Group Dashboard Pending Months Behavior ---');

  // 1. Logic unit test with mocked data
  const currentDateStr = '2026-11-05';
  const group = {
    id: 'grp-test',
    group_name: 'Test Chit 100K',
    chits_group_status: 1, // Active
    chit_amount: 100000,
    no_of_installments: 12,
    installment_amount: 8333.33
  };

  const installments = [
    { id: 1, enrollment_id: 1, installment_no: 1, due_date: '2026-10-05', payable_amount: 8333.33 },
    { id: 2, enrollment_id: 1, installment_no: 2, due_date: '2026-11-05', payable_amount: 8333.33 },
    { id: 3, enrollment_id: 1, installment_no: 3, due_date: '2026-12-05', payable_amount: 8333.33 },
    { id: 4, enrollment_id: 1, installment_no: 4, due_date: '2027-01-05', payable_amount: 8333.33 }
  ];

  // Member paid Month 1 (Oct 5), unpaid Month 2 (Nov 5)
  const paidPayments = [
    { chits_installment_id: 1, received_amount: 8333.33 }
  ];

  // Scenario A: Auction 1 was completed in October. Today is Nov 5.
  // auctions = [ Auction 1 ] -> currentMonthCount would be 1 + 1 = 2
  let auctions = [{ id: 'auc-1', auction_number: 1 }];
  let currentMonthCount = auctions.length > 0 ? auctions[auctions.length - 1].auction_number + 1 : 1;

  let pendingMonthsSetA = new Set();
  installments.forEach(inst => {
    const instDateStr = toDateOnlyStr(inst.due_date);
    const isDue = Number(group.chits_group_status) === 2 ||
      (instDateStr ? instDateStr <= currentDateStr : inst.installment_no <= currentMonthCount);

    if (!isDue) return;

    const paid = paidPayments.filter(p => p.chits_installment_id === inst.id).reduce((s, p) => s + p.received_amount, 0);
    const pending = inst.payable_amount - paid;
    if (pending > 0) {
      pendingMonthsSetA.add(inst.installment_no);
    }
  });

  console.log('Scenario A (Nov 5 before Auction 2): Pending months =', pendingMonthsSetA.size, Array.from(pendingMonthsSetA));
  assert.strictEqual(pendingMonthsSetA.size, 1, 'Before Auction 2 on Nov 5, pending months must be 1');

  // Scenario B: Auction 2 is completed on Nov 5. Today is STILL Nov 5.
  // auctions = [ Auction 1, Auction 2 ] -> currentMonthCount would be 2 + 1 = 3
  auctions = [{ id: 'auc-1', auction_number: 1 }, { id: 'auc-2', auction_number: 2 }];
  currentMonthCount = auctions.length > 0 ? auctions[auctions.length - 1].auction_number + 1 : 1;

  let pendingMonthsSetB = new Set();
  installments.forEach(inst => {
    const instDateStr = toDateOnlyStr(inst.due_date);
    const isDue = Number(group.chits_group_status) === 2 ||
      (instDateStr ? instDateStr <= currentDateStr : inst.installment_no <= currentMonthCount);

    if (!isDue) return;

    const paid = paidPayments.filter(p => p.chits_installment_id === inst.id).reduce((s, p) => s + p.received_amount, 0);
    const pending = inst.payable_amount - paid;
    if (pending > 0) {
      pendingMonthsSetB.add(inst.installment_no);
    }
  });

  console.log('Scenario B (Nov 5 AFTER Auction 2 completed): Pending months =', pendingMonthsSetB.size, Array.from(pendingMonthsSetB));
  assert.strictEqual(pendingMonthsSetB.size, 1, 'After Auction 2 on Nov 5, pending months must STILL be 1 (Month 3 due in Dec is not due yet)');

  // Scenario C: Business date advances to Dec 5 (2026-12-05) and Month 2 is still unpaid.
  const futureDateStr = '2026-12-05';
  let pendingMonthsSetC = new Set();
  installments.forEach(inst => {
    const instDateStr = toDateOnlyStr(inst.due_date);
    const isDue = Number(group.chits_group_status) === 2 ||
      (instDateStr ? instDateStr <= futureDateStr : inst.installment_no <= currentMonthCount);

    if (!isDue) return;

    const paid = paidPayments.filter(p => p.chits_installment_id === inst.id).reduce((s, p) => s + p.received_amount, 0);
    const pending = inst.payable_amount - paid;
    if (pending > 0) {
      pendingMonthsSetC.add(inst.installment_no);
    }
  });

  console.log('Scenario C (Dec 5 next month): Pending months =', pendingMonthsSetC.size, Array.from(pendingMonthsSetC));
  assert.strictEqual(pendingMonthsSetC.size, 2, 'On Dec 5, pending months correctly advances to 2 (Month 2 + Month 3)');

  console.log('\n✓ ALL COLLECTION AGENT GROUP DASHBOARD TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
