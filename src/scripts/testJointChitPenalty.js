const { getHolderInstallmentDues, getEnrollmentHolders } = require('../services/userService');
const { dailyPenaltyFor } = require('../utils/penalty');

console.log('=== TEST: Joint Chit Penalty Calculation & Attribution ===\n');

// 1. Setup Mock Data
const group = {
    id: 'grp-001',
    group_name: 'Super 60 Chit',
    chit_amount: 60000,
    no_of_installments: 6,
    installment_amount: 5000,
    penality_for_nps: 0.1, // 0.1% per day
    penality_for_ps: 0.2
};

const memberA = { id: 101, name: 'Alice (Main Holder)' };
const memberB = { id: 102, name: 'Bob (Joint Holder)' };

const jointEnrollment = {
    id: 1,
    group_id: group.id,
    subscriber_id: memberA.id,
    subscriber: memberA,
    main_holder_share: 50,
    group: group,
    joint_holders: [
        {
            member_id: memberB.id,
            member: memberB,
            share_percentage: 50,
            removed_on: null
        }
    ]
};

const holders = getEnrollmentHolders(jointEnrollment);
console.log('Holders:', holders.map(h => `${h.name} (${h.sharePercent}%)`));

// 2. Scenario 1: Month 1 Due Date is 2026-10-05.
// Alice pays 2500 on 2026-10-04 (On Time).
// Bob pays 0.
const inst1 = {
    id: 'inst-1',
    enrollment_id: jointEnrollment.id,
    installment_no: 1,
    due_date: '2026-10-05',
    payable_amount: 5000,
    penalty_amount: 0,
    over_due_days_count: 0
};

const payments1 = [
    {
        id: 'p1',
        chits_installment_id: 'inst-1',
        received_amount: 2500,
        penalty_paid: 0,
        payment_date: '2026-10-04',
        payment_status: 1,
        payer_member_id: 101
    }
];

// Cron Job Simulation on 2026-10-10 (5 days overdue)
const D_UTC = Date.UTC(2026, 9, 10); // 2026-10-10
const start_UTC = Date.UTC(2026, 9, 5); // 2026-10-05
const days = Math.floor((D_UTC - start_UTC) / (1000 * 60 * 60 * 24)); // 5 days

const totalPaid = payments1.filter(p => p.payment_status === 1).reduce((s, p) => s + p.received_amount, 0);
const unpaidAmount = Math.max(0, inst1.payable_amount - totalPaid);
console.log(`\nScenario 1:`);
console.log(`Total Payable: ${inst1.payable_amount}, Alice Paid: 2500 on-time, Unpaid: ${unpaidAmount}`);
console.log(`Overdue Days: ${days}`);

const dailyRate = dailyPenaltyFor(group, false, unpaidAmount);
console.log(`Daily Penalty Rate on ₹${unpaidAmount}: ₹${dailyRate}/day`);

const totalPenalty = days * dailyRate;
console.log(`Total Penalty accumulated on installment: ₹${totalPenalty}`);
inst1.penalty_amount = totalPenalty;
inst1.over_due_days_count = days;

// Now check getHolderInstallmentDues as on 2026-10-10
const simulatedNow = new Date('2026-10-10T00:00:00Z');
const dues1 = getHolderInstallmentDues(inst1, jointEnrollment, holders, payments1, simulatedNow);

console.log('\nInstallment Dues breakdown per holder on 2026-10-10:');
dues1.forEach(d => {
    console.log(`- ${d.holder.name}: Payable: ₹${d.payable}, Received: ₹${d.received}, Pending: ₹${d.pending}, Penalty: ₹${d.penalty}, isOverdue: ${d.isOverdue}`);
});

const aliceDue = dues1.find(d => d.holder.member_id === 101);
const bobDue = dues1.find(d => d.holder.member_id === 102);

if (aliceDue.penalty === 0 && !aliceDue.isOverdue && aliceDue.pending === 0) {
    console.log(' PASS: Alice (paid on time) has 0 penalty, 0 pending, and is not overdue!');
} else {
    console.error(' FAIL: Alice should not have penalty or be overdue!');
    process.exit(1);
}

if (bobDue.penalty === totalPenalty && bobDue.isOverdue && bobDue.pending === 2500) {
    console.log(` PASS: Bob (did not pay) has full penalty (₹${totalPenalty}), pending ₹2500, and is overdue!`);
} else {
    console.error(' FAIL: Bob should have full penalty and be overdue!');
    process.exit(1);
}

// 3. Scenario 2: Bob later pays his ₹2500 on 2026-10-12 (Late payment, no penalty paid yet)
const payments2 = [
    ...payments1,
    {
        id: 'p2',
        chits_installment_id: 'inst-1',
        received_amount: 2500,
        penalty_paid: 0,
        payment_date: '2026-10-12',
        payment_status: 1,
        payer_member_id: 102
    }
];

const dues2 = getHolderInstallmentDues(inst1, jointEnrollment, holders, payments2, simulatedNow);
console.log('\nScenario 2 (Bob pays 2500 late on 2026-10-12 without penalty):');
dues2.forEach(d => {
    console.log(`- ${d.holder.name}: Payable: ₹${d.payable}, Received: ₹${d.received}, Pending: ₹${d.pending}, Penalty: ₹${d.penalty}, isOverdue: ${d.isOverdue}`);
});

const aliceDue2 = dues2.find(d => d.holder.member_id === 101);
const bobDue2 = dues2.find(d => d.holder.member_id === 102);

if (aliceDue2.penalty === 0 && !aliceDue2.isOverdue) {
    console.log(' PASS: Alice still has 0 penalty and is not overdue!');
} else {
    console.error(' FAIL: Alice should not be charged Bob\'s late penalty!');
    process.exit(1);
}

if (bobDue2.penalty === totalPenalty && bobDue2.isOverdue && bobDue2.pending === 0) {
    console.log(` PASS: Bob owes the ₹${totalPenalty} penalty and is marked overdue until penalty is cleared!`);
} else {
    console.error(' FAIL: Bob should still owe the late penalty!');
    process.exit(1);
}

// 4. Scenario 3: Bob pays penalty of ₹12.50
const payments3 = [
    ...payments1,
    {
        id: 'p2',
        chits_installment_id: 'inst-1',
        received_amount: 2500,
        penalty_paid: totalPenalty,
        payment_date: '2026-10-12',
        payment_status: 1,
        payer_member_id: 102
    }
];

const dues3 = getHolderInstallmentDues(inst1, jointEnrollment, holders, payments3, simulatedNow);
console.log('\nScenario 3 (Bob pays ₹2500 + full penalty):');
dues3.forEach(d => {
    console.log(`- ${d.holder.name}: Payable: ₹${d.payable}, Received: ₹${d.received}, Pending: ₹${d.pending}, Penalty: ₹${d.penalty}, isOverdue: ${d.isOverdue}`);
});

const bobDue3 = dues3.find(d => d.holder.member_id === 102);
if (bobDue3.penalty === 0 && !bobDue3.isOverdue) {
    console.log(' PASS: Bob is completely cleared of dues and penalty!');
} else {
    console.error(' FAIL: Bob should have 0 penalty after paying!');
    process.exit(1);
}

console.log('\n ALL JOINT CHIT PENALTY TESTS PASSED SUCCESSFULLY!');
