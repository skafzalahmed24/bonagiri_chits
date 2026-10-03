const { resolveChitGroupAuctionType } = require('../services/userService');

function calculateGroupStats(group, latestAuctionNumber, upcomingInstallment) {
    const singleChitAmount = group ? (parseFloat(group.chit_amount) || 0) : 0;
    const totalMonths = group ? (parseInt(group.no_of_installments, 10) || 0) : 0;
    const monthlyInstAmt = group ? (parseFloat(group.installment_amount) || (totalMonths > 0 ? singleChitAmount / totalMonths : 0)) : 0;

    let completedInstallmentsCount = 0;
    if (group && Number(group.chits_group_status) === 2) {
        completedInstallmentsCount = totalMonths;
    } else {
        if (latestAuctionNumber) {
            completedInstallmentsCount = Math.min(totalMonths, latestAuctionNumber);
        } else if (group && Number(group.chits_group_status) === 1) {
            completedInstallmentsCount = 1;
        }
    }

    let completed_percentage = 0;
    if (totalMonths > 0) {
        completed_percentage = Math.min(100, Math.round((completedInstallmentsCount / totalMonths) * 100));
    }

    return {
        chit_amount: singleChitAmount,
        no_of_installments: totalMonths,
        total_positions: totalMonths,
        completed_installments_count: completedInstallmentsCount,
        completed_percentage,
        upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
        next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
        payable_amount: upcomingInstallment ? (parseFloat(upcomingInstallment.payable_amount) || 0) : 0,
        monthly_installment_amount: parseFloat(monthlyInstAmt.toFixed(2)),
        installment_amount: parseFloat(monthlyInstAmt.toFixed(2)),
        payment_state: upcomingInstallment ? 'unpaid' : 'paid',
    };
}

console.log('--- Test Case 1: Completed 6-month chit (status = 2) with all paid ---');
const groupCompleted = {
    chit_amount: 30000,
    no_of_installments: 6,
    chits_group_status: 2,
    installment_amount: 5000
};
const res1 = calculateGroupStats(groupCompleted, 6, null);
console.log(res1);
if (res1.completed_installments_count !== 6 || res1.completed_percentage !== 100 || res1.monthly_installment_amount !== 5000 || res1.payable_amount !== 0) {
    console.error('Test 1 failed');
    process.exit(1);
}

console.log('\n--- Test Case 2: Active 6-month chit (status = 1) at month 3 with upcoming due ---');
const groupActive = {
    chit_amount: 30000,
    no_of_installments: 6,
    chits_group_status: 1,
    installment_amount: null
};
const res2 = calculateGroupStats(groupActive, 3, { id: 'inst-4', due_date: '2027-01-05', payable_amount: 4128.33 });
console.log(res2);
if (res2.completed_installments_count !== 3 || res2.completed_percentage !== 50 || res2.monthly_installment_amount !== 5000 || res2.payable_amount !== 4128.33) {
    console.error('Test 2 failed');
    process.exit(1);
}

console.log('\nAll tests passed successfully!');
