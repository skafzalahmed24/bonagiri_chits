const { Sequelize } = require('sequelize');
const config = require('./src/config/config.js');
const dbConfig = config.development;

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  dialect: dbConfig.dialect,
  logging: false
});

async function run() {
  try {
    const [results] = await sequelize.query(`
      DELETE FROM auctions
      WHERE id IN (
        SELECT id
        FROM (
          SELECT id,
          ROW_NUMBER() OVER( PARTITION BY group_id, bidder_id ORDER BY id ) as row_num
          FROM auctions
        ) t
        WHERE t.row_num > 1
      )
    `);
    
    const [results2] = await sequelize.query(`
      DELETE FROM auctions
      WHERE id IN (
        SELECT id
        FROM (
          SELECT id,
          ROW_NUMBER() OVER( PARTITION BY group_id, auction_number ORDER BY id ) as row_num
          FROM auctions
        ) t
        WHERE t.row_num > 1
      )
    `);
    console.log('Duplicates deleted successfully.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

run();
