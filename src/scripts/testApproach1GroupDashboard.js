'use strict';

const assert = require('assert');
const { toDateOnlyStr } = require('../services/userService');

function runTest() {
  console.log('--- Testing Approach 1 for Group Dashboard ---');

  const currentDateStr = '2026-11-06';
  const group = {
    id: 'grp-test',
    group_name: 'chit group - 4(fc)',
    chits_group_status: 1, // Active
    chit_amount: 100000,
    no_of_installments: 12,
    installment_amount: 9800,
    chit_start_date: '2026-10-05'
  };

  const installments = [
    { id: 1, enrollment_id: 1, installment_no: 1, due_date: '2026-10-05', payable_amount: 10500 },
    { id: 2, enrollment_id: 1, installment_no: 2, due_date: '2026-11-05', payable_amount: 10500 },
    { id: 3, enrollment_id: 1, installment_no: 3, due_date: '2026-12-05', payable_amount: 9800 },
    { id: 4, enrollment_id: 1, installment_no: 4, due_date: '2027-01-05', payable_amount: 9800 }
  ];

  const auctions = [
    { id: 'auc-1', auction_number: 1, auction_date: '2026-10-05' }
  ];

  // Calculate currentMonthCount with Approach 1
  const totalInstallments = parseInt(group.no_of_installments, 10) || 12;
  let auctionCount = 1;
  if (auctions && auctions.length > 0) {
    const latestAuction = auctions[auctions.length - 1];
    const lastAuctionDate = latestAuction.auction_date ? toDateOnlyStr(latestAuction.auction_date) : null;
    if (lastAuctionDate && currentDateStr > lastAuctionDate) {
      auctionCount = latestAuction.auction_number + 1;
    } else {
      auctionCount = latestAuction.auction_number;
    }
  }

  let dateBasedMonth = 1;
  const dueInstallmentNos = installments
    .filter(i => {
      const dStr = toDateOnlyStr(i.due_date);
      return dStr && dStr <= currentDateStr;
    })
    .map(i => i.installment_no);
  if (dueInstallmentNos.length > 0) {
    dateBasedMonth = Math.max(...dueInstallmentNos);
  }

  const currentMonthCount = Math.min(totalInstallments, Math.max(auctionCount, dateBasedMonth, 1));
  console.log('Calculated currentMonthCount on 2026-11-06:', currentMonthCount);
  assert.strictEqual(currentMonthCount, 2, 'Month count should be 2 on 2026-11-06');

  // Test Member 1 (unpaid for both Month 1 & Month 2)
  const paymentsM1 = [];
  let balanceM1 = 0;
  const pendingMonthsSetM1 = new Set();
  let oldestDueM1 = null;

  installments.forEach(inst => {
    const isDue = Number(group.chits_group_status) === 2 || (inst.installment_no <= currentMonthCount);
    if (!isDue) return;

    const paid = paymentsM1.filter(p => p.chits_installment_id === inst.id).reduce((s, p) => s + p.received_amount, 0);
    const pending = inst.payable_amount - paid;
    if (pending > 0) {
      pendingMonthsSetM1.add(inst.installment_no);
      balanceM1 += pending;
      if (!oldestDueM1 || new Date(inst.due_date) < new Date(oldestDueM1)) {
        oldestDueM1 = inst.due_date;
      }
    }
  });

  console.log('Member 1 (unpaid): balance =', balanceM1, 'pending_months =', pendingMonthsSetM1.size, 'oldest_due =', oldestDueM1);
  assert.strictEqual(pendingMonthsSetM1.size, 2, 'Member 1 should have 2 pending months');
  assert.strictEqual(balanceM1, 21000, 'Member 1 balance should be 21000 (10500 + 10500)');
  assert.strictEqual(oldestDueM1, '2026-10-05', 'Member 1 oldest due should be 2026-10-05');

  // Test Member 2 (paid Month 1, unpaid Month 2)
  const paymentsM2 = [{ chits_installment_id: 1, received_amount: 10500 }];
  let balanceM2 = 0;
  const pendingMonthsSetM2 = new Set();
  let oldestDueM2 = null;

  installments.forEach(inst => {
    const isDue = Number(group.chits_group_status) === 2 || (inst.installment_no <= currentMonthCount);
    if (!isDue) return;

    const paid = paymentsM2.filter(p => p.chits_installment_id === inst.id).reduce((s, p) => s + p.received_amount, 0);
    const pending = inst.payable_amount - paid;
    if (pending > 0) {
      pendingMonthsSetM2.add(inst.installment_no);
      balanceM2 += pending;
      if (!oldestDueM2 || new Date(inst.due_date) < new Date(oldestDueM2)) {
        oldestDueM2 = inst.due_date;
      }
    }
  });

  console.log('Member 2 (paid Month 1): balance =', balanceM2, 'pending_months =', pendingMonthsSetM2.size, 'oldest_due =', oldestDueM2);
  assert.strictEqual(pendingMonthsSetM2.size, 1, 'Member 2 should have 1 pending month');
  assert.strictEqual(balanceM2, 10500, 'Member 2 balance should be 10500');
  assert.strictEqual(oldestDueM2, '2026-11-05', 'Member 2 oldest due should be 2026-11-05');

  console.log('ALL APPROACH 1 TESTS PASSED!');
}

runTest();
