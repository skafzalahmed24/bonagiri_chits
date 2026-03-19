'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('chits_groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      chit_series_term: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '1 - short term, 2 - mid term, 3 - long term'
      },
      auction_type: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '1- monthly, 2- bi monthly, 3-weekly, 4 - Daily'
      },
      chit_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      no_of_installments: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      chit_agreement_number: {
        type: Sequelize.STRING
      },
      pso_date: {
        type: Sequelize.DATEONLY
      },
      pso_number: {
        type: Sequelize.STRING
      },
      ca_date: {
        type: Sequelize.DATEONLY
      },
      commencement_date: {
        type: Sequelize.DATEONLY
      },
      term_date: {
        type: Sequelize.DATEONLY
      },
      enrollment_fee: {
        type: Sequelize.DECIMAL(15, 2)
      },
      company_chit_number: {
        type: Sequelize.STRING
      },
      no_auction_installment: {
        type: Sequelize.INTEGER
      },
      company_commission: {
        type: Sequelize.DECIMAL(5, 2)
      },
      max_ceiling_in: {
        type: Sequelize.DECIMAL(5, 2)
      },
      penality_for_nps: {
        type: Sequelize.DECIMAL(10, 2)
      },
      penality_for_ps: {
        type: Sequelize.DECIMAL(10, 2)
      },
      auctions_per_month: {
        type: Sequelize.INTEGER
      },
      installment_amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      auction_date: {
        type: Sequelize.DATEONLY
      },
      days: {
        type: Sequelize.INTEGER
      },
      bi_monthly_extra_input: {
        type: Sequelize.TEXT
      },
      auction_from: {
        type: Sequelize.TIME
      },
      auction_to: {
        type: Sequelize.TIME
      },
      dividend: {
        type: Sequelize.INTEGER,
        comment: '1 - same month, 2 - next month'
      },
      send_sms_to_all_customers: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      fdr_number: {
        type: Sequelize.STRING
      },
      fdr_type: {
        type: Sequelize.INTEGER,
        comment: '1 - simple, 2 - cumulative'
      },
      fdr_amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      fdr_date: {
        type: Sequelize.DATEONLY
      },
      no_of_months: {
        type: Sequelize.INTEGER
      },
      maturity_date: {
        type: Sequelize.DATEONLY
      },
      roi_per_year: {
        type: Sequelize.DECIMAL(5, 2)
      },
      fdr_mat_amt: {
        type: Sequelize.DECIMAL(15, 2)
      },
      bank_name: {
        type: Sequelize.STRING
      },
      bank_branch: {
        type: Sequelize.STRING
      },
      asset_description: {
        type: Sequelize.TEXT
      },
      asset_value: {
        type: Sequelize.DECIMAL(15, 2)
      },
      running_status: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: '1 - running, 2- closed, 3 - both'
      },
      is_deleted_status: {
        type: Sequelize.INTEGER,
        defaultValue: 0
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
    await queryInterface.dropTable('chits_groups');
  }
};
