const SystemSettingsService = require('../services/systemSettingsService');

const getSimulatedNow = async (group) => {
  // We no longer use group-specific simulated time
  // Instead, we fetch the global business date from system settings
  try {
    const businessDate = await SystemSettingsService.getBusinessDate();
    
    console.log(`\n[TimeSimulator]`);
    console.log(`  -> Real Date:      ${new Date().toLocaleString()}`);
    console.log(`  -> Simulated Date: ${businessDate.toLocaleString()}`);
    
    return businessDate;
  } catch (error) {
    console.error('Error fetching simulated date, falling back to real date', error);
    return new Date();
  }
};

module.exports = { getSimulatedNow };
