const { getEnrollmentHolders, getHolderInstallmentDues } = require('../services/userService');

// Setup mock enrollments for Member 2 (Tickets #03 and #04)
const enrollment1 = { id: 248, group_position_number: 3, subscriber_id: 85, subscriber: { id: 85, name: 'Member 2' }, joint_holders: [] };
const enrollment2 = { id: 249, group_position_number: 4, subscriber_id: 85, subscriber: { id: 85, name: 'Member 2' }, joint_holders: [] };
const userEnrollments = [enrollment1, enrollment2];

// 6 Months of installments for both tickets
const allUserInstallments = [];
for (let m = 1; m <= 6; m++) {
    allUserInstallments.push({ id: `inst_248_${m}`, enrollment_id: 248, installment_no: m, payable_amount: 5000, penalty_amount: 0, due_date: `2026-${String(m + 9).padStart(2, '0')}-05` });
    allUserInstallments.push({ id: `inst_249_${m}`, enrollment_id: 249, installment_no: m, payable_amount: 5000, penalty_amount: 0, due_date: `2026-${String(m + 9).padStart(2, '0')}-05` });
}

// User payments
const userPayments = [
    // Month 1 payments
    { id: 'p_m1_1', chits_installment_id: 'inst_248_1', received_amount: 5000, penalty_paid: 0, receipt_number: 'RCT-2026-000069', payment_status: 1 },
    { id: 'p_m1_2', chits_installment_id: 'inst_249_1', received_amount: 5000, penalty_paid: 0, receipt_number: 'RCT-2026-000063', payment_status: 1 },
    
    // Month 2 submission of 11,000 (split across 3 installments: #03 M2 (5000), #04 M2 (5000), #04 M3 (1000))
    { id: 'p_m2_1', chits_installment_id: 'inst_249_2', received_amount: 5000, penalty_paid: 0, receipt_number: 'RCT-2026-000079', collection_agent_amount_id: 'sub_11000', collection_submission: { id: 'sub_11000', member_id: 85, received_amount: 11000 }, payment_status: 0 },
    { id: 'p_m2_2', chits_installment_id: 'inst_248_2', received_amount: 5000, penalty_paid: 0, receipt_number: 'RCT-2026-000080', collection_agent_amount_id: 'sub_11000', collection_submission: { id: 'sub_11000', member_id: 85, received_amount: 11000 }, payment_status: 0 },
    { id: 'p_m3_1', chits_installment_id: 'inst_249_3', received_amount: 1000, penalty_paid: 0, receipt_number: 'RCT-2026-000081', collection_agent_amount_id: 'sub_11000', collection_submission: { id: 'sub_11000', member_id: 85, received_amount: 11000 }, payment_status: 0 }
];

// Auction #2
const auctions = [
    {
        id: 'auc_2',
        auction_number: 2,
        bid_amount: 25000,
        dividend: 3230,
        net_payable: 4461.67,
        dividend_installment_no: 3,
        subscription_amount: 5000
    }
];

function dividendMonthOf(auction) {
    return auction ? (auction.dividend_installment_no != null ? Number(auction.dividend_installment_no) : Number(auction.auction_number)) : null;
}

const subscriber_id = 85;
const totalMembersCount = 6;
const defaultInstAmt = 5000;
const simulatedNow = new Date('2026-10-05');

console.log('=== RUNNING SIMULATION FOR CHIT GROUP 2 ===\n');

