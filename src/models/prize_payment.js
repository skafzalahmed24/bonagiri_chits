'use strict';
module.exports = (sequelize, DataTypes) => {
  const PrizePayment = sequelize.define('PrizePayment', {
    company_id: { type: DataTypes.UUID, allowNull: false },
    auction_id: { type: DataTypes.UUID, allowNull: true },
    group_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.INTEGER, allowNull: false },
    member_id: { type: DataTypes.INTEGER, allowNull: false },
    payment_type: { type: DataTypes.INTEGER, allowNull: false },
    voucher_number: { type: DataTypes.STRING(30), allowNull: false },
    payment_date: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    account_id: { type: DataTypes.INTEGER, allowNull: true },
    payment_mode: { type: DataTypes.INTEGER, allowNull: true },
    cheque_number: { type: DataTypes.STRING, allowNull: true },
    cheque_date: { type: DataTypes.DATEONLY, allowNull: true },
    reference_no: { type: DataTypes.STRING, allowNull: true },
    narration: { type: DataTypes.TEXT, allowNull: true },
    created_by_id: { type: DataTypes.STRING, allowNull: true },
    created_by_role: { type: DataTypes.STRING, allowNull: true },
    created_by_name: { type: DataTypes.STRING, allowNull: true },
    updated_by_name: { type: DataTypes.STRING, allowNull: true },
    is_deleted: { type: DataTypes.INTEGER, defaultValue: 0 },
    deleted_by_name: { type: DataTypes.STRING, allowNull: true },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    delete_reason: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'prize_payments',
    timestamps: true
  });

  PrizePayment.associate = function(models) {
    PrizePayment.belongsTo(models.Auction, { foreignKey: 'auction_id', as: 'auction' });
    PrizePayment.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
    PrizePayment.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    PrizePayment.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
    PrizePayment.belongsTo(models.PaymentAccount, { foreignKey: 'account_id', as: 'account' });
  };

  return PrizePayment;
};
