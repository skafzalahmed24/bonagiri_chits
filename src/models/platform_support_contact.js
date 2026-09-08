'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlatformSupportContact extends Model {
    static associate(models) {
      // Platform-level: no associations required
    }
  }

  PlatformSupportContact.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phone_numbers: {
      type: DataTypes.JSON, // Array of strings e.g. ["+91 9876543210"]
      allowNull: true
    },
    emails: {
      type: DataTypes.JSON, // Array of strings e.g. ["support@bonagiri.com"]
      allowNull: true
    },
    website_link: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    social_media_links: {
      type: DataTypes.JSON, // { facebook: "...", twitter: "...", instagram: "...", linkedin: "..." }
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'PlatformSupportContact',
    tableName: 'platform_support_contact',
    underscored: true,
    timestamps: true
  });

  return PlatformSupportContact;
};
