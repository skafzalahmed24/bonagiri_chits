const reportService = require('../services/reportService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

exports.getDayReport = async (req, res) => {
  try {
    const params = {
      date: req.body.date,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getDayReport(params);
    res.json({ status: true, message: 'Day report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getCbInflowReport = async (req, res) => {
  try {
    const params = {
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      agent_id: req.body.agent_id,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getCbInflowReport(params);
    res.json({ status: true, message: 'CB Inflow report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getAccountBookReport = async (req, res) => {
  try {
    const params = {
      account_id: req.body.account_id,
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getAccountBookReport(params);
    res.json({ status: true, message: 'Account Book report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getDayBookReport = async (req, res) => {
  try {
    const params = {
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getDayBookReport(params);
    res.json({ status: true, message: 'Day Book report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};
