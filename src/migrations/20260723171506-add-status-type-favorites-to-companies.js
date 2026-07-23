'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.addColumn('companies', 'status', {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      });
    } catch (e) {}
    
    try {
      await queryInterface.addColumn('companies', 'type', {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      });
    } catch (e) {}
    
    try {
      await queryInterface.addColumn('companies', 'is_favorites', {
        type: Sequelize.JSON,
        allowNull: true
      });
    } catch (e) {}
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('companies', 'status');
    await queryInterface.removeColumn('companies', 'type');
    await queryInterface.removeColumn('companies', 'is_favorites');
  }
};
