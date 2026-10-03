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

const member = { id: 85, name: 'Member 2', member_id: '#85' };

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

const enrollments = [enrollment1, enrollment2];

const allInstallments = [
    // Month 1
    { id: 101, enrollment_id: 248, installment_no: 1, due_date: '2026-10-05', payable_amount: '5000.00' },
    { id: 102, enrollment_id: 249, installment_no: 1, due_date: '2026-10-05', payable_amount: '5000.00' },
    // Month 2
    { id: 201, enrollment_id: 248, installment_no: 2, due_date: '2026-11-05', payable_amount: '5000.00' },
    { id: 202, enrollment_id: 249, installment_no: 2, due_date: '2026-11-05', payable_amount: '5000.00' },
    // Month 3 (December)
    { id: 301, enrollment_id: 248, installment_no: 3, due_date: '2026-12-05', payable_amount: '4461.67' },
    { id: 302, enrollment_id: 249, installment_no: 3, due_date: '2026-12-05', payable_amount: '4461.67' },
    // Month 4 (January)
    { id: 401, enrollment_id: 248, installment_no: 4, due_date: '2027-01-05', payable_amount: '5000.00' },
    { id: 402, enrollment_id: 249, installment_no: 4, due_date: '2027-01-05', payable_amount: '5000.00' },
    // Month 5
    { id: 501, enrollment_id: 248, installment_no: 5, due_date: '2027-02-05', payable_amount: '5000.00' },
    { id: 502, enrollment_id: 249, installment_no: 5, due_date: '2027-02-05', payable_amount: '5000.00' },
    // Month 6
    { id: 601, enrollment_id: 248, installment_no: 6, due_date: '2027-03-05', payable_amount: '5000.00' },
    { id: 602, enrollment_id: 249, installment_no: 6, due_date: '2027-03-05', payable_amount: '5000.00' }
];

// Payments: Month 1 paid, Month 2 paid + 1000 advance on Month 3
const payments = [
    { id: 'p1', chits_installment_id: 101, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p2', chits_installment_id: 102, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p3', chits_installment_id: 201, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p4', chits_installment_id: 202, received_amount: 5000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 },
    { id: 'p5', chits_installment_id: 302, received_amount: 1000, penalty_paid: 0, payment_status: 0, payer_member_id: 85 }
];

const simulatedNow = new Date('2026-12-05');
const memberMap = {};

allInstallments.forEach(inst => {
    const e = enrollments.find(e => e.id === inst.enrollment_id);
    if (!e) return;

    const holders = getEnrollmentHolders(e);
    const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
    const dues = getHolderInstallmentDues(inst, e, holders, relatedPayments, simulatedNow);

    dues.forEach(d => {
        if (d.pending > 0) {
            const sub = d.holder.member;
            if (!memberMap[sub.id]) {
                memberMap[sub.id] = {
                    id: sub.id,
                    member_name: sub.name,
                    pending_months_set: new Set(),
                    oldest_due_date: inst.due_date,
                    balance: 0,
                    penalty_amount: 0
                };
            }

            memberMap[sub.id].pending_months_set.add(inst.installment_no || inst.due_date);
            memberMap[sub.id].balance += d.pending;
            memberMap[sub.id].penalty_amount += d.penalty;

            if (new Date(inst.due_date) < new Date(memberMap[sub.id].oldest_due_date)) {
                memberMap[sub.id].oldest_due_date = inst.due_date;
            }
        }
    });
});

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const result = Object.values(memberMap).map(row => {
    const d = new Date(row.oldest_due_date);
    return {
        member: row.member_name,
        oldest_due: `${months[d.getMonth()]} ${d.getFullYear()}`,
        pending_months: row.pending_months_set.size,
        balance: parseFloat(row.balance.toFixed(2))
    };
});

console.log('Pending members list calculation result:');
console.table(result);

if (result[0].oldest_due === 'Dec 2026') {
    console.log('PASS: Oldest due is correctly Dec 2026!');
} else {
    console.error('FAIL: Expected Dec 2026, got:', result[0].oldest_due);
    process.exit(1);
}
