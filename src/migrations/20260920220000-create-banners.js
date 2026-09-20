'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('banners', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'companies',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      banner_image: {
        type: Sequelize.STRING,
        allowNull: false
      },
      banner_type: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '1 - regular (all subscribers), 2 - particular subscribers'
      },
      status: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: '1 - active, 0 - inactive'
      },
      is_deleted_status: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: '0 - active, 1 - deleted'
      },
      banner_start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      banner_end_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
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

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('banners');
  }
};
