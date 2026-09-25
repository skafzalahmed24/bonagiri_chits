'use strict';

// Sureties: guarantors recorded against a ticket, usually when it is prized
// and the member is about to receive the prize money.
// Cash denominations: the physical cash count at day close, note by note.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = (name) => tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes(name);

    if (!has('sureties')) {
      await queryInterface.createTable('sureties', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        company_id: { type: Sequelize.UUID, allowNull: false },
        enrollment_id: { type: Sequelize.INTEGER, allowNull: false },
        name: { type: Sequelize.STRING, allowNull: false },
        relation: { type: Sequelize.STRING, allowNull: true, comment: 'How the surety is related to the member' },
        father_name: { type: Sequelize.STRING, allowNull: true },
        mobile_number: { type: Sequelize.STRING, allowNull: true },
        address: { type: Sequelize.TEXT, allowNull: true },
        occupation: { type: Sequelize.STRING, allowNull: true },
        monthly_income: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
        id_proof_type: { type: Sequelize.STRING, allowNull: true },
        id_proof_number: { type: Sequelize.STRING, allowNull: true },
        remarks: { type: Sequelize.TEXT, allowNull: true },
        is_deleted_status: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('sureties', ['company_id', 'enrollment_id']);
    }

    if (!has('cash_denominations')) {
      await queryInterface.createTable('cash_denominations', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        company_id: { type: Sequelize.UUID, allowNull: false },
        count_date: { type: Sequelize.DATEONLY, allowNull: false },
        // Note counts, not amounts: the amount is always count × face value.
        notes_500: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        notes_200: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        notes_100: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        notes_50: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        notes_20: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        notes_10: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        coins_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        total_amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        remarks: { type: Sequelize.TEXT, allowNull: true },
        counted_by: { type: Sequelize.STRING, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('cash_denominations', ['company_id', 'count_date'], { unique: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cash_denominations');
    await queryInterface.dropTable('sureties');
  },
};
