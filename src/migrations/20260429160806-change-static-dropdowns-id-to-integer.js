'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Drop existing table
    await queryInterface.dropTable('static_dropdowns_list');

    // 2. Recreate table with integer id
    await queryInterface.createTable('static_dropdowns_list', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      dropdown_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      type_id: {
        type: Sequelize.INTEGER,
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

    // 3. Update dependent columns in member table
    const memberColumns = ['name_prefix', 'parental_prefix', 'gender', 'employee_occupation', 'employee_type'];
    for (const col of memberColumns) {
      await queryInterface.removeColumn('member', col);
      await queryInterface.addColumn('member', col, {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    // 4. Update dependent columns in enrollments table
    const enrollmentColumns = ['payment_mode_id', 'intimation_card_id'];
    for (const col of enrollmentColumns) {
      await queryInterface.removeColumn('enrollments', col);
      await queryInterface.addColumn('enrollments', col, {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // This is complex to revert perfectly, but we could reverse the process if needed.
    // For development, we usually just fix forward.
  }
};
