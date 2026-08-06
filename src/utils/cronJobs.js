const cron = require('node-cron');
const { ChitsInstallment, Enrollment, ChitsGroup, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getSimulatedNow } = require('./timeSimulator');
const fcmService = require('../services/fcmService');
const SystemSettingsService = require('../services/systemSettingsService');

const startDailyPenaltyCron = () => {
  // Run every 1 minute for testing
  cron.schedule('* * * * *', async () => {
    try {
      const settings = await SystemSettingsService.getSettings();
      if (settings.scheduler_mode === 'MANUAL') return; // Skip automatic execution

      console.log('\n[CRON] Starting Accelerated Penalty Calculation Job...');
      // Fetch all purely unpaid installment records organically across the DB
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
              {
                model: ChitsGroup,
                as: 'group'
              },
              {
                model: sequelize.models.Member,
                as: 'subscriber'
              }
            ]
          }
        ]
      });

      let processedCount = 0;
      const winnerCache = {};

      for (const installment of unpaidInstallments) {
        // Follow foreign-keys up the chain to the master root definition
        const group = installment.enrollment?.group;
        if (!group) continue;
        
        const subscriberId = installment.enrollment?.subscriber?.id;
        let isWinner = false;
        if (subscriberId) {
          const cacheKey = `${group.id}_${subscriberId}`;
          if (winnerCache[cacheKey] !== undefined) {
             isWinner = winnerCache[cacheKey];
          } else {
             const auctionWin = await sequelize.models.Auction.findOne({
               where: { group_id: group.id, bidder_id: subscriberId }
             });
             isWinner = !!auctionWin;
             winnerCache[cacheKey] = isWinner;
          }
        }
        
        // Calculate simulated time globally
        const simulatedNow = await getSimulatedNow();
        simulatedNow.setHours(0, 0, 0, 0);
        
        const dueDate = new Date(installment.due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Check if overdue in simulated time
        if (dueDate < simulatedNow) {

        // Retrieve exactly what the admin specified for this exact root group
        const penaltyAmountPerDay = isWinner
          ? (parseFloat(group.penality_for_ps) || 0)
          : (parseFloat(group.penality_for_nps) || 0);

        // Math: Add exactly 1 simulated day and physically stack the exact defined fraction incrementally limitlessly
        const newOverdueCount = (installment.over_due_days_count || 0) + 1;
        const newPenaltyAmount = parseFloat(installment.penalty_amount || 0) + penaltyAmountPerDay;

        await installment.update({
          over_due_days_count: newOverdueCount,
          penalty_amount: newPenaltyAmount
        });

        // Send FCM Notification on first day of overdue
        if (newOverdueCount === 1) {
          const subscriber = installment.enrollment?.subscriber;
          if (subscriber && subscriber.fcm_token) {
            fcmService.sendPushToMember(
              subscriber,
              'Payment Overdue!',
              `Your payment for Chit ${group.chit_group_name} is overdue. A penalty has been applied.`,
              { type: 'PAYMENT_OVERDUE', group_id: String(group.id) }
            );
          }
        }

        processedCount++;
        } else if (dueDate.getTime() === simulatedNow.getTime() + 86400000) {
          // Due tomorrow
          const subscriber = installment.enrollment?.subscriber;
          if (subscriber && subscriber.fcm_token) {
            // Note: In a production environment with cron running every minute, 
            // a database flag (e.g. notified_due_date) is needed to prevent spam.
            // For now, it will fire based on the simulated time loop.
            fcmService.sendPushToMember(
              subscriber,
              'Payment Due Tomorrow',
              `Friendly reminder: Your payment for Chit ${group.chit_group_name} is due tomorrow.`,
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

module.exports = { startDailyPenaltyCron };
