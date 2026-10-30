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
        CustomerPayment.belongsTo(models.PaymentAccount, { foreignKey: 'cash_account_id', as: 'cash_account' });
        if (models.ReceiptChargeLine) CustomerPayment.hasMany(models.ReceiptChargeLine, { foreignKey: 'customer_payment_id', as: 'charge_lines' });
      }
      if (models.MemberAdvance) {
        CustomerPayment.belongsTo(models.MemberAdvance, { foreignKey: 'member_advance_id', as: 'member_advance' });
      }
      // The collection agent an OFFICE receipt is tagged to (1b, DB-3). Not the collector: agent cash,
      // float, commission and the leaderboard go through collection_agent_amount_id only.
      CustomerPayment.belongsTo(models.Member, { foreignKey: 'tagged_collection_agent_id', as: 'tagged_agent' });
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
      comment: '0 - no action, 1 - paid, 2 - due date, 3 - reversed'
    },
    payment_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    payment_mode: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '1 cash, 2 upi, 3 cheque, 4 bank, 5 others, 6 from advance, 7 prize adjustment, 8 from bid advance'
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
    cash_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    },
    prize_auction_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    adjust_from_enrollment_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // A cancelled (reversed, payment_status 3) receipt keeps its number plus who, when and why.
    reversed_at: { type: DataTypes.DATE, allowNull: true },
    reversed_by_name: { type: DataTypes.STRING, allowNull: true },
    reverse_reason: { type: DataTypes.TEXT, allowNull: true },
    // Charges paid on this receipt (enrollment fee, notice, cheque return…); the cash/UPI/bank split covers them too.
    charges_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    // ChitCare-order receipt fields (1b-DB1, migration 20261026100100). All nullable, no default; old rows read NULL.
    // receipt_mode and cheque_clearing have DB CHECKs (values below); Joi uses the same values and lengths (DB-8).
    receipt_mode: { type: DataTypes.STRING(12), allowNull: true }, // CASH | UPI | CHEQUE | DD | RTGS_NEFT | SPLIT
    tr_series: { type: DataTypes.STRING(10), allowNull: true },
    tr_number: { type: DataTypes.STRING(20), allowNull: true },
    tr_date: { type: DataTypes.DATEONLY, allowNull: true },
    cheque_deposit_date: { type: DataTypes.DATEONLY, allowNull: true },
    cheque_bank_name: { type: DataTypes.STRING(100), allowNull: true },
    cheque_place: { type: DataTypes.STRING(60), allowNull: true },
    cheque_clearing: { type: DataTypes.STRING(10), allowNull: true }, // LOCAL | NON_LOCAL
    tagged_collection_agent_id: { type: DataTypes.INTEGER, allowNull: true } // FK member(id), ON DELETE RESTRICT
  }, {
    sequelize,
    modelName: 'CustomerPayment',
    tableName: 'customer_payments'
  });
  return CustomerPayment;
};