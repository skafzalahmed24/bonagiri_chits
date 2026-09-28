const svc = require('../services/agentSuretyService');

const handle = (fn, message) => async (req, res) => {
  try {
    const data = await fn(req.user, req.body || {});
    return res.json({ status: 1, message, data });
  } catch (error) {
    if (error instanceof svc.HttpError) return res.status(error.status).json({ status: 0, message: error.message });
    console.error('[agentSurety]', error);
    return res.status(500).json({ status: 0, message: 'Internal server error' });
  }
};

exports.list = handle(svc.listForMember, 'Sureties retrieved successfully');
exports.save = handle(svc.saveSurety, 'Surety saved');
exports.setDocument = handle(svc.setDocument, 'Document updated');
exports.remove = handle(svc.removeSurety, 'Surety removed');
