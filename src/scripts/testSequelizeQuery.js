require('dotenv').config();
const { Sequelize, DataTypes, Op } = require('sequelize');

const sequelize = new Sequelize('postgres://postgres:Afz%40l123@127.0.0.1:5432/bcdev', { logging: console.log });

const Banner = sequelize.define('Banner', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  company_id: DataTypes.UUID,
  banner_image: DataTypes.STRING,
  banner_type: DataTypes.INTEGER,
  status: DataTypes.INTEGER,
  is_deleted_status: DataTypes.INTEGER,
  banner_start_date: DataTypes.DATEONLY,
  banner_end_date: DataTypes.DATEONLY
}, { tableName: 'banners', timestamps: true });

async function run() {
  const todayStr = '2026-10-02';
  const assignedBannerIds = [10, 8];
  const companyId = '61ea56a0-a9a6-40ce-abf5-ee9c1b834158';

  const andConditions = [];
  const typeConditions = [{ banner_type: 1 }];
  if (assignedBannerIds.length > 0) {
    typeConditions.push({
      banner_type: 2,
      id: { [Op.in]: assignedBannerIds }
    });
  }
  andConditions.push({ [Op.or]: typeConditions });

  if (companyId) {
    andConditions.push({
      [Op.or]: [
        { company_id: companyId },
        { company_id: null }
      ]
    });
  }

  const whereClause = {
    is_deleted_status: 0,
    status: 1,
    banner_start_date: { [Op.lte]: todayStr },
    banner_end_date: { [Op.gte]: todayStr },
    [Op.and]: andConditions
  };

  console.log('\n--- Where Clause Object: ---');
  console.log(JSON.stringify(whereClause, (key, value) => typeof value === 'symbol' ? value.toString() : value, 2));

  console.log('\n--- Executing findAndCountAll ---');
  try {
    const res = await Banner.findAndCountAll({
      where: whereClause,
      order: [['banner_start_date', 'DESC'], ['id', 'DESC']],
      attributes: ['id', 'company_id', 'banner_image', 'banner_type', 'status', 'banner_start_date', 'banner_end_date', 'createdAt'],
      limit: 10,
      offset: 0
    });
    console.log('Result count:', res.count, 'rows length:', res.rows.length);
  } catch(e) {
    console.error('Query error:', e);
  }

  process.exit(0);
}

run();
