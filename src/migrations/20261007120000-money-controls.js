'use strict';

/**
 * Money flow batch 2 (docs/MONEY_FLOW_BATCH2_3.md):
 * - cancel instead of delete on the money tables (who, when, why);
 * - receipt reversal details on customer_payments;
 * - Bank Deposit source account (cash deposited from the office);
 * - an audit row for every admin override of Transaction Lock Days;
 * - per-company, per-financial-year receipt sequences.
 */
const CANCEL_TABLES = ['expenditures', 'outgoing_payments', 'self_transfers', 'borrow_repays', 'accounting_vouchers'];

async function addColumnIfMissing(queryInterface, table, column, spec) {
  const info = await queryInterface.describeTable(table);
  if (!info[column]) await queryInterface.addColumn(table, column, spec);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of CANCEL_TABLES) {
      await addColumnIfMissing(queryInterface, table, 'is_cancelled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
      await addColumnIfMissing(queryInterface, table, 'cancelled_at', { type: Sequelize.DATE, allowNull: true });
      await addColumnIfMissing(queryInterface, table, 'cancelled_by_id', { type: Sequelize.STRING, allowNull: true });
      await addColumnIfMissing(queryInterface, table, 'cancelled_by_name', { type: Sequelize.STRING, allowNull: true });
      await addColumnIfMissing(queryInterface, table, 'cancel_reason', { type: Sequelize.TEXT, allowNull: true });
    }

    await addColumnIfMissing(queryInterface, 'history_business_agents', 'cancelled_at', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'history_business_agents', 'cancelled_by_name', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing(queryInterface, 'history_business_agents', 'cancel_reason', { type: Sequelize.TEXT, allowNull: true });

    await addColumnIfMissing(queryInterface, 'customer_payments', 'reversed_at', { type: Sequelize.DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'customer_payments', 'reversed_by_name', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing(queryInterface, 'customer_payments', 'reverse_reason', { type: Sequelize.TEXT, allowNull: true });

    await addColumnIfMissing(queryInterface, 'accounting_vouchers', 'source_account_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'payment_accounts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    const tables = await queryInterface.showAllTables();
    if (!tables.includes('money_lock_overrides')) {
      await queryInterface.createTable('money_lock_overrides', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        company_id: { type: Sequelize.UUID, allowNull: false },
        entity: { type: Sequelize.STRING(40), allowNull: false },
        entity_id: { type: Sequelize.STRING, allowNull: true },
        action: { type: Sequelize.STRING(20), allowNull: false },
        entry_date: { type: Sequelize.DATEONLY, allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        user_id: { type: Sequelize.STRING, allowNull: true },
        user_name: { type: Sequelize.STRING, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('money_lock_overrides', ['company_id', 'entity']);
    }

    if (!tables.includes('receipt_sequences')) {
      await queryInterface.createTable('receipt_sequences', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        company_id: { type: Sequelize.UUID, allowNull: false },
        fin_year: { type: Sequelize.STRING(7), allowNull: false },
        last_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('receipt_sequences', ['company_id', 'fin_year'], { unique: true, name: 'receipt_sequences_company_fy' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('receipt_sequences').catch(() => {});
    await queryInterface.dropTable('money_lock_overrides').catch(() => {});
    const drop = async (table, column) => {
      const info = await queryInterface.describeTable(table);
      if (info[column]) await queryInterface.removeColumn(table, column);
    };
    await drop('accounting_vouchers', 'source_account_id');
    for (const c of ['reversed_at', 'reversed_by_name', 'reverse_reason']) await drop('customer_payments', c);
    for (const c of ['cancelled_at', 'cancelled_by_name', 'cancel_reason']) await drop('history_business_agents', c);
    for (const table of CANCEL_TABLES) {
      for (const c of ['is_cancelled', 'cancelled_at', 'cancelled_by_id', 'cancelled_by_name', 'cancel_reason']) await drop(table, c);
    }
  },
};
