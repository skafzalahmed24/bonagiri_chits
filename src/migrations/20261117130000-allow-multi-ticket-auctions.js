'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Remove auctions_group_bidder_unique so a subscriber holding multiple tickets can win separate auctions with each ticket
    try {
      await queryInterface.removeConstraint('auctions', 'auctions_group_bidder_unique');
    } catch (e) {
      console.warn('auctions_group_bidder_unique constraint already removed or missing:', e.message);
    }

    // 2. Add unique constraint on group_id + ticket_number so each ticket position can only win once in a group
    try {
      await queryInterface.addConstraint('auctions', {
        fields: ['group_id', 'ticket_number'],
        type: 'unique',
        name: 'auctions_group_ticket_number_unique'
      });
    } catch (e) {
      console.warn('Could not add auctions_group_ticket_number_unique:', e.message);
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeConstraint('auctions', 'auctions_group_ticket_number_unique');
    } catch (e) {
      // ignore
    }
    try {
      await queryInterface.addConstraint('auctions', {
        fields: ['group_id', 'bidder_id'],
        type: 'unique',
        name: 'auctions_group_bidder_unique'
      });
    } catch (e) {
      // ignore
    }
  }
};
