const cron = require('node-cron');
const { ChitsInstallment, Enrollment, ChitsGroup, sequelize } = require('../models');
const { Op } = require('sequelize');

const startDailyPenaltyCron = () => {
  // 0 0 * * * = Run exactly at midnight server-time every day
  cron.schedule('0 0 * * *', async () => {
    console.log('\n[CRON] Starting Daily Penalty Calculation Job...');
    try {
      // Normalize 'today' to purely isolate the date barrier
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find all purely overdue AND unpaid installment records organically across the DB
      const overdueInstallments = await ChitsInstallment.findAll({
        where: {
          due_date: {
            [Op.lt]: today
          },
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
              }
            ]
          }
        ]
      });

      console.log(`[CRON] Found ${overdueInstallments.length} overdue installment rows awaiting dynamic tracking.`);

      let processedCount = 0;

      for (const installment of overdueInstallments) {
        // Follow foreign-keys up the chain to the master root definition
        const group = installment.enrollment?.group;
        if (!group) continue;

        // Retrieve exactly what the admin specified for this exact root group
        const penaltyAmountPerDay = parseFloat(group.penality_for_nps) || 0;

        // Math: Add exactly 1 day and physically stack the exact defined fraction incrementally limitlessly
        const newOverdueCount = (installment.over_due_days_count || 0) + 1;
        const newPenaltyAmount = parseFloat(installment.penalty_amount || 0) + penaltyAmountPerDay;

        await installment.update({
          over_due_days_count: newOverdueCount,
          penalty_amount: newPenaltyAmount
        });

        processedCount++;
      }

      console.log(`[CRON] Daily Penalty Job Complete. Applied mathematics to ${processedCount} physical DB records.\n`);

    } catch (error) {
      console.error('[CRON] Error executing Daily Penalty Job algorithm:', error);
    }
  });
  
  console.log('[CRON] Background Penalty calculation scheduler initialized & actively listening.');
};

module.exports = { startDailyPenaltyCron };
