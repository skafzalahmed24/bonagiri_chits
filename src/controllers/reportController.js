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
    const company_id = await resolveCompanyIdForAuth(req.user);

    if (req.user.role === 'staff') {
      const { PaymentAccount } = require('../models');
      const account = await PaymentAccount.findOne({ where: { id: req.body.account_id, company_id } });
      if (!account) return res.json({ status: false, message: 'Account not found' });

      if (account.account_type === 'CASH' && !req.user.permissions?.R_CASH_BOOK?.view) {
        return res.json({ status: false, message: "You don't have permission to access CASH book" });
      }
      if (account.account_type !== 'CASH' && !req.user.permissions?.R_BANK_BOOK?.view) {
        return res.json({ status: false, message: "You don't have permission to access BANK/UPI book" });
      }
    }

    const params = {
      account_id: req.body.account_id,
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      company_id,
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

exports.getAgentFloatReport = async (req, res) => {
  try {
    const params = {
      as_on_date: req.body.as_on_date,
      agent_id: req.body.agent_id,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getAgentFloatReport(params);
    res.json({ status: true, message: 'Agent Float report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getOutstandingReport = async (req, res) => {
  try {
    const params = {
      as_on_date: req.body.as_on_date,
      group_by: req.body.group_by,
      group_id: req.body.group_id,
      agent_id: req.body.agent_id,
      area_id: req.body.area_id,
      route_id: req.body.route_id,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getOutstandingReport(params);
    res.json({ status: true, message: 'Outstanding report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getStatutoryFormContext = async (req, res) => {
  try {
    const params = {
      group_id: req.body.group_id,
      report_date: req.body.report_date,
      charge_amount: req.body.charge_amount,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getStatutoryFormContext(params);
    res.json({ status: true, message: 'Form details retrieved successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getNoticeData = async (req, res) => {
  try {
    const params = {
      group_id: req.body.group_id,
      ticket_from: req.body.ticket_from,
      ticket_to: req.body.ticket_to,
      notice_date: req.body.notice_date,
      default_months: req.body.default_months,
      incidental_charges: req.body.incidental_charges,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getNoticeData(params);
    res.json({ status: true, message: 'Notice data generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getAuctionRegister = async (req, res) => {
  try {
    const params = {
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      group_id: req.body.group_id,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getAuctionRegister(params);
    res.json({ status: true, message: 'Auction register generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getCollectionRegister = async (req, res) => {
  try {
    const params = {
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      group_id: req.body.group_id,
      payment_mode: req.body.payment_mode,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await reportService.getCollectionRegister(params);
    res.json({ status: true, message: 'Collection register generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getSubscriberRegister = async (req, res) => {
  try {
    const data = await reportService.getSubscriberRegister({
      group_id: req.body.group_id,
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'Subscriber register generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getRepeatedPersons = async (req, res) => {
  try {
    const data = await reportService.getRepeatedPersons({
      match: req.body.match === 'name' ? 'name' : 'mobile',
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'Repeated persons found', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getAccountCopy = async (req, res) => {
  try {
    const data = await reportService.getAccountCopy({
      member_id: req.body.member_id,
      enrollment_id: req.body.enrollment_id,
      as_on_date: req.body.as_on_date,
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'Account copy generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getFdrStatement = async (req, res) => {
  try {
    const data = await reportService.getFdrStatement({
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'FDR statement generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getAgentTargetReport = async (req, res) => {
  try {
    const data = await reportService.getAgentTargetReport({
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'Agent target report generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getAdvanceRegister = async (req, res) => {
  try {
    const data = await reportService.getAdvanceRegister({
      from_date: req.body.from_date,
      to_date: req.body.to_date,
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'Advance register generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getSubscriberLedger = async (req, res) => {
  try {
    const data = await reportService.getSubscriberLedger({
      group_id: req.body.group_id,
      as_on_date: req.body.as_on_date,
      company_id: await resolveCompanyIdForAuth(req.user),
    });
    res.json({ status: true, message: 'Subscriber ledger generated successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getGroupOptions = async (req, res) => {
  try {
    const data = await reportService.getGroupOptions({ company_id: await resolveCompanyIdForAuth(req.user) });
    res.json({ status: true, message: 'Groups retrieved', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getMemberOptions = async (req, res) => {
  try {
    const data = await reportService.getMemberOptions({ company_id: await resolveCompanyIdForAuth(req.user) });
    res.json({ status: true, message: 'Members retrieved', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};
