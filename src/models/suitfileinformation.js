'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SuitFileInformation extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      SuitFileInformation.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
      SuitFileInformation.belongsTo(models.Member, { foreignKey: 'subscriber_id', as: 'subscriber' });
    }
  }
  SuitFileInformation.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: DataTypes.UUID,
    group_id: DataTypes.UUID,
    ticket_number: DataTypes.INTEGER,
    subscriber_id: DataTypes.INTEGER,
    court_name: DataTypes.STRING,
    advocate_name: DataTypes.STRING,
    suit_cause: DataTypes.STRING,
    suit_no: DataTypes.STRING,
    suit_file_date: DataTypes.DATEONLY,
    principle_amount: DataTypes.DECIMAL(15, 2),
    cost_of_legal_amount: DataTypes.DECIMAL(15, 2),
    inc_charges: DataTypes.DECIMAL(15, 2),
    interest_amount: DataTypes.DECIMAL(15, 2),
    claim_amount: DataTypes.DECIMAL(15, 2),
    legal_notice_date: DataTypes.DATEONLY
  }, {
    sequelize,
    modelName: 'SuitFileInformation',
    tableName: 'suit_file_informations',
  });
  return SuitFileInformation;
};