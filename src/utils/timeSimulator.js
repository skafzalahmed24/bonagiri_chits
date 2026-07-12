const getSimulatedNow = (group) => {
  const realNow = new Date();
  
  // If we don't have group creation date, return real time
  if (!group || !group.createdAt) {
    return realNow;
  }

  const createdAt = new Date(group.createdAt);
  
  // Calculate real time elapsed since group creation (in milliseconds)
  const elapsedRealTime = realNow.getTime() - createdAt.getTime();
  
  // Multiply elapsed time by 1440
  // 1 real minute (60,000 ms) becomes 1 simulated day (86,400,000 ms)
  // 30 real minutes (1,800,000 ms) becomes 30 simulated days (~1 month)
  const elapsedSimulatedTime = elapsedRealTime * 1440;
  
  // The simulated "now" is the creation time + the accelerated elapsed time
  const simulatedTime = new Date(createdAt.getTime() + elapsedSimulatedTime);
  
  console.log(`\n[TimeSimulator] Group ID: ${group.id}`);
  console.log(`  -> Real Date:      ${realNow.toLocaleString()}`);
  console.log(`  -> Simulated Date: ${simulatedTime.toLocaleString()}`);
  
  return simulatedTime;
};

module.exports = { getSimulatedNow };
