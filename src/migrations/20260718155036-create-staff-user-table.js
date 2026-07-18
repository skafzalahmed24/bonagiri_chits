'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('staff_user', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'companies', key: 'id' } },
      role_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'role', key: 'id' } },
      user_code: { type: Sequelize.INTEGER, allowNull: false, unique: true },
      password: { type: Sequelize.STRING, allowNull: false },
      name_prefix: { type: Sequelize.INTEGER, allowNull: true },
      first_name: { type: Sequelize.STRING, allowNull: false },
      last_name: { type: Sequelize.STRING, allowNull: true },
      mobile_number: { type: Sequelize.STRING, allowNull: true },
      otp: { type: Sequelize.STRING, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      is_deleted_status: { type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('staff_user');
  }
};
