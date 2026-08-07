const { Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');
const config = require('../config/config.js')['development']; // Assuming development environment

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  logging: false,
});

async function fixPasswords() {
  try {
    const [results, metadata] = await sequelize.query('SELECT id, password FROM staff_user WHERE password NOT LIKE \'$2%\'');
    console.log(`Found ${results.length} plain text passwords.`);
    
    for (let staff of results) {
      const hashedPassword = await bcrypt.hash(staff.password, 10);
      await sequelize.query(`UPDATE staff_user SET password = '${hashedPassword}' WHERE id = '${staff.id}'`);
      console.log(`Updated password for staff user id: ${staff.id}`);
    }
    
    console.log('Finished updating plain text passwords.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

fixPasswords();
