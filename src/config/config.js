require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    // Money writes hold a row lock for the length of their transaction, so
    // connections are held longer than before; the Sequelize default of 5 is
    // exhausted by a handful of concurrent clerks/agents.
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: 0,
      acquire: 60000,
      idle: 10000
    }
  },
  test: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    // Money writes hold a row lock for the length of their transaction, so
    // connections are held longer than before; the Sequelize default of 5 is
    // exhausted by a handful of concurrent clerks/agents.
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: 0,
      acquire: 60000,
      idle: 10000
    }
  },
  production: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    // Money writes hold a row lock for the length of their transaction, so
    // connections are held longer than before; the Sequelize default of 5 is
    // exhausted by a handful of concurrent clerks/agents.
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: 0,
      acquire: 60000,
      idle: 10000
    }
  }
};
