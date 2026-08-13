'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MemberReferral extends Model {
    static associate(models) {
      MemberReferral.belongsTo(models.Member, { foreignKey: 'refer_by_user_id', as: 'referrer' });
    }
  }
  MemberReferral.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    refer_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mobile_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'MemberReferral',
    tableName: 'member_referrals'
  });
  return MemberReferral;
};