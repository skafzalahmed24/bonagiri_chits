'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MemberAdvance extends Model {
    static associate(models) {
      if (models.PaymentAccount) {
        MemberAdvance.belongsTo(models.PaymentAccount, { foreignKey: 'account_id', as: 'Account' });
      }
      if (models.Member) {
        MemberAdvance.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
      }
      if (models.CollectionAgentAmount) {
        MemberAdvance.belongsTo(models.CollectionAgentAmount, { foreignKey: 'collection_agent_amount_id', as: 'collection_submission' });
      }
      if (models.Company) {
        MemberAdvance.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      }
    }
  }

  MemberAdvance.init({
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    collection_agent_amount_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    payment_type: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    narration: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'MemberAdvance',
    tableName: 'member_advances',
    underscored: true,
  });

  return MemberAdvance;
};
