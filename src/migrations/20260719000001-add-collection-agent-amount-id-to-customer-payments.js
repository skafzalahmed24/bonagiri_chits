'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('customer_payments', 'collection_agent_amount_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'collection_agent_amounts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('customer_payments', 'collection_agent_amount_id');
  }
};
