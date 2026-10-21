const { OutgoingPayment } = require('../models');
const makeOutflowService = require('./outflowServiceFactory');

// Payments: money paid to a party from a payment account. See outflowServiceFactory.
module.exports = makeOutflowService({ Model: OutgoingPayment, entity: 'payment', label: 'Payment', fields: ['recipient_name', 'category'] });
