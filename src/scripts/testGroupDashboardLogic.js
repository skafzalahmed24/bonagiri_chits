const SystemSettingsService = require('../services/systemSettingsService');

async function testLogic() {
    const businessDateObj = await SystemSettingsService.getBusinessDate();
    console.log('Business date obj:', businessDateObj);
    
    let currentDateStr;
    if (businessDateObj instanceof Date) {
        const year = businessDateObj.getFullYear();
        const month = String(businessDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(businessDateObj.getDate()).padStart(2, '0');
        currentDateStr = `${year}-${month}-${day}`;
    } else {
        currentDateStr = String(businessDateObj).split('T')[0];
    }
    console.log('Formatted business date:', currentDateStr);

    const group = {
        id: 'da367b64-9b7d-4497-be53-49c3052164b0',
        group_name: 'Chit Group - 2',
        chits_group_status: 0, // Upcoming
        no_of_installments: 6,
        chit_amount: 30000
    };

    const auctions = []; // 0 auctions
    let currentMonthCount = 1;
    if (Number(group.chits_group_status) === 2) {
        currentMonthCount = parseInt(group.no_of_installments, 10) || 12;
    } else if (Number(group.chits_group_status) === 1) {
        if (auctions && auctions.length > 0) {
            currentMonthCount = Math.min(parseInt(group.no_of_installments, 10) || 12, auctions[auctions.length - 1].auction_number + 1);
        } else {
            currentMonthCount = 1;
        }
    } else {
        currentMonthCount = 1;
    }

    console.log('Calculated currentMonthCount for upcoming group:', currentMonthCount);

    // Test member with 2 tickets (Member 2)
    const memberMap = {};
    const sub2 = { id: 85, name: 'Member 2', member_id: 'MEM857623' };
    
    const installments = [
        { id: 'inst-1', enrollment_id: 'e-1', installment_no: 1, payable_amount: 5000, due_date: '2026-10-05' },
        { id: 'inst-2', enrollment_id: 'e-2', installment_no: 1, payable_amount: 5000, due_date: '2026-10-05' },
        { id: 'inst-3', enrollment_id: 'e-1', installment_no: 2, payable_amount: 5000, due_date: '2026-11-05' },
        { id: 'inst-4', enrollment_id: 'e-2', installment_no: 2, payable_amount: 5000, due_date: '2026-11-05' }
    ];

    installments.forEach(inst => {
        if (inst.installment_no > currentMonthCount) return;

        if (!memberMap[sub2.id]) {
            memberMap[sub2.id] = {
                id: sub2.id,
                name: sub2.name,
                pending_months_set: new Set(),
                balance: 0
            };
        }
        memberMap[sub2.id].pending_months_set.add(inst.installment_no);
        memberMap[sub2.id].balance += inst.payable_amount;
    });

    const resultRow = {
        ...memberMap[sub2.id],
        pending_months: memberMap[sub2.id].pending_months_set.size
    };
    delete resultRow.pending_months_set;

    console.log('Member 2 result:', resultRow);
    if (resultRow.pending_months !== 1 || resultRow.balance !== 10000) {
        throw new Error('Test failed!');
    }
    console.log('Test passed successfully!');
    process.exit(0);
}

testLogic().catch(e => { console.error(e); process.exit(1); });
