'use strict';
const { Model } = require('sequelize');

/**
 * A due on a ticket besides its instalments: enrollment fee, notice charge, cheque-return
 * charge or other (docs/MONEY_FLOW_BATCH2_3.md §3.1). Status: 0 due, 1 paid, 2 waived, 3 cancelled.
 */
module.exports = (sequelize, DataTypes) => {
  class TicketCharge extends Model {
    static associate(models) {
      TicketCharge.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
      TicketCharge.hasMany(models.ReceiptChargeLine, { foreignKey: 'ticket_charge_id', as: 'receipt_lines' });
    }
  }
  TicketCharge.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.INTEGER, allowNull: false },
    charge_type: { type: DataTypes.STRING(20), allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    charge_date: { type: DataTypes.DATEONLY, allowNull: false },
    paid_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    waived_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    reason: { type: DataTypes.TEXT, allowNull: true },
    source_ref: { type: DataTypes.STRING, allowNull: true },
    waive_reason: { type: DataTypes.TEXT, allowNull: true },
    waived_by_name: { type: DataTypes.STRING, allowNull: true },
    waived_at: { type: DataTypes.DATE, allowNull: true },
    created_by_name: { type: DataTypes.STRING, allowNull: true },
  }, { sequelize, modelName: 'TicketCharge', tableName: 'ticket_charges' });
  return TicketCharge;
};
