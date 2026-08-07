const { Sequelize } = require('sequelize');
const config = require('../config/config.js')['development']; 

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  logging: false,
});

async function listStaff() {
  try {
    const [results] = await sequelize.query("SELECT * FROM staff_user LIMIT 10");
    console.log('Staff Users:', results);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

listStaff();
