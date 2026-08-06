'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_settings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      business_date: {
        type: Sequelize.DATE
      },
      scheduler_mode: {
        type: Sequelize.STRING,
        defaultValue: 'AUTOMATIC'
      },
      environment: {
        type: Sequelize.STRING,
        defaultValue: 'Development'
      },
      last_updated_by: {
        type: Sequelize.UUID,
        references: {
          model: 'staff_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      last_updated_on: {
        type: Sequelize.DATE
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

    if (process.env.NODE_ENV !== 'production') {
      await queryInterface.bulkUpdate('system_settings', { environment: 'Development' }, { environment: 'Production' });
    }
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('system_settings');
  }
};