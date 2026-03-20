'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('enrollments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      company_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      group_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      group_position_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      enrollment_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      subscriber_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      payment_mode_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      business_agent_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      intimation_card_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      address_type: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '1 for home, 2 for office'
      },
      collection_agent_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      business_type_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '1 for direct, 2 for agent'
      },
      area_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      nominee_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nominee_age: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      nominee_relation: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nominee_door_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nominee_city_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      nominee_street_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nominee_address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      nominee_mobile_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nominee_pincode: {
        type: Sequelize.STRING,
        allowNull: true
      },
      fill_subscriber_address_status: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '0 for uncheck, 1 for check'
      },
      delete_status: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '0 for active, 1 for deleted'
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
    await queryInterface.dropTable('enrollments');
  }
};
