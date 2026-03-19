'use strict';
const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('static_dropdowns_list', [
      // type id 1 - Title
      { id: uuidv4(), dropdown_name: 'Mr.', type_id: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Mrs.', type_id: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Miss.', type_id: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Dr.', type_id: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'M/S.', type_id: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Mnr.', type_id: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 2 - Relation Title
      { id: uuidv4(), dropdown_name: 'S/O', type_id: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'D/O', type_id: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'C/O', type_id: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'M/S', type_id: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'W/O', type_id: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 3 - Gender
      { id: uuidv4(), dropdown_name: 'Male', type_id: 3, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Female', type_id: 3, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 4 - Introduced As
      { id: uuidv4(), dropdown_name: 'All', type_id: 4, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Member', type_id: 4, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Business Agent', type_id: 4, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Guarantor', type_id: 4, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Collection Agent', type_id: 4, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 5 - Occupation
      { id: uuidv4(), dropdown_name: 'Employee', type_id: 5, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Business', type_id: 5, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Others', type_id: 5, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'House Wife', type_id: 5, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Retd. Off.', type_id: 5, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Farmer', type_id: 5, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 6 - KYC Type
      { id: uuidv4(), dropdown_name: 'Aadhar Card', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'PAN Card', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Voter Id', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Gas Bill', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Passport', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Electricity Bill', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Driving Licence', type_id: 6, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 7 - Chits Series
      { id: uuidv4(), dropdown_name: 'Short Term', type_id: 7, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Mid Term', type_id: 7, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Long Term', type_id: 7, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 8 - Auction Type
      { id: uuidv4(), dropdown_name: 'Monthly', type_id: 8, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Bi Monnthly', type_id: 8, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Weekly', type_id: 8, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Daily', type_id: 8, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 9 - Auction Date
      { id: uuidv4(), dropdown_name: 'Sunday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Monday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Tuesday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Wednesday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Thursday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Friday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Saturday', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Every Month', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Every Day', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Month End', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Every Week', type_id: 9, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 10 - FDR Type
      { id: uuidv4(), dropdown_name: 'Simple', type_id: 10, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Cumulative', type_id: 10, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // type id 11 - Employee Type
      { id: uuidv4(), dropdown_name: 'Private', type_id: 11, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: uuidv4(), dropdown_name: 'Govt.', type_id: 11, status: 1, createdAt: new Date(), updatedAt: new Date() },


    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('static_dropdowns_list', null, {});
  }
};
