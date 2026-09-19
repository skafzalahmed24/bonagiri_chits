const {
  PaymentAccount,
  CustomerPayment,
  AccountingVoucher,
  AccountingVoucherLine,
  SelfTransfer,
  BorrowRepay,
  OutgoingPayment,
  Expenditure,
  CollectionAgentAmount,
  Member,
  ChitsInstallment,
  Enrollment,
  MemberAdvance,
  sequelize,
} = require('../models');
const { Op } = require('sequelize');

// CustomerPayment has no company_id column; scope it through installment -> enrollment.
const companyPaymentInclude = (company_id) => [{
  model: ChitsInstallment,
  as: 'installment',
  attributes: [],
  required: true,
  include: [{ model: Enrollment, as: 'enrollment', attributes: [], required: true, where: { company_id } }]
}];

class ReportService {
  async getDayReport({ date, company_id }) {
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }

    // 1. Fetch all active payment accounts
    const accounts = await PaymentAccount.findAll({
      where: { company_id, is_active: true },
      order: [['id', 'ASC']]
    });

    // Find the primary CASH account (lowest ID) for CustomerPayment cash mapping
    const cashAccount = accounts.find(a => a.account_type === 'CASH');
    const cashAccountId = cashAccount ? cashAccount.id : null;

    const reportRows = [];
    const totals = {
      opening_balance: 0,
      total_receipts: 0,
      total_payments: 0,
      closing_balance: 0
    };

