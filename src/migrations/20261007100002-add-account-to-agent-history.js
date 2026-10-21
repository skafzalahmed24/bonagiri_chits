'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('history_business_agents', 'account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'payment_accounts',
          key: 'id'
        },
        onDelete: 'RESTRICT'
      }, { transaction });

      await queryInterface.addColumn('history_business_agents', 'payment_mode', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('history_business_agents', 'paid_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      }, { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('history_business_agents', 'account_id', { transaction });
      await queryInterface.removeColumn('history_business_agents', 'payment_mode', { transaction });
      await queryInterface.removeColumn('history_business_agents', 'paid_date', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
