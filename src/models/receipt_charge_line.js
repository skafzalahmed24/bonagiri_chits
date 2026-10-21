'use strict';
const { Model } = require('sequelize');

/** How much of a ticket charge a receipt paid. */
module.exports = (sequelize, DataTypes) => {
  class ReceiptChargeLine extends Model {
    static associate(models) {
      ReceiptChargeLine.belongsTo(models.CustomerPayment, { foreignKey: 'customer_payment_id', as: 'receipt' });
      ReceiptChargeLine.belongsTo(models.TicketCharge, { foreignKey: 'ticket_charge_id', as: 'charge' });
    }
  }
  ReceiptChargeLine.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    customer_payment_id: { type: DataTypes.UUID, allowNull: false },
    ticket_charge_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  }, { sequelize, modelName: 'ReceiptChargeLine', tableName: 'receipt_charge_lines' });
  return ReceiptChargeLine;
};
