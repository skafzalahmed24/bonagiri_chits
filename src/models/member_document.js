'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MemberDocument extends Model {
    static associate(models) {
      MemberDocument.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
      MemberDocument.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
      MemberDocument.belongsTo(models.Member, { foreignKey: 'uploaded_by', as: 'uploader' });
    }
  }
  
  MemberDocument.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    documents: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'JSON storing URLs and statuses for aadhar, bank_id, upi_details, certificates'
    },
    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'MemberDocument',
    tableName: 'member_documents'
  });
  
  return MemberDocument;
};
