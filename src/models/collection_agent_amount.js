'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CollectionAgentAmount extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CollectionAgentAmount.belongsTo(models.Member, { foreignKey: 'collection_agent_id', as: 'collection_agent' });
      CollectionAgentAmount.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
    }
  }
  CollectionAgentAmount.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    collection_agent_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    payment_type: {
      type: DataTypes.INTEGER,
      comment: '1 - cash, 2 - upi, 3 - cheque, 4 - bank, 5 - others'
    },
    cash: {
      type: DataTypes.JSON,
      allowNull: true
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cheque_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bank_details: {
      type: DataTypes.JSON,
      allowNull: true
    },
    other_details: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '0 - pending, 1 - pending, 2 - verified, 3 - rejected'
    },
    paid_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    confirm_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    verified_by_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    verified_by_role: {
      type: DataTypes.STRING,
      allowNull: true
    },
    verified_by_name: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CollectionAgentAmount',
    tableName: 'collection_agent_amounts'
  });
  return CollectionAgentAmount;
};
