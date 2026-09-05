'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('member');
    if (!tableInfo.country_code) {
      await queryInterface.addColumn('member', 'country_code', {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'IN'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('member');
    if (tableInfo.country_code) {
      await queryInterface.removeColumn('member', 'country_code');
    }
  }
};
