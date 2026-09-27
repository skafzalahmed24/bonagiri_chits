'use strict';

/**
 * Joint enrollment: one ticket held by more than one member.
 * The enrollment's subscriber stays the main holder; the others are listed here.
 * Rows are never deleted: removing a holder sets removed_on and a reason, for audit.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('enrollment_joint_holders', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        company_id: { type: Sequelize.UUID, allowNull: false },
        enrollment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'enrollments', key: 'id' },
          onDelete: 'CASCADE',
        },
        member_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'member', key: 'id' },
        },
        share_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
        added_on: { type: Sequelize.DATEONLY, allowNull: false },
        removed_on: { type: Sequelize.DATEONLY, allowNull: true },
        removed_reason: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      }, { transaction });

      await queryInterface.addIndex('enrollment_joint_holders', ['enrollment_id'], { transaction });
      await queryInterface.addIndex('enrollment_joint_holders', ['member_id'], { transaction });

      // The main holder's share; 100 for an ordinary (single-holder) ticket.
      await queryInterface.addColumn('enrollments', 'main_holder_share', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 100,
      }, { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('enrollments', 'main_holder_share', { transaction });
      await queryInterface.dropTable('enrollment_joint_holders', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
