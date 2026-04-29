'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('auctions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      ticket_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      bidder_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      auction_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      auction_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      due_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      next_auction_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      bid_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      gst_number_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      pb_bo_proxy: {
        type: Sequelize.STRING,
        allowNull: true
      },
      minutes_filing_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      installments: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      chit_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      bid_loss: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      bid_payable: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      company_commission: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      gst_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      dividend_payable: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      subscription_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      dividend: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      net_payable: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
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
    await queryInterface.dropTable('auctions');
  }
};
