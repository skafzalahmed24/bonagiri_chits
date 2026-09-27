'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('companies', 'late_join_grace_days', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 15,
      }, { transaction });

      await queryInterface.addColumn('enrollments', 'late_join_penalty_type', {
        type: Sequelize.INTEGER,
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('enrollments', 'late_join_penalty_amount', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
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
      await queryInterface.removeColumn('companies', 'late_join_grace_days', { transaction });
      await queryInterface.removeColumn('enrollments', 'late_join_penalty_type', { transaction });
      await queryInterface.removeColumn('enrollments', 'late_join_penalty_amount', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
