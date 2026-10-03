const cron = require('node-cron');
const { ChitsInstallment, Enrollment, ChitsGroup, sequelize } = require('../models');
const { Op } = require('sequelize');
const fcmService = require('../services/fcmService');
const SystemSettingsService = require('../services/systemSettingsService');
const { dailyPenaltyFor } = require('./penalty');
const { isTicketPrized, holderMembersOf } = require('./jointHolders');

const runGroupStatusJob = async () => {
  try {
    const bDate = await SystemSettingsService.getBusinessDate();
    const yyyy = bDate.getFullYear();
    const mm = String(bDate.getMonth() + 1).padStart(2, '0');
    const dd = String(bDate.getDate()).padStart(2, '0');
    const businessDateStr = `${yyyy}-${mm}-${dd}`;
    // Use businessDateStr (YYYY-MM-DD) directly for comparisons

    const upcomingGroups = await ChitsGroup.findAll({ where: { chits_group_status: 0, is_deleted_status: 0 } });
    for (const group of upcomingGroups) {
      const startStr = group.commencement_date || group.chit_start_date;
      if (!startStr) continue;
      
      const startDateStr = startStr.split('T')[0];
      
      if (startDateStr <= businessDateStr) {
        await group.update({ chits_group_status: 1 });
        const enrollments = await Enrollment.findAll({
          where: { group_id: group.id, delete_status: 0, company_id: group.company_id },
          attributes: ['id']
        });
        const members = (await holderMembersOf(enrollments.map((e) => e.id))).filter((m) => m.fcm_token);
        if (members.length > 0) {
          const groupName = group.group_name || 'Chit Group';
          fcmService.sendPushToMulticast(members, group.company_id, 'Chit Group Commenced!', `The Chit Group ${groupName} has officially commenced.`, { type: 'GROUP_STARTED', group_id: String(group.id) });
        }
      }
    }
  } catch (error) {
    console.error('[CRON] Error in runGroupStatusJob:', error);
  }
};

// Prize status belongs to the ticket: a ticket won by any of its holders is prized.
const isPrizedEnrollment = (enrollment) => isTicketPrized(enrollment);

const startDailyPenaltyCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const settings = await SystemSettingsService.getSettings();
      if (settings.scheduler_mode === 'MANUAL') return;

      await runGroupStatusJob();

      console.log('\n[CRON] Starting Accelerated Penalty Calculation Job...');
      
      const bDate = await SystemSettingsService.getBusinessDate();
      const byyyy = bDate.getFullYear();
      const bmm = String(bDate.getMonth() + 1).padStart(2, '0');
      const bdd = String(bDate.getDate()).padStart(2, '0');
      const businessDateStr = `${byyyy}-${bmm}-${bdd}`; // YYYY-MM-DD
      const DStr = businessDateStr;
      const [y, m, d] = DStr.split('-');
      const D_UTC = Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d));

      const unpaidInstallments = await ChitsInstallment.findAll({
        where: {
          id: {
            [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
          }
        },
        include: [
          {
            model: Enrollment,
            as: 'enrollment',
            include: [
              { model: ChitsGroup, as: 'group' },
              { model: sequelize.models.Member, as: 'subscriber' }
            ]
          }
        ]
      });

      let processedCount = 0;
      const winnerCache = {};

      for (const installment of unpaidInstallments) {
        const group = installment.enrollment?.group;
        if (!group) continue;
        
        const pendingPayment = await sequelize.models.CustomerPayment.findOne({
          where: { chits_installment_id: installment.id, payment_status: 0 }
        });

        if (pendingPayment) {
          if (installment.penalty_last_applied_date !== DStr) {
             await installment.update({ penalty_last_applied_date: DStr });
          }
          continue;
        }

        let startStr = installment.due_date;
        if (installment.penalty_from_date && installment.penalty_from_date > startStr) {
          startStr = installment.penalty_from_date;
        }
        if (installment.penalty_last_applied_date && installment.penalty_last_applied_date > startStr) {
          startStr = installment.penalty_last_applied_date;
        }

        const [sy, sm, sd] = startStr.split('T')[0].split('-');
        const start_UTC = Date.UTC(parseInt(sy), parseInt(sm) - 1, parseInt(sd));

        const days = Math.floor((D_UTC - start_UTC) / (1000 * 60 * 60 * 24));

        if (days > 0) {
          const cacheKey = installment.enrollment.id;
          if (winnerCache[cacheKey] === undefined) {
            winnerCache[cacheKey] = await isPrizedEnrollment(installment.enrollment);
          }
          const isWinner = winnerCache[cacheKey];

          const rate = dailyPenaltyFor(group, isWinner, installment.payable_amount);
          const newOverdueCount = (installment.over_due_days_count || 0) + days;
          const newPenaltyAmount = parseFloat(installment.penalty_amount || 0) + (days * rate);

          await installment.update({
            over_due_days_count: newOverdueCount,
            penalty_amount: newPenaltyAmount,
            penalty_last_applied_date: DStr
          });

          // Send FCM Notification on first day of overdue (we approximate this by checking if it was previously not overdue)
          if ((installment.over_due_days_count || 0) === 0) {
            const groupName = group.group_name || 'Chit Group';
            const holders = await holderMembersOf([installment.enrollment.id]);
            for (const subscriber of holders.filter((h) => h.fcm_token)) {
              fcmService.sendPushToMember(
                subscriber,
                'Payment Overdue!',
                `Your payment for Chit ${groupName} is overdue. A penalty has been applied.`,
                { type: 'PAYMENT_OVERDUE', group_id: String(group.id) }
              );
            }
          }

          processedCount++;
        } else if (days === -1) {
          // Due tomorrow
          const groupName = group.group_name || 'Chit Group';
          const holders = await holderMembersOf([installment.enrollment.id]);
          for (const subscriber of holders.filter((h) => h.fcm_token)) {
            fcmService.sendPushToMember(
              subscriber,
              'Payment Due Tomorrow',
              `Friendly reminder: Your payment for Chit ${groupName} is due tomorrow.`,
              { type: 'PAYMENT_DUE_REMINDER', group_id: String(group.id) }
            );
          }
        }
      }

      console.log(`[CRON] Accelerated Penalty Job Complete. Applied mathematics to ${processedCount} physical DB records.\n`);

    } catch (error) {
      console.error('[CRON] Error executing Daily Penalty Job algorithm:', error);
    }
  });
  
  console.log('[CRON] Background Penalty calculation scheduler initialized & actively listening.');
};

module.exports = { startDailyPenaltyCron, runGroupStatusJob };
