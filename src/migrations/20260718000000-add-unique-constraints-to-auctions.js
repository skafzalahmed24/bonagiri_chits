'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('auctions', {
      fields: ['group_id', 'bidder_id'],
      type: 'unique',
      name: 'auctions_group_bidder_unique'
    });

    await queryInterface.addConstraint('auctions', {
      fields: ['group_id', 'auction_number'],
      type: 'unique',
      name: 'auctions_group_auction_number_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('auctions', 'auctions_group_bidder_unique');
    await queryInterface.removeConstraint('auctions', 'auctions_group_auction_number_unique');
  }
};
