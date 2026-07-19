'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('static_dropdowns_list', [
      // type id 1 - Prefix
      { id: 1, dropdown_name: 'Mr.', type_id: 1, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, dropdown_name: 'Mrs.', type_id: 1, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, dropdown_name: 'Miss.', type_id: 1, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 4, dropdown_name: 'Dr.', type_id: 1, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, dropdown_name: 'M/S.', type_id: 1, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 6, dropdown_name: 'Mnr.', type_id: 1, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 3 - Gender
      { id: 12, dropdown_name: 'Male', type_id: 3, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 13, dropdown_name: 'Female', type_id: 3, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 4 - Introduced As
      { id: 14, dropdown_name: 'All', type_id: 4, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 15, dropdown_name: 'Member', type_id: 4, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 16, dropdown_name: 'Business Agent', type_id: 4, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 17, dropdown_name: 'Guarantor', type_id: 4, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 18, dropdown_name: 'Collection Agent', type_id: 4, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 5 - Occupation
      { id: 19, dropdown_name: 'Employee', type_id: 5, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 20, dropdown_name: 'Business', type_id: 5, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 21, dropdown_name: 'Others', type_id: 5, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 22, dropdown_name: 'House Wife', type_id: 5, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 23, dropdown_name: 'Retd. Off.', type_id: 5, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 24, dropdown_name: 'Farmer', type_id: 5, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 6 - KYC Type
      { id: 25, dropdown_name: 'Aadhar Card', type_id: 6, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 26, dropdown_name: 'PAN Card', type_id: 6, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 27, dropdown_name: 'Voter Id', type_id: 6, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 28, dropdown_name: 'Gas Bill', type_id: 6, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 29, dropdown_name: 'Passport', type_id: 6, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 30, dropdown_name: 'Electricity Bill', type_id: 6, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 31, dropdown_name: 'Driving Licence', type_id: 6, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 7 - Chits Series
      { id: 32, dropdown_name: 'Short Term', type_id: 7, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 33, dropdown_name: 'Mid Term', type_id: 7, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 34, dropdown_name: 'Long Term', type_id: 7, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 8 - Auction Type
      { id: 35, dropdown_name: 'Monthly', type_id: 8, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 36, dropdown_name: 'Bi Monthly', type_id: 8, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 37, dropdown_name: 'Weekly', type_id: 8, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 38, dropdown_name: 'Daily', type_id: 8, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 9 - Auction Date
      { id: 39, dropdown_name: 'Sunday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 40, dropdown_name: 'Monday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 41, dropdown_name: 'Tuesday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 42, dropdown_name: 'Wednesday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 43, dropdown_name: 'Thursday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 44, dropdown_name: 'Friday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 45, dropdown_name: 'Saturday', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 46, dropdown_name: 'Every Month', type_id: 9, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 47, dropdown_name: 'Every Day', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 48, dropdown_name: 'Month End', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 49, dropdown_name: 'Every Week', type_id: 9, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 10 - FDR Type
      { id: 50, dropdown_name: 'Simple', type_id: 10, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 51, dropdown_name: 'Cumulative', type_id: 10, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 11 - Employee Type
      { id: 52, dropdown_name: 'Private', type_id: 11, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 53, dropdown_name: 'Govt.', type_id: 11, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 12 - Payment Mode
      { id: 54, dropdown_name: 'Monthly', type_id: 12, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 55, dropdown_name: 'Daily', type_id: 12, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 56, dropdown_name: 'Weekly', type_id: 12, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },

      // type id 13 - Intimation Card
      { id: 57, dropdown_name: 'Post', type_id: 13, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 58, dropdown_name: 'Hand', type_id: 13, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 59, dropdown_name: 'Courier', type_id: 13, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 60, dropdown_name: 'Email', type_id: 13, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 61, dropdown_name: 'No', type_id: 13, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('static_dropdowns_list', null, {});
  }
};
