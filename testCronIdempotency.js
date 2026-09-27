const { startDailyPenaltyCron, runGroupStatusJob } = require('./src/utils/cronJobs');
const { ChitsInstallment, sequelize } = require('./src/models');
const SystemSettingsService = require('./src/services/systemSettingsService');

const runTest = async () => {
  // force job to run once directly without schedule
  
  // mock cron so it returns immediately and executes function
  const cron = require('node-cron');
  const originalSchedule = cron.schedule;
  
  let cronFn = null;
  cron.schedule = (expr, fn) => {
    cronFn = fn;
  };
  
  startDailyPenaltyCron();
  
  console.log('--- Run 1 ---');
  await cronFn();
  
  // Check penalties
  const insts1 = await ChitsInstallment.findAll();
  const map1 = {};
  insts1.forEach(i => map1[i.id] = i.penalty_amount);
  
  console.log('--- Run 2 ---');
  await cronFn();
  
  const insts2 = await ChitsInstallment.findAll();
  let changed = false;
  insts2.forEach(i => {
    if (Number(map1[i.id]) !== Number(i.penalty_amount)) {
      console.error(`Mismatch for ${i.id}: ${map1[i.id]} -> ${i.penalty_amount}`);
      changed = true;
    }
  });
  
  if (!changed) console.log('Test passed: Penalty did not change on second run.');
  process.exit(0);
};

runTest().catch(console.error);
