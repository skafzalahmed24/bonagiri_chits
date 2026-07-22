'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addIndex('RevokedTokens', ['expires_at'], {
      name: 'revoked_tokens_expires_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('RevokedTokens', 'revoked_tokens_expires_at_idx');
  }
};
