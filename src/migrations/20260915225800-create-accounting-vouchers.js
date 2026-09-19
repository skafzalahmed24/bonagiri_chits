'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('accounting_vouchers', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        company_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'companies',
            key: 'id'
          }
        },
        voucher_type: {
          type: Sequelize.ENUM('CR', 'CP', 'BD', 'BP'),
          allowNull: false
        },
        voucher_number: {
          type: Sequelize.STRING,
          allowNull: false
        },
        transaction_date: {
          type: Sequelize.DATEONLY,
          allowNull: false
        },
        account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'payment_accounts',
            key: 'id'
          }
        },
        narration: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        total_amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });

      await queryInterface.createTable('accounting_voucher_lines', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        voucher_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'accounting_vouchers',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        particulars_account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'account_creation_details',
            key: 'id'
          }
        },
        narration: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0
        },
        cheque_number: {
          type: Sequelize.STRING,
          allowNull: true
        },
        cheque_date: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        bank_name: {
          type: Sequelize.STRING,
          allowNull: true
        },
        place: {
          type: Sequelize.STRING,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('accounting_voucher_lines', { transaction });
      await queryInterface.dropTable('accounting_vouchers', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
