'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SelfChit extends Model {
    static associate(models) {
      SelfChit.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      SelfChit.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
      SelfChit.belongsTo(models.Member, { foreignKey: 'subscriber_id', as: 'subscriber' });
    }
  }
  SelfChit.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    subscriber_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    slot_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'SelfChit',
    tableName: 'self_chits',
  });
  return SelfChit;
};
