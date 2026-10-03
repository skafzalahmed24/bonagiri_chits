const { SystemSettings, ChitsGroup, Enrollment, EnrollmentJointHolder, ChitsInstallment, CustomerPayment, Member, Auction } = require('../models');

async function check() {
  const settings = await SystemSettings.findOne();
  console.log('SystemSettings:', settings ? settings.toJSON() : 'None');

  const group = await ChitsGroup.findByPk('da367b64-9b7d-4497-be53-49c3052164b0');
  console.log('Group penalty settings:', {
    group_name: group?.group_name,
    penality_for_nps: group?.penality_for_nps,
    penality_for_ps: group?.penality_for_ps,
    status: group?.chits_group_status
  });

  const enrollments = await Enrollment.findAll({
    where: { group_id: 'da367b64-9b7d-4497-be53-49c3052164b0' },
    include: [
      { model: Member, as: 'subscriber' },
      { model: EnrollmentJointHolder, as: 'joint_holders', include: [{ model: Member, as: 'member' }] }
    ]
  });

  console.log('\nEnrollments count:', enrollments.length);
  for (const e of enrollments) {
    const jointInfo = (e.joint_holders || []).map(j => `${j.member?.name} (#${j.member_id}, share: ${j.share_percentage || j.share_percent}%)`).join(', ');
    console.log(`- Enrollment ID: ${e.id}, Pos: #${e.group_position_number}, Main: ${e.subscriber?.name} (#${e.subscriber_id}, share: ${e.main_holder_share}%), Joint: [${jointInfo}]`);
    
    const insts = await ChitsInstallment.findAll({
      where: { enrollment_id: e.id },
      order: [['installment_no', 'ASC']]
    });
    console.log('  Installments:');
    for (const inst of insts) {
      const payments = await CustomerPayment.findAll({ where: { chits_installment_id: inst.id } });
      const payStr = payments.map(p => `₹${p.received_amount} (status: ${p.payment_status}, penPaid: ${p.penalty_paid}, payer: ${p.payer_member_id})`).join(', ');
      console.log(`    Month ${inst.installment_no}: DueDate=${inst.due_date}, Payable=${inst.payable_amount}, Penalty=${inst.penalty_amount}, OverdueDays=${inst.over_due_days_count}, LastApplied=${inst.penalty_last_applied_date}, Payments=[${payStr}]`);
    }
  }

  const auctions = await Auction.findAll({ where: { group_id: 'da367b64-9b7d-4497-be53-49c3052164b0' }, order: [['auction_number', 'ASC']] });
  console.log('\nAuctions count:', auctions.length);
  for (const a of auctions) {
    console.log(`Auction ${a.auction_number}: net_payable=${a.net_payable}, dividend=${a.dividend}, dividend_inst=${a.dividend_installment_no}, ticket=${a.ticket_number}`);
  }
}

check().catch(console.error).finally(() => process.exit(0));
