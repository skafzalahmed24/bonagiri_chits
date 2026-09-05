'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const supportedCountries = [
      {
        id: 101,
        country_name: 'India',
        country_code: 'IN',
        dialing_code: '91',
        currency: 'INR',
        currency_name: 'Indian rupee',
        currency_symbol: '₹',
        emoji: '🇮🇳',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 233,
        country_name: 'United States',
        country_code: 'US',
        dialing_code: '1',
        currency: 'USD',
        currency_name: 'United States dollar',
        currency_symbol: '$',
        emoji: '🇺🇸',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 231,
        country_name: 'United Arab Emirates',
        country_code: 'AE',
        dialing_code: '971',
        currency: 'AED',
        currency_name: 'United Arab Emirates dirham',
        currency_symbol: 'إ.د',
        emoji: '🇦🇪',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 39,
        country_name: 'Canada',
        country_code: 'CA',
        dialing_code: '1',
        currency: 'CAD',
        currency_name: 'Canadian dollar',
        currency_symbol: '$',
        emoji: '🇨🇦',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 14,
        country_name: 'Australia',
        country_code: 'AU',
        dialing_code: '61',
        currency: 'AUD',
        currency_name: 'Australian dollar',
        currency_symbol: '$',
        emoji: '🇦🇺',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 22,
        country_name: 'Belgium',
        country_code: 'BE',
        dialing_code: '32',
        currency: 'EUR',
        currency_name: 'Euro',
        currency_symbol: '€',
        emoji: '🇧🇪',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const country of supportedCountries) {
      const existing = await queryInterface.rawSelect(
        'countries',
        { where: { id: country.id } },
        ['id']
      );

      if (existing) {
        await queryInterface.bulkUpdate(
          'countries',
          {
            country_name: country.country_name,
            country_code: country.country_code,
            dialing_code: country.dialing_code,
            currency: country.currency,
            currency_name: country.currency_name,
            currency_symbol: country.currency_symbol,
            emoji: country.emoji,
            updatedAt: new Date()
          },
          { id: country.id }
        );
      } else {
        await queryInterface.bulkInsert('countries', [country]);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Keep countries intact to preserve referential integrity
  }
};
