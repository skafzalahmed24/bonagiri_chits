'use strict';

/**
 * Denomination entry: ChitCare also counts Rs5, Rs2 and Rs1 (tester sheet, owner OK 2026-11-02;
 * transactions-chitcare-parity spec 4 B7, rows 10-12). Three new columns, same shape as notes_500 ... notes_10:
 * INTEGER NOT NULL DEFAULT 0.
 *
 * Additive only: no existing row, column or number changes. Every saved count reads back with notes_5 / notes_2 / notes_1
 * = 0, and its total_amount stays as it was (the new notes add 0). Office-only table (denomination/* routes need
 * T_DENOMINATIONS): not read by either mobile app.
 *
 * Run this BEFORE the code that reads the columns (model + suretyDenominationService); old code ignores them.
 * Safe to run twice: a column that already exists is skipped.
 * down drops the three columns: after live use that loses the Rs5/2/1 counts already saved (copy them out first, owner approval).
 */
const COLUMNS = ['notes_5', 'notes_2', 'notes_1'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const existing = await queryInterface.describeTable('cash_denominations');
      for (const name of COLUMNS) {
        if (existing[name]) continue;
        await queryInterface.addColumn(
          'cash_denominations',
          name,
          { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const existing = await queryInterface.describeTable('cash_denominations');
      for (const name of COLUMNS) {
        if (!existing[name]) continue;
        await queryInterface.removeColumn('cash_denominations', name, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
