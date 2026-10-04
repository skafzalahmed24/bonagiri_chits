const { toDateOnlyStr } = require('../services/userService');

function testGroupDashboardCalculations() {
    console.log('Testing Group Dashboard Due Months and Balance Calculation...');

    // 1. Date string utility test
    const d1 = new Date('2026-11-05T00:00:00.000Z');
    const s1 = '2026-11-05';
    console.log('toDateOnlyStr(d1):', toDateOnlyStr(d1));
    console.log('toDateOnlyStr(s1):', toDateOnlyStr(s1));

    if (toDateOnlyStr(d1) !== '2026-11-05' || toDateOnlyStr(s1) !== '2026-11-05') {
        throw new Error('toDateOnlyStr test failed');
    }

    // 2. Simulation of an Active 12-month chit group
    // Current business date: 2026-11-05 (Month 2 active, Month 1 was 2026-10-05)
    const currentDateStr = '2026-11-05';
    const group = {
        id: 'grp-1',
        group_name: 'chit group - 4(fc)',
        chits_group_status: 1, // Active
        chit_amount: 100000,
        no_of_installments: 12,
        installment_amount: 8333.33
    };

    // 12 installments generated for a member (from Oct 2026 to Sep 2027)
    const months = ['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05', '2027-06-05', '2027-07-05', '2027-08-05', '2027-09-05'];
    const memberInstallments = months.map((due_date, idx) => ({
        id: idx + 1,
        enrollment_id: 101,
        installment_no: idx + 1,
        due_date,
        payable_amount: 8333.33
    }));

    // Member has NOT made any payments yet
    const payments = [];

    // Filter installments by isDue
    const currentMonthCount = 2; // Auction 1 conducted, so Month 2 is active
    let memberBalance = 0;
    const pendingMonthsSet = new Set();
    let oldestDueDate = null;

    memberInstallments.forEach(inst => {
        const instDateStr = toDateOnlyStr(inst.due_date);
        const isDue = Number(group.chits_group_status) === 2 ||
            (instDateStr && instDateStr <= currentDateStr) ||
            (inst.installment_no <= currentMonthCount);

        if (!isDue) return;

        const payable = inst.payable_amount;
        const paid = payments.filter(p => p.chits_installment_id === inst.id).reduce((s, p) => s + p.received_amount, 0);
        const pending = payable - paid;

        if (pending > 0) {
            pendingMonthsSet.add(inst.installment_no);
            memberBalance += pending;
            if (!oldestDueDate || new Date(inst.due_date) < new Date(oldestDueDate)) {
                oldestDueDate = inst.due_date;
            }
        }
    });

    console.log('Due check results for unpaid member:');
    console.log('Member balance:', memberBalance.toFixed(2), '(Expected: 16666.66 for 2 months, NOT 100000!)');
    console.log('Pending months count:', pendingMonthsSet.size, '(Expected: 2, NOT 11 or 12!)');
    console.log('Oldest due:', oldestDueDate, '(Expected: 2026-10-05)');

    if (pendingMonthsSet.size !== 2) {
        throw new Error(`Expected pending_months to be 2, but got ${pendingMonthsSet.size}`);
    }
    if (Math.abs(memberBalance - 16666.66) > 0.1) {
        throw new Error(`Expected balance to be ~16666.66, but got ${memberBalance}`);
    }

    console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

testGroupDashboardCalculations();
