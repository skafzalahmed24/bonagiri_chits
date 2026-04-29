'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('suit_file_informations', 'subscriber_id');
    await queryInterface.addColumn('suit_file_informations', 'subscriber_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('suit_file_informations', 'subscriber_id');
    await queryInterface.addColumn('suit_file_informations', 'subscriber_id', {
      type: Sequelize.UUID,
      allowNull: true
    });
  }
};
