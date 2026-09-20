'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    await queryInterface.bulkInsert('chit_types', [
      {
        id: 1,
        name: 'Open Auction',
        description: 'Participate in monthly auctions and bid to win.',
        bg_color: '#D7E9FD',
        image: 'uploads/chit_type_images/openauction.svg',
        auction_type: 1,
        status: 1,
        is_deleted_status: 0,
        display_order: 1,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 2,
        name: 'Fixed Chit',
        description: 'Fixed monthly amount with predetermined order.',
        bg_color: '#FEE5D2',
        image: 'uploads/chit_type_images/fixedchit.svg',
        auction_type: 2,
        status: 1,
        is_deleted_status: 0,
        display_order: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 3,
        name: 'Silver Chit',
        description: 'Save smartly with silver investment based chits.',
        bg_color: '#D6DCE2',
        image: 'uploads/chit_type_images/silverchit.svg',
        auction_type: 3,
        status: 0,
        is_deleted_status: 0,
        display_order: 3,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 4,
        name: 'Gold Chit',
        description: 'Build wealth with gold investment based chits.',
        bg_color: '#F4E0A7',
        image: 'uploads/chit_type_images/goldchit.svg',
        auction_type: 4,
        status: 0,
        is_deleted_status: 0,
        display_order: 4,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 5,
        name: 'One Time Chit',
        description: 'Single payment chit with easy and quick returns.',
        bg_color: '#D4B5F7',
        image: 'uploads/chit_type_images/onetimechit.svg',
        auction_type: 5,
        status: 0,
        is_deleted_status: 0,
        display_order: 5,
        createdAt: now,
        updatedAt: now
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('chit_types', {
      id: [1, 2, 3, 4, 5]
    }, {});
  }
};
