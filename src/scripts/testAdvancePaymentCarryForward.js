const { getEnrollmentHolders, getHolderInstallmentDues } = require('../services/userService');

const mockEnrollment = {
    id: 250,
    group_position_number: 5,
    subscriber_id: 87,
    subscriber: { id: 87, name: 'Member 3' },
    joint_holders: [
        { member_id: 88, share_percentage: 50, member: { id: 88, name: 'Member 4' } }
    ]
};

const holders = getEnrollmentHolders(mockEnrollment);

const inst1 = { id: 101, installment_no: 1, payable_amount: 5000, penalty_amount: 0, due_date: '2026-10-05' };
const inst2 = { id: 102, installment_no: 2, payable_amount: 5000, penalty_amount: 0, due_date: '2026-11-05' };
const inst3 = { id: 103, installment_no: 3, payable_amount: 5000, penalty_amount: 0, due_date: '2026-12-05' };

const allUserInstallments = [inst1, inst2, inst3];

const payments = [
    { id: 'p1', chits_installment_id: 101, received_amount: 2500, penalty_paid: 0, collection_agent_amount_id: 'sub1', collection_submission: { id: 'sub1', member_id: 87, received_amount: 2500 } },
    { id: 'p2', chits_installment_id: 101, received_amount: 2500, penalty_paid: 0, collection_agent_amount_id: 'sub2', collection_submission: { id: 'sub2', member_id: 88, received_amount: 2500 } },
    { id: 'p3', chits_installment_id: 102, received_amount: 2500, penalty_paid: 0, collection_agent_amount_id: 'sub3', receipt_number: 'RCT-2026-000077', collection_submission: { id: 'sub3', member_id: 87, received_amount: 3000 } },
    { id: 'p4', chits_installment_id: 103, received_amount: 500, penalty_paid: 0, collection_agent_amount_id: 'sub3', receipt_number: 'RCT-2026-000078', collection_submission: { id: 'sub3', member_id: 87, received_amount: 3000 } },
];

const subscriber_id = 87;

[
    { m: 1, inst: inst1 },
    { m: 2, inst: inst2 },
    { m: 3, inst: inst3 }
].forEach(({ m, inst }) => {
    const paymentsForInst = payments.filter(p => p.chits_installment_id === inst.id);
    const history = paymentsForInst
        .filter(p => {
            const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
            if (payerId && payerId !== Number(subscriber_id)) return false;

            if (p.collection_agent_amount_id && p.collection_submission) {
                const subId = p.collection_agent_amount_id;
                const subPayments = payments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                if (subPayments.length > 1) {
                    const instMap = {};
                    subPayments.forEach(sp => {
                        const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                        if (matchedInst) {
                            instMap[String(sp.chits_installment_id)] = matchedInst.installment_no;
                        }
                    });

                    let earliestInstId = null;
                    let minInstNo = Infinity;
                    Object.entries(instMap).forEach(([instId, instNo]) => {
                        if (instNo < minInstNo) {
                            minInstNo = instNo;
                            earliestInstId = instId;
                        }
                    });

                    if (inst && String(earliestInstId) !== String(inst.id)) {
                        return false;
                    }
                }
            }

            return true;
        })
        .map((p) => {
            let pReceived = parseFloat(p.received_amount) || 0.00;
            if (p.collection_agent_amount_id && p.collection_submission) {
                const subId = p.collection_agent_amount_id;
                const subPayments = payments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                if (subPayments.length > 1) {
                    const instMap = {};
                    subPayments.forEach(sp => {
                        const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                        if (matchedInst) {
                            instMap[String(sp.chits_installment_id)] = matchedInst.installment_no;
                        }
                    });

                    let earliestInstId = null;
                    let minInstNo = Infinity;
                    Object.entries(instMap).forEach(([instId, instNo]) => {
                        if (instNo < minInstNo) {
                            minInstNo = instNo;
                            earliestInstId = instId;
                        }
                    });

                    if (inst && String(earliestInstId) === String(inst.id)) {
                        const totalSubReceived = parseFloat(p.collection_submission.received_amount);
                        if (!isNaN(totalSubReceived) && totalSubReceived > 0) {
                            pReceived = totalSubReceived;
                        }
                    }
                }
            }

            return {
                id: p.id,
                receipt_number: p.receipt_number,
                received_amount: pReceived
            };
        });

    console.log(`Month ${m} Payment History:`, history);
});
