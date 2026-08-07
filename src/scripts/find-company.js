const { Sequelize } = require('sequelize');
const config = require('../config/config.js')['development']; 

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  logging: false,
});

async function findCompany() {
  try {
    const [results] = await sequelize.query("SELECT * FROM companies WHERE company_id = '269111'");
    if (results.length > 0) {
      console.log('Company Found:', results[0]);
    } else {
      console.log('Company 269111 not found.');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

findCompany();
