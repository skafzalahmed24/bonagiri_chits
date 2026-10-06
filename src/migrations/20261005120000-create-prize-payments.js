'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const prizePaymentsInfo = await queryInterface.describeTable('prize_payments').catch(() => null);
    if (!prizePaymentsInfo) {
      await queryInterface.createTable('prize_payments', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        company_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        auction_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'auctions',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        group_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        enrollment_id: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        member_id: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        payment_type: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '1 bid payment, 2 prize advance, 3 opening paid'
        },
        voucher_number: {
          type: Sequelize.STRING(30),
          allowNull: false
        },
        payment_date: {
          type: Sequelize.DATEONLY,
          allowNull: false
        },
        amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false
        },
        account_id: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        payment_mode: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '1 cash, 2 UPI, 3 cheque, 4 bank transfer'
        },
        cheque_number: {
          type: Sequelize.STRING,
          allowNull: true
        },
        cheque_date: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        reference_no: {
          type: Sequelize.STRING,
          allowNull: true
        },
        narration: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_by_id: {
          type: Sequelize.STRING,
          allowNull: true
        },
        created_by_role: {
          type: Sequelize.STRING,
          allowNull: true
        },
        created_by_name: {
          type: Sequelize.STRING,
          allowNull: true
        },
        updated_by_name: {
          type: Sequelize.STRING,
          allowNull: true
        },
        is_deleted: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        deleted_by_name: {
          type: Sequelize.STRING,
          allowNull: true
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        delete_reason: {
          type: Sequelize.TEXT,
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
    }

    // Indexes are ensured separately: the table may already exist (created earlier without them),
    // and the unique voucher index is what stops two payments sharing a voucher number.
    const existingIndexes = (await queryInterface.showIndex('prize_payments')).map((i) => i.name);
    const ensureIndex = async (fields, options = {}) => {
      const name = `prize_payments_${fields.join('_')}`;
      if (!existingIndexes.includes(name)) await queryInterface.addIndex('prize_payments', fields, { ...options, name });
    };
    await ensureIndex(['company_id', 'voucher_number'], { unique: true });
    await ensureIndex(['company_id', 'auction_id']);
    await ensureIndex(['company_id', 'enrollment_id']);
    await ensureIndex(['company_id', 'payment_date']);

    const auctionsInfo = await queryInterface.describeTable('auctions');
    if (!auctionsInfo.prize_adjusted_amount) {
      await queryInterface.addColumn('auctions', 'prize_adjusted_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      });
      await queryInterface.addColumn('auctions', 'prize_advance_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      });
      await queryInterface.addColumn('auctions', 'prize_paid_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      });
      await queryInterface.addColumn('auctions', 'prize_net_payable', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      });
      await queryInterface.addColumn('auctions', 'prize_status', {
        type: Sequelize.INTEGER,
        defaultValue: 0
      });
      await queryInterface.addColumn('auctions', 'prize_last_paid_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });

      // Backfill prize_net_payable
      await queryInterface.sequelize.query(`
        UPDATE auctions
        SET prize_net_payable = bid_payable
        WHERE bidder_id IS NOT NULL
      `);
    }

    const cpInfo = await queryInterface.describeTable('customer_payments');
    if (!cpInfo.prize_auction_id) {
      await queryInterface.addColumn('customer_payments', 'prize_auction_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
      await queryInterface.addColumn('customer_payments', 'adjust_from_enrollment_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('prize_payments').catch(() => null);
    
    const auctionsInfo = await queryInterface.describeTable('auctions').catch(() => null);
    if (auctionsInfo && auctionsInfo.prize_adjusted_amount) {
      await queryInterface.removeColumn('auctions', 'prize_adjusted_amount');
      await queryInterface.removeColumn('auctions', 'prize_advance_amount');
      await queryInterface.removeColumn('auctions', 'prize_paid_amount');
      await queryInterface.removeColumn('auctions', 'prize_net_payable');
      await queryInterface.removeColumn('auctions', 'prize_status');
      await queryInterface.removeColumn('auctions', 'prize_last_paid_date');
    }

    const cpInfo = await queryInterface.describeTable('customer_payments').catch(() => null);
    if (cpInfo && cpInfo.prize_auction_id) {
      await queryInterface.removeColumn('customer_payments', 'prize_auction_id');
      await queryInterface.removeColumn('customer_payments', 'adjust_from_enrollment_id');
    }
  }
};
