const cron = require('node-cron');
const { ChitsInstallment, Enrollment, ChitsGroup, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getSimulatedNow } = require('./timeSimulator');

const startDailyPenaltyCron = () => {
  // Run every 1 minute for testing
  cron.schedule('* * * * *', async () => {
    console.log('\n[CRON] Starting Accelerated Penalty Calculation Job...');
    try {
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
              }
            ]
          }
        ]
      });

      let processedCount = 0;

      for (const installment of unpaidInstallments) {
        // Follow foreign-keys up the chain to the master root definition
        const group = installment.enrollment?.group;
        if (!group) continue;
        
        // Calculate simulated time for this specific group
        const simulatedNow = getSimulatedNow(group);
        simulatedNow.setHours(0, 0, 0, 0);
        
        const dueDate = new Date(installment.due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Check if overdue in simulated time
        if (dueDate < simulatedNow) {

        // Retrieve exactly what the admin specified for this exact root group
        const penaltyAmountPerDay = parseFloat(group.penality_for_nps) || 0;

        // Math: Add exactly 1 simulated day and physically stack the exact defined fraction incrementally limitlessly
        const newOverdueCount = (installment.over_due_days_count || 0) + 1;
        const newPenaltyAmount = parseFloat(installment.penalty_amount || 0) + penaltyAmountPerDay;

        await installment.update({
          over_due_days_count: newOverdueCount,
          penalty_amount: newPenaltyAmount
        });

        processedCount++;
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
