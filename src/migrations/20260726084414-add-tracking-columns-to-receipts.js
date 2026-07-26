'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('customer_payments', 'recorded_by_id', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('customer_payments', 'recorded_by_role', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('customer_payments', 'recorded_by_name', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('collection_agent_amounts', 'verified_by_id', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('collection_agent_amounts', 'verified_by_role', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('collection_agent_amounts', 'verified_by_name', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('customer_payments', 'recorded_by_id');
    await queryInterface.removeColumn('customer_payments', 'recorded_by_role');
    await queryInterface.removeColumn('customer_payments', 'recorded_by_name');

    await queryInterface.removeColumn('collection_agent_amounts', 'verified_by_id');
    await queryInterface.removeColumn('collection_agent_amounts', 'verified_by_role');
    await queryInterface.removeColumn('collection_agent_amounts', 'verified_by_name');
  }
};