for (let m = 1; m <= 6; m++) {
    const auction = auctions.find(a => a.auction_number === m);
    const dividendAuction = auctions.find(a => dividendMonthOf(a) === m);
    const originalAmountPerTicket = defaultInstAmt;

    let profitAmountPerTicket = 0.00;
    const matchingInstallment = allUserInstallments.find(inst => inst.installment_no === m);

    if (dividendAuction) {
        if (dividendAuction.net_payable && parseFloat(dividendAuction.net_payable) > 0) {
            const netPayable = parseFloat(dividendAuction.net_payable);
            profitAmountPerTicket = Math.max(0, originalAmountPerTicket - netPayable);
        } else if (dividendAuction.dividend && parseFloat(dividendAuction.dividend) > 0) {
            const divVal = parseFloat(dividendAuction.dividend);
            const count = totalMembersCount || 6;
            const divPerMember = divVal < originalAmountPerTicket ? divVal : (divVal / count);
            profitAmountPerTicket = Math.max(0, divPerMember);
        } else if (matchingInstallment) {
            const payableVal = parseFloat(matchingInstallment.payable_amount);
            profitAmountPerTicket = Math.max(0, originalAmountPerTicket - (Number.isNaN(payableVal) ? originalAmountPerTicket : payableVal));
        }
    } else if (matchingInstallment) {
        const payableVal = parseFloat(matchingInstallment.payable_amount) || 0.00;
        if (payableVal > 0 && payableVal < originalAmountPerTicket) {
            profitAmountPerTicket = Math.max(0, originalAmountPerTicket - payableVal);
        }
    }

    const payableAmountPerTicket = Math.max(0, originalAmountPerTicket - profitAmountPerTicket);

    let monthOriginalTotal = 0;
    let monthProfitTotal = 0;
    let monthPayableTotal = 0;
    let monthPaidTotal = 0;
    let monthPendingTotal = 0;
    let monthAdvanceTotal = 0;

    const memberBreakdown = [];

    for (const ge of userEnrollments) {
        const geInstallment = allUserInstallments.find(i => i.enrollment_id === ge.id && i.installment_no === m);
        const ticketOriginal = originalAmountPerTicket;
        const ticketProfit = profitAmountPerTicket;
        const ticketPayable = payableAmountPerTicket;

        const holders = getEnrollmentHolders(ge);
        const paymentsForInst = geInstallment
            ? userPayments.filter(p => p.chits_installment_id === geInstallment.id)
            : [];

        const holderDues = geInstallment
            ? getHolderInstallmentDues(geInstallment, ge, holders, paymentsForInst, simulatedNow, ticketPayable)
            : holders.map(h => ({ holder: h, payable: ticketPayable, received: 0, pending: ticketPayable, penalty: 0 }));

        const myDue = holderDues.find(d => Number(d.holder.member_id) === Number(subscriber_id)) || holderDues[0];

        const ticketPaymentHistory = paymentsForInst
            .filter(p => {
                const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
                if (payerId && payerId !== Number(subscriber_id)) return false;

                if (p.collection_agent_amount_id && p.collection_submission) {
                    const subId = p.collection_agent_amount_id;
                    const subPayments = userPayments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                    if (subPayments.length > 1) {
                        let minInstNo = Infinity;
                        subPayments.forEach(sp => {
                            const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                            if (matchedInst && matchedInst.installment_no < minInstNo) {
                                minInstNo = matchedInst.installment_no;
                            }
                        });

                        if (geInstallment && geInstallment.installment_no > minInstNo) {
                            return false;
                        }
                    }
                }
                return true;
            })
            .map(p => {
                let pReceived = parseFloat(p.received_amount) || 0.00;
                if (p.collection_agent_amount_id && p.collection_submission) {
                    const subId = p.collection_agent_amount_id;
                    const subPayments = userPayments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                    if (subPayments.length > 1) {
                        let minInstNo = Infinity;
                        subPayments.forEach(sp => {
                            const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                            if (matchedInst && matchedInst.installment_no < minInstNo) {
                                minInstNo = matchedInst.installment_no;
                            }
                        });

                        if (geInstallment && geInstallment.installment_no === minInstNo) {
                            const ticketSubPayments = subPayments.filter(sp => {
                                const inst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                return inst && inst.enrollment_id === ge.id;
                            });
                            const totalForTicket = ticketSubPayments.reduce((sum, sp) => sum + (parseFloat(sp.received_amount) || 0), 0);
                            if (totalForTicket > 0) {
                                pReceived = totalForTicket;
                            }
                        }
                    }
                }
                return { receipt: p.receipt_number, received_amount: pReceived };
            });

        const ticketSubPaid = paymentsForInst.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
        const ticketPending = Math.max(0, ticketPayable - ticketSubPaid);

        const calculateHolderAdvance = (holder, hDueInst) => {
            if (!geInstallment || !hDueInst) return 0;
            const directOverpayment = Math.max(0, hDueInst.received - hDueInst.payable);

            let submissionAdvance = 0;
            const hPayments = paymentsForInst.filter(p => {
                const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
                return !payerId || payerId === Number(holder.member_id);
            });

            hPayments.forEach(p => {
                if (p.collection_agent_amount_id && p.collection_submission) {
                    const subId = p.collection_agent_amount_id;
                    const subPayments = userPayments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                    if (subPayments.length > 1) {
                        let minInstNo = Infinity;
                        subPayments.forEach(sp => {
                            const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                            if (matchedInst && matchedInst.installment_no < minInstNo) {
                                minInstNo = matchedInst.installment_no;
                            }
                        });

                        if (geInstallment.installment_no === minInstNo) {
                            const futurePayments = subPayments.filter(sp => {
                                const spInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                return spInst && spInst.installment_no > minInstNo && spInst.enrollment_id === ge.id;
                            });
                            const carriedForward = futurePayments.reduce((sum, sp) => sum + (parseFloat(sp.received_amount) || 0), 0);
                            submissionAdvance += carriedForward;
                        }
                    }
                }
            });

            return Math.max(directOverpayment, submissionAdvance);
        };

        const myAdvance = myDue ? calculateHolderAdvance(myDue.holder, myDue) : 0;

        monthOriginalTotal += ticketOriginal;
        monthProfitTotal += ticketProfit;
        monthPayableTotal += ticketPayable;
        monthPaidTotal += ticketSubPaid;
        monthPendingTotal += ticketPending;
        monthAdvanceTotal += myAdvance;

        memberBreakdown.push({
            ticket: ge.id === 248 ? '#03' : '#04',
            original: ticketOriginal,
            profit: ticketProfit,
            payable: ticketPayable,
            paid: ticketSubPaid,
            pending: ticketPending,
            advance: myAdvance,
            history: ticketPaymentHistory
        });
    }

    console.log(`Month ${m}:`);
    console.log(`  Summary: Original=${monthOriginalTotal}, Profit=${monthProfitTotal.toFixed(2)}, Payable=${monthPayableTotal.toFixed(2)}, Paid=${monthPaidTotal}, Pending=${monthPendingTotal.toFixed(2)}, Advance=${monthAdvanceTotal}`);
    console.log(`  Tickets:`, JSON.stringify(memberBreakdown, null, 2));
    console.log('');
}
