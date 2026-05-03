'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('upcoming_chits', 'chit_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });
    await queryInterface.addColumn('upcoming_chits', 'remarks', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('upcoming_chits', 'chit_amount');
    await queryInterface.removeColumn('upcoming_chits', 'remarks');
  }
};
