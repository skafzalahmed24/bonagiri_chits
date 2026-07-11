'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CustomerPayment extends Model {
    static associate(models) {
      CustomerPayment.belongsTo(models.ChitsInstallment, { foreignKey: 'chits_installment_id', as: 'installment' });
      CustomerPayment.belongsTo(models.CollectionAgentAmount, { foreignKey: 'collection_agent_amount_id', as: 'collection_submission' });
    }
  }
  CustomerPayment.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    chits_installment_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    received_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    penalty_paid: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    collection_agent_amount_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    payment_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '0 - no action, 1 - paid, 2 - due date'
    }
  }, {
    sequelize,
    modelName: 'CustomerPayment',
    tableName: 'customer_payments'
  });
  return CustomerPayment;
};