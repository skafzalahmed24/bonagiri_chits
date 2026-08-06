'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('collection_agent_amounts', 'received_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('collection_agent_amounts', 'received_amount');
  }
};
