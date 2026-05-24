'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactUs extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      ContactUs.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    }
  }

  ContactUs.init({
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phone_numbers: {
      type: DataTypes.JSON, // Stores multiple phone numbers as an array: ["...", "..."]
      allowNull: true
    },
    emails: {
      type: DataTypes.JSON, // Stores multiple emails as an array: ["...", "..."]
      allowNull: true
    },
    website_link: {
      type: DataTypes.STRING,
      allowNull: true
    },
    social_media_links: {
      type: DataTypes.JSON, // Stores social media handles as an object: { facebook: "...", instagram: "..." }
      allowNull: true
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'ContactUs',
    tableName: 'contact_us'
  });

  return ContactUs;
};
