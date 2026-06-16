'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fixed_scheme_chits_configuration', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },

      // --- Common fields for all scheme types ---
      scheme_type: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '62 = Withdrawn/Non-Withdrawn, 63 = Fixed+Adding, 64 = Auction Based Growing, 65 = Growing Price & Fixed Installments'
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      months_count: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      members_count: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: '0 = inactive, 1 = active'
      },
      company_profit: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Optional company profit - used by types 62, 64, 65'
      },

      // --- Type 62 & 64 & 65: prices as JSON array ---
      // Type 62: [{"month":1,"not_withdrawn":"10000","withdrawn":"10500","chit_amount":"100000"}]
      // Type 64: [{"month":1,"installment":"10000","chit_amount":"10500"}]
      // Type 65: [{"month":1,"installment":"10000","chit_amount":"10500"}]
      prices: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Monthly price breakdown array (used by scheme types 62, 64, 65)'
      },

      // --- Type 63: Fixed + Adding specific fields ---
      chit_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Chit value - used by type 63'
      },
      adding_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Adding percentage - used by type 63'
      },
      installment: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Auto-calculated installment amount - used by type 63'
      },
      company_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Company percentage - used by type 63'
      },
      company_chit: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Company chit amount - used by type 63'
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('fixed_scheme_chits_configuration');
  }
};
