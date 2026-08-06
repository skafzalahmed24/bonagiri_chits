'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Company.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    company_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    company_address: {
      type: DataTypes.TEXT,
    },
    bank_name: {
      type: DataTypes.STRING,
    },
    gst_percentage: {
      type: DataTypes.DECIMAL(5, 2),
    },
    cheque_return_charges: {
      type: DataTypes.DECIMAL(10, 2),
    },
    enrollment_charges: {
      type: DataTypes.DECIMAL(10, 2),
    },
    notice_charges: {
      type: DataTypes.DECIMAL(10, 2),
    },
    transaction_lock_days: {
      type: DataTypes.INTEGER,
    },
    latitude: {
      type: DataTypes.STRING,
    },
    longitude: {
      type: DataTypes.STRING,
    },
    location: {
      type: DataTypes.STRING,
    },
    gst_number: {
      type: DataTypes.STRING,
    },
    pan_number: {
      type: DataTypes.STRING,
    },
    sac_code: {
      type: DataTypes.STRING,
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    company_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company_password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // Ensure the generated ID is unique in the DB
    },
    rect_print_format: {
      type: DataTypes.INTEGER,
    },
    gst_type: {
      type: DataTypes.INTEGER, // 1 = General, 2 = Divided
      defaultValue: 1,
    },
    device_id: {
      type: DataTypes.STRING,
    },
    device_unique_id: {
      type: DataTypes.STRING,
    },
    platform_type: {
      type: DataTypes.STRING,
    },
    device_details: {
      type: DataTypes.TEXT,
    },
    mobile_otp: {
      type: DataTypes.STRING,
    },
    mobile_otp_expires_at: {
      type: DataTypes.DATE,
    },
    mobile_otp_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    },
    type: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    },
    is_favorites: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Company',
    tableName: 'companies',
    defaultScope: {
      attributes: { exclude: ['company_password'] }
    },
    scopes: {
      withPassword: {
        attributes: { include: ['company_password'] }
      }
    },
    hooks: {
      beforeCreate: async (company, options) => {
        let isUnique = false;
        let newCompanyId = '';
        
        // Loop until a unique 6-digit ID is found
        while (!isUnique) {
          // Generates a random number between 100000 and 999999
          newCompanyId = Math.floor(100000 + Math.random() * 900000).toString();
          
          const existingCompany = await sequelize.models.Company.findOne({ 
            where: { company_id: newCompanyId },
            transaction: options.transaction
          });
          
          if (!existingCompany) {
            isUnique = true;
          }
        }
        
        company.company_id = newCompanyId;
      }
    }
  });
  return Company;
};