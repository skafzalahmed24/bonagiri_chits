'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Surety extends Model {
    static associate(models) {
      Surety.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
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
    is_deleted_status: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    sequelize,
    modelName: 'Surety',
    tableName: 'sureties',
  });

  return Surety;
};
