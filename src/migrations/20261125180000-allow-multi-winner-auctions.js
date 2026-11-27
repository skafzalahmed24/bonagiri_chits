'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop unique constraint on group_id + auction_number so multiple winners can be recorded in a single auction
    try {
      await queryInterface.removeConstraint('auctions', 'auctions_group_auction_number_unique');
    } catch (e) {
      console.warn('auctions_group_auction_number_unique constraint already removed or missing:', e.message);
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.addConstraint('auctions', {
        fields: ['group_id', 'auction_number'],
        type: 'unique',
        name: 'auctions_group_auction_number_unique'
      });
    } catch (e) {
      // ignore
    }
  }
};
