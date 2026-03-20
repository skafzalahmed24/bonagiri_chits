'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. First, update any existing records that have non-numeric other_info_user_code to NULL
    // This is to prevent errors when changing the column type to INTEGER.
    // In PostgreSQL, we use ~ for regex. !~ means "does not match".
    await queryInterface.sequelize.query(`
      UPDATE member 
      SET other_info_user_code = NULL 
      WHERE other_info_user_code IS NOT NULL AND other_info_user_code !~ '^[0-9]+$'
    `);

    // 2. Change the column type to INTEGER
    // In PostgreSQL, changing from VARCHAR to INTEGER requires a USING clause
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN other_info_user_code TYPE INTEGER 
      USING other_info_user_code::integer
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('member', 'other_info_user_code', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
