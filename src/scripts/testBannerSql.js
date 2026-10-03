require('dotenv').config();
const { sequelize, Banner, AssignedBannerToPeople, Member, SystemSettings } = require('../models');
const { Op } = require('sequelize');
const SystemSettingsService = require('../services/systemSettingsService');

async function testQuery() {
  await sequelize.authenticate();
  console.log('Connected to DB');

  const simulatedNow = new Date(await SystemSettingsService.getBusinessDate());
  const year = simulatedNow.getFullYear();
  const month = String(simulatedNow.getMonth() + 1).padStart(2, '0');
  const day = String(simulatedNow.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  console.log('Simulated Date:', simulatedNow, 'todayStr:', todayStr);

  const subscriberId = 50;
  const companyId = '61ea56a0-a9a6-40ce-abf5-ee9c1b834158';

  const assignedRecords = await AssignedBannerToPeople.findAll({
    where: { subscriber_id: subscriberId },
    attributes: ['assigned_banner_id']
  });
  const assignedBannerIds = assignedRecords.map(r => r.assigned_banner_id);
  console.log('Assigned Banner IDs for sub 50:', assignedBannerIds);

  const allBanners = await Banner.findAll({
    where: { is_deleted_status: 0 }
  });
  console.log('All non-deleted banners in DB:', allBanners.map(b => ({
    id: b.id,
    type: b.banner_type,
    start: b.banner_start_date,
    end: b.banner_end_date,
    status: b.status,
    company_id: b.company_id
  })));

  // Test getBannersForSubscriberHelper query
  const typeConditions = [{ banner_type: 1 }];
  if (assignedBannerIds.length > 0) {
    typeConditions.push({
      banner_type: 2,
      id: { [Op.in]: assignedBannerIds }
    });
  }

  const helperWhere = {
    is_deleted_status: 0,
    status: 1,
    banner_start_date: { [Op.lte]: todayStr },
    banner_end_date: { [Op.gte]: todayStr },
    [Op.or]: typeConditions
  };
  if (companyId) {
    helperWhere[Op.and] = [
      {
        [Op.or]: [
          { company_id: companyId },
          { company_id: null }
        ]
      }
    ];
  }

  console.log('\n--- Running Helper Query with logging ---');
  const helperResults = await Banner.findAll({
    where: helperWhere,
    logging: (sql) => console.log('SQL Generated:\n', sql)
  });
  console.log('Helper query results count:', helperResults.length);
  console.log('Helper results:', helperResults.map(b => ({ id: b.id, type: b.banner_type })));

  process.exit(0);
}

testQuery().catch(err => {
  console.error(err);
  process.exit(1);
});