    for (const account of accounts) {
      let priorReceipts = 0;
      let priorPayments = 0;
      let todayReceipts = 0;
      let todayPayments = 0;

      // Helper for SUM queries
      const getSum = async (Model, amountCol, whereClause, include = []) => {
        const result = await Model.sum(amountCol, { where: whereClause, include });
        return result || 0;
      };

      // 1. Member Receipts (CustomerPayment)
      // UPI
      if (account.account_type === 'UPI') {
        priorReceipts += await getSum(CustomerPayment, 'upi_amount', { upi_account_id: account.id, payment_date: { [Op.lt]: date } });
        todayReceipts += await getSum(CustomerPayment, 'upi_amount', { upi_account_id: account.id, payment_date: date });
      }
      // Bank
      if (account.account_type === 'BANK') {
        priorReceipts += await getSum(CustomerPayment, 'bank_amount', { bank_account_id: account.id, payment_date: { [Op.lt]: date } });
        todayReceipts += await getSum(CustomerPayment, 'bank_amount', { bank_account_id: account.id, payment_date: date });
      }
      // Cash
      if (account.id === cashAccountId) {
        priorReceipts += await getSum(CustomerPayment, 'cash_amount', { payment_date: { [Op.lt]: date } }, companyPaymentInclude(company_id));
        todayReceipts += await getSum(CustomerPayment, 'cash_amount', { payment_date: date }, companyPaymentInclude(company_id));
      }

      // Member Advances
      priorReceipts += await getSum(MemberAdvance, 'amount', { account_id: account.id, date: { [Op.lt]: date }, company_id });
      todayReceipts += await getSum(MemberAdvance, 'amount', { account_id: account.id, date: date, company_id });

      // 2. Accounting Vouchers
      // We must join AccountingVoucherLine to sum the line amounts.
      // Receipts: CR, BD
      const priorVoucherReceipts = await AccountingVoucherLine.sum('amount', {
        include: [{ model: AccountingVoucher, as: 'voucher', attributes: [], required: true, where: { account_id: account.id, transaction_date: { [Op.lt]: date }, voucher_type: { [Op.in]: ['CR', 'BD'] } } }]
      }) || 0;
      priorReceipts += priorVoucherReceipts;

      const todayVoucherReceipts = await AccountingVoucherLine.sum('amount', {
        include: [{ model: AccountingVoucher, as: 'voucher', attributes: [], required: true, where: { account_id: account.id, transaction_date: date, voucher_type: { [Op.in]: ['CR', 'BD'] } } }]
      }) || 0;
      todayReceipts += todayVoucherReceipts;

      // Payments: CP, BP
      const priorVoucherPayments = await AccountingVoucherLine.sum('amount', {
        include: [{ model: AccountingVoucher, as: 'voucher', attributes: [], required: true, where: { account_id: account.id, transaction_date: { [Op.lt]: date }, voucher_type: { [Op.in]: ['CP', 'BP'] } } }]
      }) || 0;
      priorPayments += priorVoucherPayments;

      const todayVoucherPayments = await AccountingVoucherLine.sum('amount', {
        include: [{ model: AccountingVoucher, as: 'voucher', attributes: [], required: true, where: { account_id: account.id, transaction_date: date, voucher_type: { [Op.in]: ['CP', 'BP'] } } }]
      }) || 0;
      todayPayments += todayVoucherPayments;

      // 3. Self Transfers
      priorReceipts += await getSum(SelfTransfer, 'amount', { to_account_id: account.id, date: { [Op.lt]: date } });
      todayReceipts += await getSum(SelfTransfer, 'amount', { to_account_id: account.id, date: date });

      priorPayments += await getSum(SelfTransfer, 'amount', { from_account_id: account.id, date: { [Op.lt]: date } });
      todayPayments += await getSum(SelfTransfer, 'amount', { from_account_id: account.id, date: date });

      // 4. Borrow / Repay
      priorReceipts += await getSum(BorrowRepay, 'amount', { account_id: account.id, type: 'BORROW', date: { [Op.lt]: date } });
      todayReceipts += await getSum(BorrowRepay, 'amount', { account_id: account.id, type: 'BORROW', date: date });

      priorPayments += await getSum(BorrowRepay, 'amount', { account_id: account.id, type: 'REPAY', date: { [Op.lt]: date } });
      todayPayments += await getSum(BorrowRepay, 'amount', { account_id: account.id, type: 'REPAY', date: date });

      // 5. Outgoing Payments
      priorPayments += await getSum(OutgoingPayment, 'amount', { account_id: account.id, date: { [Op.lt]: date } });
      todayPayments += await getSum(OutgoingPayment, 'amount', { account_id: account.id, date: date });

      // 6. Expenditures
      priorPayments += await getSum(Expenditure, 'amount', { account_id: account.id, date: { [Op.lt]: date } });
      todayPayments += await getSum(Expenditure, 'amount', { account_id: account.id, date: date });

      // Calculate Option A Balances
      const initialOpeningBalance = parseFloat(account.opening_balance || 0);
      const computedOpeningBalance = initialOpeningBalance + priorReceipts - priorPayments;
      const closingBalance = computedOpeningBalance + todayReceipts - todayPayments;

      reportRows.push({
        account_id: account.id,
        account_name: account.name,
        account_type: account.account_type,
        opening_balance: computedOpeningBalance,
        total_receipts: todayReceipts,
        total_payments: todayPayments,
        closing_balance: closingBalance
      });

      // Accumulate totals
      totals.opening_balance += computedOpeningBalance;
      totals.total_receipts += todayReceipts;
      totals.total_payments += todayPayments;
      totals.closing_balance += closingBalance;
    }

