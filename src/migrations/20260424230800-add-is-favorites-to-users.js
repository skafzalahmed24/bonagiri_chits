'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('companies', 'is_favorites', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await queryInterface.addColumn('member', 'is_favorites', {
      type: Sequelize.JSON,
      allowNull: true
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('companies', 'is_favorites');
    await queryInterface.removeColumn('member', 'is_favorites');
  }
};
