const { Expenditure } = require('../models');
const makeOutflowService = require('./outflowServiceFactory');

// Expenditure: an office expense paid from a payment account. See outflowServiceFactory.
module.exports = makeOutflowService({ Model: Expenditure, entity: 'expenditure', label: 'Expenditure', fields: ['spent_by', 'category'] });
