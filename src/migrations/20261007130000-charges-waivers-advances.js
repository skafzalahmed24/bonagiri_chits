'use strict';

/**
 * Money flow batch 3 (docs/MONEY_FLOW_BATCH2_3.md):
 * - ticket_charges: dues of a ticket besides instalments (enrollment fee, notice, cheque return, other);
 * - receipt_charge_lines: which charges a receipt paid, and how much;
 * - customer_payments.charges_amount: the charge part of a receipt (its split covers it);
 * - penalty_waivers: penalty forgiven by the admin, with a reason;
 * - member_advances: receipt number and who took it, for advances at the counter;
 * - advance_refunds: unused advance paid back out of an account.
 */
async function addColumnIfMissing(queryInterface, table, column, spec) {
  const info = await queryInterface.describeTable(table);
  if (!info[column]) await queryInterface.addColumn(table, column, spec);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };

    if (!tables.includes('ticket_charges')) {
      await queryInterface.createTable('ticket_charges', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        company_id: { type: Sequelize.UUID, allowNull: false },
        enrollment_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'enrollments', key: 'id' }, onDelete: 'RESTRICT' },
        charge_type: { type: Sequelize.STRING(20), allowNull: false },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        charge_date: { type: Sequelize.DATEONLY, allowNull: false },
        paid_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        waived_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
        reason: { type: Sequelize.TEXT, allowNull: true },
        source_ref: { type: Sequelize.STRING, allowNull: true },
        waive_reason: { type: Sequelize.TEXT, allowNull: true },
        waived_by_name: { type: Sequelize.STRING, allowNull: true },
        waived_at: { type: Sequelize.DATE, allowNull: true },
        created_by_name: { type: Sequelize.STRING, allowNull: true },
        ...ts,
      });
      await queryInterface.addIndex('ticket_charges', ['enrollment_id', 'status']);
      await queryInterface.addIndex('ticket_charges', ['company_id', 'charge_type']);
    }

    if (!tables.includes('receipt_charge_lines')) {
      await queryInterface.createTable('receipt_charge_lines', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        customer_payment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'customer_payments', key: 'id' }, onDelete: 'RESTRICT' },
        ticket_charge_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ticket_charges', key: 'id' }, onDelete: 'RESTRICT' },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        ...ts,
      });
      await queryInterface.addIndex('receipt_charge_lines', ['customer_payment_id']);
      await queryInterface.addIndex('receipt_charge_lines', ['ticket_charge_id']);
    }

    await addColumnIfMissing(queryInterface, 'customer_payments', 'charges_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });

    if (!tables.includes('penalty_waivers')) {
      await queryInterface.createTable('penalty_waivers', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        company_id: { type: Sequelize.UUID, allowNull: false },
        chits_installment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'chits_installments', key: 'id' }, onDelete: 'RESTRICT' },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        waived_by_name: { type: Sequelize.STRING, allowNull: true },
        ...ts,
      });
      await queryInterface.addIndex('penalty_waivers', ['chits_installment_id']);
    }

    await addColumnIfMissing(queryInterface, 'member_advances', 'receipt_number', { type: Sequelize.STRING, allowNull: true });
    await addColumnIfMissing(queryInterface, 'member_advances', 'created_by_name', { type: Sequelize.STRING, allowNull: true });

    if (!tables.includes('advance_refunds')) {
      await queryInterface.createTable('advance_refunds', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        company_id: { type: Sequelize.UUID, allowNull: false },
        member_advance_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'member_advances', key: 'id' }, onDelete: 'RESTRICT' },
        account_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'payment_accounts', key: 'id' }, onDelete: 'RESTRICT' },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        refund_date: { type: Sequelize.DATEONLY, allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        refunded_by_name: { type: Sequelize.STRING, allowNull: true },
        ...ts,
      });
      await queryInterface.addIndex('advance_refunds', ['account_id', 'refund_date']);
    }
  },

  async down(queryInterface) {
    for (const t of ['advance_refunds', 'penalty_waivers', 'receipt_charge_lines', 'ticket_charges']) await queryInterface.dropTable(t).catch(() => {});
    const drop = async (table, column) => {
      const info = await queryInterface.describeTable(table);
      if (info[column]) await queryInterface.removeColumn(table, column);
    };
    await drop('customer_payments', 'charges_amount');
    await drop('member_advances', 'receipt_number');
    await drop('member_advances', 'created_by_name');
  },
};
