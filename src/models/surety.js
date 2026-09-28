'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Surety extends Model {
    static associate(models) {
      Surety.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
      Surety.belongsTo(models.Member, { foreignKey: 'added_by', as: 'added_by_member', constraints: false });
    }
  }

  Surety.init({
    company_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    relation: DataTypes.STRING,
    father_name: DataTypes.STRING,
    mobile_number: DataTypes.STRING,
    address: DataTypes.TEXT,
    occupation: DataTypes.STRING,
    monthly_income: DataTypes.DECIMAL(12, 2),
    id_proof_type: DataTypes.STRING,
    id_proof_number: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    alternate_mobile_number: DataTypes.STRING,
    // { <document_type>: { status, rejection_reason?, updated_at, updated_by } } — see utils/documentChecklist.js
    documents: DataTypes.JSON,
    source: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'office' },
    added_by: DataTypes.INTEGER,
    is_deleted_status: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    sequelize,
    modelName: 'Surety',
    tableName: 'sureties',
  });

  return Surety;
};
