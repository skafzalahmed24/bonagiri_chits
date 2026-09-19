'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CustomerPayment extends Model {
    static associate(models) {
      CustomerPayment.belongsTo(models.ChitsInstallment, { foreignKey: 'chits_installment_id', as: 'installment' });
      CustomerPayment.belongsTo(models.CollectionAgentAmount, { foreignKey: 'collection_agent_amount_id', as: 'collection_submission' });
      if (models.PaymentAccount) {
        CustomerPayment.belongsTo(models.PaymentAccount, { foreignKey: 'upi_account_id', as: 'upi_account' });
        CustomerPayment.belongsTo(models.PaymentAccount, { foreignKey: 'bank_account_id', as: 'bank_account' });
      }
      if (models.MemberAdvance) {
        CustomerPayment.belongsTo(models.MemberAdvance, { foreignKey: 'member_advance_id', as: 'member_advance' });
      }
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
    },
    payment_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    payment_mode: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '1 cash, 2 upi, 3 cheque, 4 bank, 5 others'
    },
    transaction_reference: {
      type: DataTypes.STRING,
      allowNull: true
    },
    receipt_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    recorded_by_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    recorded_by_role: {
      type: DataTypes.STRING,
      allowNull: true
    },
    recorded_by_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cash_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    upi_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    upi_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bank_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    bank_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cheque_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cheque_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    narration: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    member_advance_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CustomerPayment',
    tableName: 'customer_payments'
  });
  return CustomerPayment;
};