'use strict';

/**
 * Sureties collected in the field by collection agents (optional, per ticket).
 * Adds to the existing `sureties` table only — office Surety Entry rows keep working
 * unchanged (source defaults to 'office', documents stays null until someone ticks one).
 *
 * documents: { <document_type>: { status, rejection_reason?, updated_at, updated_by } }
 *   status 0 not submitted · 1 submitted (awaiting office review) · 2 rejected · 3 verified
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sureties');
    const transaction = await queryInterface.sequelize.transaction();
    try {
      if (!table.alternate_mobile_number) {
        await queryInterface.addColumn('sureties', 'alternate_mobile_number', { type: Sequelize.STRING, allowNull: true }, { transaction });
      }
      if (!table.documents) {
        await queryInterface.addColumn('sureties', 'documents', { type: Sequelize.JSON, allowNull: true }, { transaction });
      }
      if (!table.source) {
        await queryInterface.addColumn('sureties', 'source', {
          type: Sequelize.STRING(10), allowNull: false, defaultValue: 'office',
          comment: "Who added the surety: 'office' (Surety Entry) or 'agent' (collection agent app)",
        }, { transaction });
      }
      if (!table.added_by) {
        await queryInterface.addColumn('sureties', 'added_by', {
          type: Sequelize.INTEGER, allowNull: true, comment: 'Member id of the collection agent who added it',
        }, { transaction });
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const col of ['added_by', 'source', 'documents', 'alternate_mobile_number']) {
        await queryInterface.removeColumn('sureties', col, { transaction });
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