    return {
      date,
      rows: reportRows,
      totals
    };
  }

  async getCbInflowReport({ from_date, to_date, agent_id, company_id }) {
    if (!from_date) from_date = new Date().toISOString().split('T')[0];
    if (!to_date) to_date = new Date().toISOString().split('T')[0];

    const whereClause = {
      payment_date: {
        [Op.between]: [from_date, to_date]
      }
    };

    const payments = await CustomerPayment.findAll({
      where: whereClause,
      include: [
        ...companyPaymentInclude(company_id),
        {
          model: CollectionAgentAmount,
          as: 'collection_submission',
          include: [
            {
              model: Member,
              as: 'collection_agent',
              attributes: ['id', 'name']
            }
          ]
        }
      ]
    });

    const agentMap = {};
    const summary = {
      cash_total: 0,
      upi_total: 0,
      bank_total: 0,
      grand_total: 0
    };

    for (const p of payments) {
      let currentAgentId = null;
      let currentAgentName = 'Office / Direct';

      if (p.payment_mode === 6) continue;

      if (p.collection_submission && p.collection_submission.collection_agent) {
        const agent = p.collection_submission.collection_agent;
        currentAgentId = agent.id;
        currentAgentName = agent.name;
      }

      if (agent_id === 'direct') {
        // Office / Direct: only rows with no collection agent.
        if (currentAgentId !== null) continue;
      } else if (agent_id && agent_id !== 'all' && currentAgentId !== parseInt(agent_id, 10)) {
        continue; // filter by agent
      }

      const key = currentAgentId || 'direct';

      if (!agentMap[key]) {
        agentMap[key] = {
          agent_id: currentAgentId,
          agent_name: currentAgentName,
          cash_total: 0,
          upi_total: 0,
          bank_total: 0,
          grand_total: 0
        };
      }

      const cash = parseFloat(p.cash_amount || 0);
      const upi = parseFloat(p.upi_amount || 0);
      const bank = parseFloat(p.bank_amount || 0);
      const total = cash + upi + bank;

      agentMap[key].cash_total += cash;
      agentMap[key].upi_total += upi;
      agentMap[key].bank_total += bank;
      agentMap[key].grand_total += total;

      summary.cash_total += cash;
      summary.upi_total += upi;
      summary.bank_total += bank;
      summary.grand_total += total;
    }

    const advances = await MemberAdvance.findAll({
      where: { date: { [Op.between]: [from_date, to_date] }, company_id },
      include: [{
        model: CollectionAgentAmount,
        as: 'collection_submission',
        include: [{ model: Member, as: 'collection_agent', attributes: ['id', 'name'] }]
      }]
    });
    
    for (const adv of advances) {
      let currentAgentId = null;
      let currentAgentName = 'Office / Direct';
      if (adv.collection_submission && adv.collection_submission.collection_agent) {
        const agent = adv.collection_submission.collection_agent;
        currentAgentId = agent.id;
        currentAgentName = agent.name;
      }
      if (agent_id === 'direct' && currentAgentId !== null) continue;
      if (agent_id && agent_id !== 'all' && currentAgentId !== parseInt(agent_id, 10)) continue;
      
      const key = currentAgentId || 'direct';
      if (!agentMap[key]) {
        agentMap[key] = { agent_id: currentAgentId, agent_name: currentAgentName, cash_total: 0, upi_total: 0, bank_total: 0, grand_total: 0 };
      }
      
      const amt = parseFloat(adv.amount || 0);
      let cash = 0, upi = 0, bank = 0;
      if (adv.payment_type === 1) cash = amt;
      else if (adv.payment_type === 2) upi = amt;
      else if (adv.payment_type === 4) bank = amt;
      else cash = amt;

      agentMap[key].cash_total += cash;
      agentMap[key].upi_total += upi;
      agentMap[key].bank_total += bank;
      agentMap[key].grand_total += amt;
      summary.cash_total += cash;
      summary.upi_total += upi;
      summary.bank_total += bank;
      summary.grand_total += amt;
    }

    const rows = Object.values(agentMap).sort((a, b) => a.agent_name.localeCompare(b.agent_name));

    return {
      from_date,
      to_date,
      rows,
      summary
    };
  }

  _validateDateRange(from_date, to_date) {
    const from = new Date(from_date);
    const to = new Date(to_date);
    const diffTime = Math.abs(to - from);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
      throw new Error('Date range cannot exceed 31 days.');
    }
  }

  async getAccountBookReport({ account_id, from_date, to_date, company_id }) {
    if (!account_id) throw new Error('account_id is required');
    if (!from_date) from_date = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    if (!to_date) to_date = new Date().toISOString().split('T')[0];
    
    this._validateDateRange(from_date, to_date);

    const account = await PaymentAccount.findOne({ where: { id: account_id, company_id } });
    if (!account) throw new Error('Account not found');

    // 1. Calculate opening balance as of from_date
    let priorReceipts = 0;
    let priorPayments = 0;

    const getSum = async (Model, amountCol, whereClause, include = []) => {
      const result = await Model.sum(amountCol, { where: whereClause, include });
      return result || 0;
    };

    // CustomerPayment (Receipts)
    if (account.account_type === 'UPI') {
      priorReceipts += await getSum(CustomerPayment, 'upi_amount', { upi_account_id: account.id, payment_date: { [Op.lt]: from_date } });
    } else if (account.account_type === 'BANK') {
      priorReceipts += await getSum(CustomerPayment, 'bank_amount', { bank_account_id: account.id, payment_date: { [Op.lt]: from_date } });
    } else if (account.account_type === 'CASH') {
      // Find the primary CASH account
      const cashAccount = await PaymentAccount.findOne({ where: { company_id, account_type: 'CASH', is_active: true }, order: [['id', 'ASC']] });
      if (cashAccount && cashAccount.id === account.id) {
        priorReceipts += await getSum(CustomerPayment, 'cash_amount', { payment_date: { [Op.lt]: from_date } }, companyPaymentInclude(company_id));
      }
    }

    // Member Advances (Prior)
    priorReceipts += await getSum(MemberAdvance, 'amount', { account_id: account.id, date: { [Op.lt]: from_date }, company_id });

    // AccountingVouchers
    priorReceipts += await AccountingVoucherLine.sum('amount', {
      include: [{ model: AccountingVoucher, as: 'voucher', attributes: [], required: true, where: { account_id: account.id, transaction_date: { [Op.lt]: from_date }, voucher_type: { [Op.in]: ['CR', 'BD'] } } }]
    }) || 0;
    priorPayments += await AccountingVoucherLine.sum('amount', {
      include: [{ model: AccountingVoucher, as: 'voucher', attributes: [], required: true, where: { account_id: account.id, transaction_date: { [Op.lt]: from_date }, voucher_type: { [Op.in]: ['CP', 'BP'] } } }]
    }) || 0;

    // Self Transfers
    priorReceipts += await getSum(SelfTransfer, 'amount', { to_account_id: account.id, date: { [Op.lt]: from_date } });
    priorPayments += await getSum(SelfTransfer, 'amount', { from_account_id: account.id, date: { [Op.lt]: from_date } });

    // Borrow Repay
    priorReceipts += await getSum(BorrowRepay, 'amount', { account_id: account.id, type: 'BORROW', date: { [Op.lt]: from_date } });
    priorPayments += await getSum(BorrowRepay, 'amount', { account_id: account.id, type: 'REPAY', date: { [Op.lt]: from_date } });

    // Outgoing Payments & Expenditures
    priorPayments += await getSum(OutgoingPayment, 'amount', { account_id: account.id, date: { [Op.lt]: from_date } });
    priorPayments += await getSum(Expenditure, 'amount', { account_id: account.id, date: { [Op.lt]: from_date } });

    const opening_balance = parseFloat(account.opening_balance || 0) + priorReceipts - priorPayments;

    // 2. Fetch transactions within range
    const rangeWhere = { [Op.between]: [from_date, to_date] };
    const transactions = [];

    // CustomerPayments
    if (account.account_type === 'UPI') {
      const pmts = await CustomerPayment.findAll({ where: { upi_account_id: account.id, payment_date: rangeWhere } });
      pmts.forEach(p => { if (p.upi_amount > 0) transactions.push({ date: p.payment_date, type: 'Collection', particular: `Receipt - UPI`, debit: 0, credit: p.upi_amount }); });
    } else if (account.account_type === 'BANK') {
      const pmts = await CustomerPayment.findAll({ where: { bank_account_id: account.id, payment_date: rangeWhere } });
      pmts.forEach(p => { if (p.bank_amount > 0) transactions.push({ date: p.payment_date, type: 'Collection', particular: `Receipt - Bank`, debit: 0, credit: p.bank_amount }); });
    } else if (account.account_type === 'CASH') {
      const pmts = await CustomerPayment.findAll({ where: { payment_date: rangeWhere }, include: companyPaymentInclude(company_id) });
      pmts.forEach(p => { if (p.cash_amount > 0) transactions.push({ date: p.payment_date, type: 'Collection', particular: `Receipt - Cash`, debit: 0, credit: p.cash_amount }); });
    }

    // Member Advances
    const advs = await MemberAdvance.findAll({ where: { account_id: account.id, date: rangeWhere, company_id } });
    advs.forEach(a => transactions.push({ date: a.date, type: 'Advance', particular: 'Advance from Collection', debit: 0, credit: a.amount }));

    // Accounting Vouchers
    const avLines = await AccountingVoucherLine.findAll({
      include: [{ model: AccountingVoucher, as: 'voucher', where: { account_id: account.id, transaction_date: rangeWhere } }]
    });
    avLines.forEach(l => {
      const isReceipt = ['CR', 'BD'].includes(l.voucher.voucher_type);
      transactions.push({
        date: l.voucher.transaction_date,
        type: `Voucher (${l.voucher.voucher_number})`,
        particular: l.narration || 'Journal Entry',
        debit: isReceipt ? 0 : l.amount,
        credit: isReceipt ? l.amount : 0
      });
    });

    // Self Transfers
    const stIn = await SelfTransfer.findAll({ where: { to_account_id: account.id, date: rangeWhere } });
    stIn.forEach(t => transactions.push({ date: t.date, type: 'Transfer In', particular: t.narration || 'Self Transfer', debit: 0, credit: t.amount }));
    const stOut = await SelfTransfer.findAll({ where: { from_account_id: account.id, date: rangeWhere } });
    stOut.forEach(t => transactions.push({ date: t.date, type: 'Transfer Out', particular: t.narration || 'Self Transfer', debit: t.amount, credit: 0 }));

    // Borrow Repay
    const brs = await BorrowRepay.findAll({ where: { account_id: account.id, date: rangeWhere } });
    brs.forEach(b => {
      const name = b.party_name || '';
      if (b.type === 'BORROW') transactions.push({ date: b.date, type: 'Borrow', particular: `${name} ${b.narration ? '- '+b.narration : ''}`, debit: 0, credit: b.amount });
      else transactions.push({ date: b.date, type: 'Repay', particular: `${name} ${b.narration ? '- '+b.narration : ''}`, debit: b.amount, credit: 0 });
    });

    // Outgoing Payments
    const ops = await OutgoingPayment.findAll({ where: { account_id: account.id, date: rangeWhere } });
    ops.forEach(o => transactions.push({ date: o.date, type: 'Payment', particular: `${o.category} ${o.narration ? '- '+o.narration : ''}`, debit: o.amount, credit: 0 }));

    // Expenditures
    const exps = await Expenditure.findAll({ where: { account_id: account.id, date: rangeWhere } });
    exps.forEach(e => transactions.push({ date: e.date, type: 'Expenditure', particular: `${e.category} ${e.narration ? '- '+e.narration : ''}`, debit: e.amount, credit: 0 }));

    // Sort chronologically and compute running balance
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let currentBal = opening_balance;
    const rows = transactions.map(t => {
      currentBal = currentBal + parseFloat(t.credit || 0) - parseFloat(t.debit || 0);
      return { ...t, running_balance: currentBal };
    });

    return {
      from_date,
      to_date,
      account_id: account.id,
      account_name: account.name,
      opening_balance,
      closing_balance: currentBal,
      rows
    };
  }

  async getDayBookReport({ from_date, to_date, company_id }) {
    if (!from_date) from_date = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    if (!to_date) to_date = new Date().toISOString().split('T')[0];
    
    this._validateDateRange(from_date, to_date);

    const accounts = await PaymentAccount.findAll({ where: { company_id }, order: [['id', 'ASC']] });
    const accMap = {};
    accounts.forEach(a => { accMap[a.id] = a.name; });
    const accountIds = accounts.map(a => a.id);
    const primaryCash = accounts.find(a => a.account_type === 'CASH' && a.is_active);
    const cashAccName = primaryCash ? primaryCash.name : 'Cash';

    const rangeWhere = { [Op.between]: [from_date, to_date] };
    const inCompanyAccounts = { [Op.in]: accountIds };
    const transactions = [];

    // CustomerPayments
    const pmts = await CustomerPayment.findAll({ where: { payment_date: rangeWhere }, include: companyPaymentInclude(company_id) });
    pmts.forEach(p => {
      if (p.cash_amount > 0) transactions.push({ date: p.payment_date, type: 'Collection', particular: 'Receipt - Cash', account_name: cashAccName, amount: p.cash_amount, debit_credit_flag: 'CREDIT' });
      if (p.upi_amount > 0) transactions.push({ date: p.payment_date, type: 'Collection', particular: 'Receipt - UPI', account_name: accMap[p.upi_account_id] || 'UPI', amount: p.upi_amount, debit_credit_flag: 'CREDIT' });
      if (p.bank_amount > 0) transactions.push({ date: p.payment_date, type: 'Collection', particular: 'Receipt - Bank', account_name: accMap[p.bank_account_id] || 'Bank', amount: p.bank_amount, debit_credit_flag: 'CREDIT' });
    });

    // Member Advances
    const advs = await MemberAdvance.findAll({ where: { date: rangeWhere, company_id } });
    advs.forEach(a => {
      let typeStr = 'Cash';
      if (a.payment_type === 2) typeStr = 'UPI';
      if (a.payment_type === 4) typeStr = 'Bank';
      transactions.push({ date: a.date, type: 'Advance', particular: `Advance - ${typeStr}`, account_name: accMap[a.account_id] || 'Account', amount: a.amount, debit_credit_flag: 'CREDIT' });
    });

    // Accounting Vouchers
    const avLines = await AccountingVoucherLine.findAll({
      include: [{ model: AccountingVoucher, as: 'voucher', where: { transaction_date: rangeWhere, account_id: inCompanyAccounts } }]
    });
    avLines.forEach(l => {
      const isReceipt = ['CR', 'BD'].includes(l.voucher.voucher_type);
      transactions.push({
        date: l.voucher.transaction_date,
        type: `Voucher (${l.voucher.voucher_number})`,
        particular: l.narration || 'Journal Entry',
        account_name: accMap[l.voucher.account_id] || 'Account',
        amount: l.amount,
        debit_credit_flag: isReceipt ? 'CREDIT' : 'DEBIT'
      });
    });

    // Self Transfers
    const sts = await SelfTransfer.findAll({ where: { date: rangeWhere, from_account_id: inCompanyAccounts } });
    sts.forEach(t => {
      transactions.push({ date: t.date, type: 'Transfer Out', particular: t.narration || 'Self Transfer', account_name: accMap[t.from_account_id] || 'Account', amount: t.amount, debit_credit_flag: 'DEBIT' });
      transactions.push({ date: t.date, type: 'Transfer In', particular: t.narration || 'Self Transfer', account_name: accMap[t.to_account_id] || 'Account', amount: t.amount, debit_credit_flag: 'CREDIT' });
    });

    // Borrow Repay
    const brs = await BorrowRepay.findAll({ where: { date: rangeWhere, account_id: inCompanyAccounts } });
    brs.forEach(b => {
      const name = b.party_name || '';
      const isBorrow = b.type === 'BORROW';
      transactions.push({
        date: b.date, type: isBorrow ? 'Borrow' : 'Repay',
        particular: `${name} ${b.narration ? '- '+b.narration : ''}`,
        account_name: accMap[b.account_id] || 'Account',
        amount: b.amount,
        debit_credit_flag: isBorrow ? 'CREDIT' : 'DEBIT'
      });
    });

    // Outgoing Payments
    const ops = await OutgoingPayment.findAll({ where: { date: rangeWhere, account_id: inCompanyAccounts } });
    ops.forEach(o => transactions.push({ date: o.date, type: 'Payment', particular: `${o.category} ${o.narration ? '- '+o.narration : ''}`, account_name: accMap[o.account_id] || 'Account', amount: o.amount, debit_credit_flag: 'DEBIT' }));

    // Expenditures
    const exps = await Expenditure.findAll({ where: { date: rangeWhere, account_id: inCompanyAccounts } });
    exps.forEach(e => transactions.push({ date: e.date, type: 'Expenditure', particular: `${e.category} ${e.narration ? '- '+e.narration : ''}`, account_name: accMap[e.account_id] || 'Account', amount: e.amount, debit_credit_flag: 'DEBIT' }));

    // Sort chronologically
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      from_date,
      to_date,
      rows: transactions
    };
  }
}

module.exports = new ReportService();
