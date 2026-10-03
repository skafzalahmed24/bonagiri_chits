const { getHolderInstallmentDues, getEnrollmentHolders } = require('../services/userService');

// Mock data matching the user's Chit Group - 2 scenario
const group = {
    id: 'da367b64-9b7d-4497-be53-49c3052164b0',
    group_name: 'Chit Group - 2',
    chit_amount: 60000,
    no_of_installments: 6,
    installment_amount: 5000,
    chits_group_status: 1
};

const member = { id: 85, name: 'Member 2' };

const enrollment1 = {
    id: 248,
    group_id: group.id,
    subscriber_id: member.id,
    subscriber: member,
    group: group,
    joint_holders: []
};

const enrollment2 = {
    id: 249,
    group_id: group.id,
    subscriber_id: member.id,
    subscriber: member,
    group: group,
    joint_holders: []
};

const holders1 = getEnrollmentHolders(enrollment1);
const holders2 = getEnrollmentHolders(enrollment2);

// Installments
const installments = [
    // Month 1
    { id: 101, enrollment_id: 248, installment_no: 1, due_date: '2026-10-05', payable_amount: '5000.00' },
    { id: 102, enrollment_id: 249, installment_no: 1, due_date: '2026-10-05', payable_amount: '5000.00' },
    // Month 2
    { id: 201, enrollment_id: 248, installment_no: 2, due_date: '2026-11-05', payable_amount: '5000.00' },
    { id: 202, enrollment_id: 249, installment_no: 2, due_date: '2026-11-05', payable_amount: '5000.00' },
    // Month 3 (December) - open auction adjusted payable_amount
    { id: 301, enrollment_id: 248, installment_no: 3, due_date: '2026-12-05', payable_amount: '4461.67' },
    { id: 302, enrollment_id: 249, installment_no: 3, due_date: '2026-12-05', payable_amount: '4461.67' },
    // Month 4 (January) - base payable_amount
    { id: 401, enrollment_id: 248, installment_no: 4, due_date: '2027-01-05', payable_amount: '5000.00' },
    { id: 402, enrollment_id: 249, installment_no: 4, due_date: '2027-01-05', payable_amount: '5000.00' },
    // Month 5
    { id: 501, enrollment_id: 248, installment_no: 5, due_date: '2027-02-05', payable_amount: '5000.00' },
    { id: 502, enrollment_id: 249, installment_no: 5, due_date: '2027-02-05', payable_amount: '5000.00' },
    // Month 6
    { id: 601, enrollment_id: 248, installment_no: 6, due_date: '2027-03-05', payable_amount: '5000.00' },
    { id: 602, enrollment_id: 249, installment_no: 6, due_date: '2027-03-05', payable_amount: '5000.00' }
];

// Payments already recorded prior to Dec 5 collection:
// Month 1: 5000 for #03, 5000 for #04
// Month 2: 5000 for #03, 5000 for #04, and 1000 advance on Month 3 for #04
const payments = [
    { id: 'p1', chits_installment_id: 101, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p2', chits_installment_id: 102, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p3', chits_installment_id: 201, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p4', chits_installment_id: 202, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p5', chits_installment_id: 302, received_amount: 1000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 }
];

console.log('=== Step 1: Testing Dues Calculation for Month 3 & Month 4 ===');
const simulatedNow = new Date('2026-12-05');

// Test dues on Month 3 (Inst 301 and 302)
const due301 = getHolderInstallmentDues(installments[4], enrollment1, holders1, payments.filter(p => p.chits_installment_id === 301), simulatedNow);
const due302 = getHolderInstallmentDues(installments[5], enrollment2, holders2, payments.filter(p => p.chits_installment_id === 302), simulatedNow);

console.log('Month 3 Ticket #03 (#248) Dues:', {
    payable: due301[0].payable,
    received: due301[0].received,
    pending: due301[0].pending
});

console.log('Month 3 Ticket #04 (#249) Dues:', {
    payable: due302[0].payable,
    received: due302[0].received,
    pending: due302[0].pending
});

const totalMonth3Pending = due301[0].pending + due302[0].pending;
console.log('Total Month 3 Pending (Expected ~7923.34):', totalMonth3Pending);

console.log('\n=== Step 2: Testing Fallback when payable_amount is 0 in DB ===');
const unpopulatedInst301 = { id: 301, enrollment_id: 248, installment_no: 3, due_date: '2026-12-05', payable_amount: '0.00' };
const fallbackDue301 = getHolderInstallmentDues(unpopulatedInst301, enrollment1, holders1, [], simulatedNow);
console.log('Fallback Dues on 0.00 payable_amount (Should fall back to group 5000):', fallbackDue301[0].payable, 'Pending:', fallbackDue301[0].pending);

console.log('\n=== Step 3: Simulating Collection Agent Payment Allocation for 7922 ===');
let remainingAmount = 7922;
const allocatedPayments = [];

for (const inst of installments) {
    if (remainingAmount <= 0) break;
    const e = inst.enrollment_id === 248 ? enrollment1 : enrollment2;
    const holders = e.id === 248 ? holders1 : holders2;
    const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
    const dues = getHolderInstallmentDues(inst, e, holders, relatedPayments, simulatedNow);
    const myDue = dues.find(d => Number(d.holder.member_id) === 85);
    if (!myDue) continue;

    if (myDue.pending > 0) {
        const payForThis = Math.min(myDue.pending, remainingAmount);
        remainingAmount -= payForThis;
        allocatedPayments.push({
            inst_no: inst.installment_no,
            ticket: e.id === 248 ? '#03' : '#04',
            due_date: inst.due_date,
            paid: payForThis
        });
    }
}

console.log('Allocated payments for 7922 collected on Dec 5:');
console.table(allocatedPayments);
console.log('Remaining unallocated amount:', remainingAmount);

// Verification:
// Payment MUST be allocated to Month 3 (inst_no 3), NOT Month 4 (inst_no 4)
const hasMonth4Payment = allocatedPayments.some(p => p.inst_no === 4);
if (hasMonth4Payment) {
    console.error('FAIL: Payment was allocated to Month 4!');
    process.exit(1);
} else {
    console.log('PASS: Payments correctly allocated to Month 3 (December 2026)!');
}
