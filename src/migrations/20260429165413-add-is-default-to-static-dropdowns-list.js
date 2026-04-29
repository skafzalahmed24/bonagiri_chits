'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('static_dropdowns_list', 'is_default', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('static_dropdowns_list', 'is_default');
  }
};
