const { getEnrollmentHolders, getHolderInstallmentDues } = (() => {
    const getEnrollmentHolders = (enr) => {
        const holders = [];
        const mainSub = enr.subscriber;
        const jointList = (enr.joint_holders || []).filter(j => !j.removed_on);
        const jointTotalShare = jointList.reduce((sum, j) => sum + (parseFloat(j.share_percent) || 0), 0);
        const mainShare = parseFloat(enr.main_holder_share) || (jointList.length > 0 ? Math.max(0, 100 - jointTotalShare) : 100);
        if (mainSub) {
            holders.push({
                member: mainSub,
                member_id: mainSub.id,
                sharePercent: mainShare,
                shareRatio: mainShare / 100
            });
        }
        jointList.forEach(j => {
            if (j.member) {
                const share = parseFloat(j.share_percent) || 0;
                holders.push({
                    member: j.member,
                    member_id: j.member.id,
                    sharePercent: share,
                    shareRatio: share / 100
                });
            }
        });
        return holders;
    };

    const getHolderInstallmentDues = (inst, enrollment, holders, relatedPayments, simulatedNow = null) => {
        const totalPayable = parseFloat(inst.payable_amount) || 0;
        const totalInstPenalty = parseFloat(inst.penalty_amount) || 0;
        const isOverdue = simulatedNow && new Date(inst.due_date) < simulatedNow;

        return holders.map(h => {
            const holderPayable = totalPayable * h.shareRatio;
            const holderExpectedPenalty = isOverdue ? (totalInstPenalty * h.shareRatio) : 0;

            let holderReceived = 0;
            let holderPenaltyPaid = 0;

            relatedPayments.forEach(p => {
                const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
                const pRecv = parseFloat(p.received_amount) || 0;
                const pPen = parseFloat(p.penalty_paid) || 0;

                if (payerId != null) {
                    if (payerId === Number(h.member_id)) {
                        holderReceived += pRecv;
                        holderPenaltyPaid += pPen;
                    }
                } else {
                    if (holders.length === 1) {
                        holderReceived += pRecv;
                        holderPenaltyPaid += pPen;
                    } else {
                        holderReceived += pRecv * h.shareRatio;
                        holderPenaltyPaid += pPen * h.shareRatio;
                    }
                }
            });

            const holderPending = Math.max(0, holderPayable - holderReceived);
            const holderPenalty = Math.max(0, holderExpectedPenalty - holderPenaltyPaid);

            return {
                holder: h,
                payable: holderPayable,
                received: holderReceived,
                pending: holderPending,
                expectedPenalty: holderExpectedPenalty,
                penaltyPaid: holderPenaltyPaid,
                penalty: holderPenalty,
                isOverdue: isOverdue && holderPending > 0
            };
        });
    };

    return { getEnrollmentHolders, getHolderInstallmentDues };
})();

// Test mock setup
const enr = {
    id: 250,
    main_holder_share: "50.00",
    subscriber: { id: 87, name: 'Member 3' },
    joint_holders: [
        { member_id: 88, share_percent: "50.00", removed_on: null, member: { id: 88, name: 'Member 4' } }
    ]
};

const inst = {
    id: 'inst-1',
    payable_amount: '5000.00',
    penalty_amount: '100.00',
    due_date: '2026-10-01'
};

const holders = getEnrollmentHolders(enr);
console.log('Holders:', holders);

// Case 1: No payment
const dues1 = getHolderInstallmentDues(inst, enr, holders, [], new Date('2026-10-04'));
console.log('\nCase 1 (No payment):');
dues1.forEach(d => console.log(`  ${d.holder.member.name} (id ${d.holder.member_id}): Pending = ${d.pending}, Penalty = ${d.penalty}, Overdue = ${d.isOverdue}`));

// Case 2: Member 3 pays 500
const payments2 = [
    { received_amount: '500.00', penalty_paid: '0.00', collection_submission: { member_id: 87 } }
];
const dues2 = getHolderInstallmentDues(inst, enr, holders, payments2, new Date('2026-10-04'));
console.log('\nCase 2 (Member 3 paid 500):');
dues2.forEach(d => console.log(`  ${d.holder.member.name} (id ${d.holder.member_id}): Pending = ${d.pending}, Penalty = ${d.penalty}, Overdue = ${d.isOverdue}`));

// Case 3: Member 3 pays remaining 2000 (total 2500)
const payments3 = [
    { received_amount: '500.00', penalty_paid: '0.00', collection_submission: { member_id: 87 } },
    { received_amount: '2000.00', penalty_paid: '50.00', collection_submission: { member_id: 87 } }
];
const dues3 = getHolderInstallmentDues(inst, enr, holders, payments3, new Date('2026-10-04'));
console.log('\nCase 3 (Member 3 paid total 2500 + 50 penalty):');
dues3.forEach(d => console.log(`  ${d.holder.member.name} (id ${d.holder.member_id}): Pending = ${d.pending}, Penalty = ${d.penalty}, Overdue = ${d.isOverdue}`));

console.log('\nAll tests completed successfully!');
