const {
  AgentTargetEntry,
  Company,
  Area,
  Route,
  ChitsGroup,
  Auction,
  SuitFileInformation,
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
        if (!Model || typeof Model.sum !== 'function') return 0;
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

    const advances = (MemberAdvance && typeof MemberAdvance.findAll === 'function') ? await MemberAdvance.findAll({
      where: { date: { [Op.between]: [from_date, to_date] }, company_id },
      include: [{
        model: CollectionAgentAmount,
        as: 'collection_submission',
        include: [{ model: Member, as: 'collection_agent', attributes: ['id', 'name'] }]
      }]
    }) : [];
    
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
    const advs = (MemberAdvance && typeof MemberAdvance.findAll === 'function')
      ? await MemberAdvance.findAll({ where: { account_id: account.id, date: rangeWhere, company_id } })
      : [];
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
    const advs = (MemberAdvance && typeof MemberAdvance.findAll === 'function')
      ? await MemberAdvance.findAll({ where: { date: rangeWhere, company_id } })
      : [];
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

  /**
   * Agent float — money collected by agents that the office has not received yet.
   *
   * A submission is money the member has already handed over, so the company owns
   * it from the collection date, but it only reaches a payment account when the
   * office verifies it (decision D1). Between those two moments it sits with the
   * agent and appears nowhere else in the books. This report is that gap.
   *
   * Cash is physically with the agent; UPI/cheque/bank collections are in transit
   * to a company account, so they are reported separately — the operational risk
   * is different. Ageing is measured from the collection date.
   */
  async getAgentFloatReport({ as_on_date, agent_id, company_id }) {
    const asOn = as_on_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const endOfDay = new Date(`${asOn}T23:59:59.999+05:30`);

    const submissions = await CollectionAgentAmount.findAll({
      // 0 and 1 are both "submitted, not yet verified"; 2 verified, 3 rejected.
      where: {
        status: { [Op.in]: [0, 1] },
        createdAt: { [Op.lte]: endOfDay },
        ...(agent_id && { collection_agent_id: agent_id }),
      },
      include: [
        { model: Member, as: 'collection_agent', attributes: ['id', 'name'], where: { company_id }, required: true },
        { model: Member, as: 'member', attributes: ['id', 'name'], required: false },
      ],
      order: [['createdAt', 'ASC']],
    });

    const dayMs = 24 * 60 * 60 * 1000;
    const asOnEnd = endOfDay.getTime();
    const agents = new Map();
    const summary = { cash_total: 0, in_transit_total: 0, grand_total: 0, submission_count: 0, agent_count: 0, oldest_days: 0 };

    for (const sub of submissions) {
      const agent = sub.collection_agent;
      const amount = parseFloat(sub.received_amount || 0);
      if (!amount) continue;

      const collectedAt = sub.paid_date || sub.createdAt;
      const ageDays = Math.max(0, Math.floor((asOnEnd - new Date(collectedAt).getTime()) / dayMs));
      const isCash = sub.payment_type === 1;

      if (!agents.has(agent.id)) {
        agents.set(agent.id, {
          agent_id: agent.id,
          agent_name: agent.name,
          cash_amount: 0,
          in_transit_amount: 0,
          total_amount: 0,
          submission_count: 0,
          oldest_days: 0,
          items: [],
        });
      }
      const row = agents.get(agent.id);
      if (isCash) { row.cash_amount += amount; summary.cash_total += amount; }
      else { row.in_transit_amount += amount; summary.in_transit_total += amount; }
      row.total_amount += amount;
      row.submission_count += 1;
      row.oldest_days = Math.max(row.oldest_days, ageDays);
      row.items.push({
        id: sub.id,
        collection_id: sub.id ? `COL${String(sub.id).substring(0, 8).toUpperCase()}` : null,
        member_name: sub.member ? sub.member.name : 'Unknown',
        amount,
        payment_type: sub.payment_type,
        is_cash: isCash,
        collected_on: collectedAt,
        age_days: ageDays,
      });

      summary.grand_total += amount;
      summary.submission_count += 1;
      summary.oldest_days = Math.max(summary.oldest_days, ageDays);
    }

    const round2 = (n) => parseFloat(Number(n).toFixed(2));
    const rows = [...agents.values()]
      .map((r) => ({
        ...r,
        cash_amount: round2(r.cash_amount),
        in_transit_amount: round2(r.in_transit_amount),
        total_amount: round2(r.total_amount),
      }))
      .sort((a, b) => b.total_amount - a.total_amount);

    summary.agent_count = rows.length;
    summary.cash_total = round2(summary.cash_total);
    summary.in_transit_total = round2(summary.in_transit_total);
    summary.grand_total = round2(summary.grand_total);

    return { as_on_date: asOn, summary, rows };
  }

  /**
   * Outstanding (dues) as on a date, bucketed by whatever the caller asks for.
   * One engine behind every "… wise outstanding" report: what a member owes is
   * the payable amount of their due installments minus what has been verified
   * against them. Buckets differ; the money never does.
   */
  async getOutstandingReport({ as_on_date, group_by = 'group', group_id, agent_id, area_id, route_id, company_id }) {
    const asOn = as_on_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const round2 = (n) => parseFloat(Number(n).toFixed(2));

    const enrollmentWhere = { company_id, delete_status: 0 };
    if (group_id) enrollmentWhere.group_id = group_id;
    if (area_id) enrollmentWhere.area_id = area_id;
    if (agent_id) {
      enrollmentWhere[Op.or] = [{ collection_agent_id: agent_id }, { business_agent_id: agent_id }];
    }

    const enrollments = await Enrollment.findAll({
      where: enrollmentWhere,
      include: [
        { model: Member, as: 'subscriber', attributes: ['id', 'name', 'member_id', 'mobile_number'] },
        { model: Member, as: 'collection_agent', attributes: ['id', 'name'], required: false },
        { model: Member, as: 'business_agent', attributes: ['id', 'name'], required: false },
        { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chit_amount'], required: false },
        {
          model: Area, as: 'area', attributes: ['id', 'area_name', 'route_id'], required: false,
          include: [{ model: Route, as: 'route', attributes: ['id', 'route_name'], required: false }],
        },
      ],
    });

    const scoped = route_id
      ? enrollments.filter((e) => e.area && String(e.area.route_id) === String(route_id))
      : enrollments;
    const empty = { as_on_date: asOn, group_by, summary: { total_outstanding: 0, members_count: 0, buckets_count: 0 }, rows: [] };
    if (scoped.length === 0) return empty;

    const enrollmentIds = scoped.map((e) => e.id);

    const installments = await ChitsInstallment.findAll({
      where: {
        enrollment_id: { [Op.in]: enrollmentIds },
        payable_amount: { [Op.gt]: 0 },
        due_date: { [Op.lte]: asOn },
      },
      order: [['due_date', 'ASC']],
    });
    if (installments.length === 0) return empty;

    const payments = await CustomerPayment.findAll({
      where: { chits_installment_id: { [Op.in]: installments.map((i) => i.id) }, payment_status: 1 },
      attributes: ['chits_installment_id', 'received_amount', 'penalty_paid'],
    });
    const paidByInstallment = {};
    const penaltyPaidByInstallment = {};
    payments.forEach((p) => {
      const k = p.chits_installment_id;
      paidByInstallment[k] = (paidByInstallment[k] || 0) + (parseFloat(p.received_amount) || 0);
      penaltyPaidByInstallment[k] = (penaltyPaidByInstallment[k] || 0) + (parseFloat(p.penalty_paid) || 0);
    });

    // Prized = this member has won an auction in this group.
    const auctions = await Auction.findAll({ where: { company_id }, attributes: ['group_id', 'bidder_id'] });
    const prized = new Set(auctions.filter((a) => a.bidder_id).map((a) => a.group_id + ':' + a.bidder_id));

    const suits = await SuitFileInformation.findAll({ where: { company_id }, attributes: ['group_id', 'subscriber_id'] });
    const suitFiled = new Set(suits.map((s) => s.group_id + ':' + s.subscriber_id));

    const bucketOf = (e) => {
      const key = e.group_id + ':' + e.subscriber_id;
      switch (group_by) {
        case 'collection_agent':
          return { id: e.collection_agent_id || 'none', label: (e.collection_agent && e.collection_agent.name) || 'No collection agent' };
        case 'business_agent':
          return { id: e.business_agent_id || 'none', label: (e.business_agent && e.business_agent.name) || 'No business agent' };
        case 'area':
          return { id: e.area_id || 'none', label: (e.area && e.area.area_name) || 'No area' };
        case 'route':
          return { id: (e.area && e.area.route_id) || 'none', label: (e.area && e.area.route && e.area.route.route_name) || 'No route' };
        case 'ps_nps':
          return prized.has(key) ? { id: 'PS', label: 'Prized (PS)' } : { id: 'NPS', label: 'Not prized (NPS)' };
        case 'suit_file':
          return suitFiled.has(key) ? { id: 'SUIT', label: 'Suit filed' } : { id: 'NOSUIT', label: 'No suit' };
        case 'group':
        default:
          return { id: e.group_id, label: (e.group && e.group.group_name) || 'Unknown chit' };
      }
    };

    const enrollmentById = scoped.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
    const buckets = {};
    const membersSeen = new Set();
    let grandTotal = 0;

    installments.forEach((inst) => {
      const e = enrollmentById[inst.enrollment_id];
      if (!e || !e.subscriber) return;

      const payable = parseFloat(inst.payable_amount) || 0;
      const pending = Math.max(0, payable - (paidByInstallment[inst.id] || 0));
      if (pending <= 0) return;

      // Penalty still owed: what the instalment carries, less any penalty already paid on it.
      const penalty = Math.max(0, (parseFloat(inst.penalty_amount) || 0) - (penaltyPaidByInstallment[inst.id] || 0));
      const b = bucketOf(e);
      const bk = String(b.id);

      if (!buckets[bk]) {
        buckets[bk] = { bucket_id: b.id, label: b.label, outstanding_amount: 0, penalty_amount: 0, installments_count: 0, membersMap: {} };
      }
      const bucket = buckets[bk];
      bucket.outstanding_amount += pending;
      bucket.penalty_amount += penalty;
      bucket.installments_count += 1;

      const mk = e.subscriber.id + ':' + e.id;
      if (!bucket.membersMap[mk]) {
        bucket.membersMap[mk] = {
          enrollment_id: e.id,
          member_id: e.subscriber.id,
          name: e.subscriber.name,
          member_code: e.subscriber.member_id,
          mobile_number: e.subscriber.mobile_number,
          group_name: (e.group && e.group.group_name) || '',
          ticket_number: e.group_position_number,
          is_prized: prized.has(e.group_id + ':' + e.subscriber_id),
          collection_agent: (e.collection_agent && e.collection_agent.name) || '',
          business_agent: (e.business_agent && e.business_agent.name) || '',
          area_name: (e.area && e.area.area_name) || '',
          outstanding_amount: 0,
          // Their report splits the month being collected now from everything older.
          current_due: 0,
          previous_due: 0,
          penalty_amount: 0,
          installments_count: 0,
          first_installment_no: null,
          last_installment_no: null,
          oldest_due_date: inst.due_date,
        };
      }
      const m = bucket.membersMap[mk];
      m.outstanding_amount += pending;
      m.installments_count += 1;
      m.penalty_amount += penalty;
      // "Current" is the instalment due in the as-on month; everything before it is arrears.
      if (String(inst.due_date).slice(0, 7) === String(asOn).slice(0, 7)) m.current_due += pending;
      else m.previous_due += pending;
      const instNo = parseInt(inst.installment_no, 10);
      if (!Number.isNaN(instNo)) {
        if (m.first_installment_no === null || instNo < m.first_installment_no) m.first_installment_no = instNo;
        if (m.last_installment_no === null || instNo > m.last_installment_no) m.last_installment_no = instNo;
      }

      membersSeen.add(String(e.subscriber.id));
      grandTotal += pending;
    });

    const rows = Object.values(buckets)
      .map((b) => ({
        bucket_id: b.bucket_id,
        label: b.label,
        outstanding_amount: round2(b.outstanding_amount),
        penalty_amount: round2(b.penalty_amount),
        installments_count: b.installments_count,
        members_count: Object.keys(b.membersMap).length,
        members: Object.values(b.membersMap)
          .map((m) => Object.assign({}, m, {
            outstanding_amount: round2(m.outstanding_amount),
            current_due: round2(m.current_due),
            previous_due: round2(m.previous_due),
            penalty_amount: round2(m.penalty_amount),
            // "18-20 ( 3)" in their report
            installments_range:
              m.first_installment_no === null
                ? ''
                : (m.first_installment_no === m.last_installment_no
                    ? String(m.first_installment_no)
                    : m.first_installment_no + '-' + m.last_installment_no) + ' (' + m.installments_count + ')',
          }))
          .sort((x, y) => y.outstanding_amount - x.outstanding_amount),
      }))
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount);

    return {
      as_on_date: asOn,
      group_by,
      summary: {
        total_outstanding: round2(grandTotal),
        members_count: membersSeen.size,
        buckets_count: rows.length,
      },
      rows,
    };
  }

  /**
   * Everything the eleven registrar forms print, for one chit group.
   * The wording lives in the frontend templates (captured verbatim from the
   * client's current filings — docs/STATUTORY_FORM_TEMPLATES.md); this only
   * supplies the values, with each amount in both figures and words because
   * the forms print them side by side.
   */
  async getStatutoryFormContext({ group_id, report_date, charge_amount = 0, company_id }) {
    const { numberToWordsIndian } = require('../utils/numberToWords');
    const asOn = report_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const company = await Company.findByPk(company_id, {
      attributes: [
        'id', 'company_name', 'company_address', 'gst_number', 'pan_number',
        'foreman_name', 'foreman_father_name', 'foreman_address', 'cin', 'place',
        'registrar_office_address', 'bank_name',
      ],
    });
    if (!company) throw new Error('Company not found');

    const group = await ChitsGroup.findOne({ where: { id: group_id, company_id, is_deleted_status: 0 } });
    if (!group) throw new Error('Chit group not found');

    // Section 13 certification (Forms I and II): every running chit of this company.
    const running = await ChitsGroup.findAll({
      where: { company_id, is_deleted_status: 0, chits_group_status: 1 },
      attributes: ['id', 'chit_amount'],
    });
    const aggregate = running.reduce((sum, g) => sum + (parseFloat(g.chit_amount) || 0), 0);

    const num = (v) => parseFloat(v) || 0;
    const withWords = (v) => ({ value: num(v), words: numberToWordsIndian(num(v)) });

    const chitAmount = num(group.chit_amount);
    const installments = parseInt(group.no_of_installments, 10) || 0;
    // The old system prints the plain instalment, before dividend or deductions.
    const installmentAmount = num(group.installment_amount) || (installments ? chitAmount / installments : 0);

    return {
      report_date: asOn,
      company: {
        name: company.company_name || '',
        address: company.company_address || '',
        foreman_name: company.foreman_name || '',
        foreman_father_name: company.foreman_father_name || '',
        foreman_address: company.foreman_address || '',
        cin: company.cin || '',
        place: company.place || '',
        registrar_office_address: company.registrar_office_address || '',
        bank_name: company.bank_name || '',
        // Which fields are still blank — the form pages warn before printing.
        missing: ['foreman_name', 'foreman_father_name', 'foreman_address', 'cin', 'place', 'registrar_office_address']
          .filter((f) => !company[f]),
      },
      group: {
        id: group.id,
        name: group.group_name || '',
        chit_amount: withWords(chitAmount),
        installment_amount: withWords(Math.round(installmentAmount)),
        installments,
        installments_words: numberToWordsIndian(installments),
        tickets: installments,
        tickets_words: numberToWordsIndian(installments),
        agreement_number: group.chit_agreement_number || '',
        company_chit_number: group.company_chit_number || '',
        pso_date: group.pso_date || null,
        pso_number: group.pso_number || '',
        commencement_date: group.commencement_date || null,
        start_date: group.chit_start_date || null,
        end_date: group.chit_end_date || null,
        auction_date: group.auction_date || null,
        status: group.chits_group_status,
        fdr: {
          number: group.fdr_number || '',
          amount: withWords(num(group.fdr_amount)),
          date: group.fdr_date || null,
          maturity_date: group.maturity_date || null,
          maturity_amount: withWords(num(group.fdr_mat_amt)),
          bank_name: group.bank_name || '',
          bank_branch: group.bank_branch || '',
        },
      },
      charge_amount: withWords(charge_amount),
      aggregate_chit_amount: withWords(aggregate),
      running_chits_count: running.length,
    };
  }


  /**
   * The data behind every dues notice (P.R.L, P.R.L.G, U.C.P.L, M.R.C.L,
   * Forman, Legal, Advocate…). One block per defaulting member: who they are,
   * which instalments are unpaid, and the totals block the letters print.
   * Wording lives in the frontend templates — docs/LEGAL_NOTICE_TEMPLATES.md.
   *
   * Nothing here writes. The old system could post incidental charges while
   * "previewing" a notice; ours never does — charges are a separate entry.
   */
  async getNoticeData({
    group_id, ticket_from, ticket_to, notice_date, default_months = 1,
    incidental_charges = 0, company_id,
  }) {
    const asOn = notice_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const round2 = (n) => parseFloat(Number(n).toFixed(2));

    const company = await Company.findByPk(company_id, {
      attributes: ['company_name', 'company_address', 'notice_charges'],
    });

    const where = { company_id, delete_status: 0 };
    if (group_id) where.group_id = group_id;

    const enrollments = await Enrollment.findAll({
      where,
      include: [
        {
          model: Member, as: 'subscriber',
          attributes: ['id', 'name', 'member_id', 'mobile_number', 'parental_name',
            'address_info_street_name', 'address_info_city_id'],
        },
        { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments', 'pso_number'], required: true },
      ],
    });

    const inRange = enrollments.filter((e) => {
      const t = parseInt(e.group_position_number, 10);
      if (Number.isNaN(t)) return false;
      if (ticket_from != null && ticket_from !== '' && t < parseInt(ticket_from, 10)) return false;
      if (ticket_to != null && ticket_to !== '' && t > parseInt(ticket_to, 10)) return false;
      return true;
    });
    if (inRange.length === 0) return { notice_date: asOn, company: { name: '', address: '' }, count: 0, rows: [] };

    const installments = await ChitsInstallment.findAll({
      where: {
        enrollment_id: { [Op.in]: inRange.map((e) => e.id) },
        payable_amount: { [Op.gt]: 0 },
        due_date: { [Op.lte]: asOn },
      },
      order: [['due_date', 'ASC']],
    });

    const payments = installments.length
      ? await CustomerPayment.findAll({
          where: { chits_installment_id: { [Op.in]: installments.map((i) => i.id) }, payment_status: 1 },
          attributes: ['chits_installment_id', 'received_amount', 'penalty_paid'],
        })
      : [];
    const paidBy = payments.reduce((acc, p) => {
      const k = p.chits_installment_id;
      acc[k] = acc[k] || { paid: 0, penalty: 0 };
      acc[k].paid += parseFloat(p.received_amount) || 0;
      acc[k].penalty += parseFloat(p.penalty_paid) || 0;
      return acc;
    }, {});

    // "Less At Credit" — money of theirs the office already holds.
    const advances = await MemberAdvance.findAll({
      where: { company_id, member_id: { [Op.in]: inRange.map((e) => e.subscriber_id) } },
      attributes: ['member_id', 'balance'],
    });
    const creditByMember = advances.reduce((acc, a) => {
      acc[a.member_id] = (acc[a.member_id] || 0) + (parseFloat(a.balance) || 0);
      return acc;
    }, {});

    const monthName = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
    const newCharges = incidental_charges !== '' && incidental_charges != null
      ? parseFloat(incidental_charges) || 0
      : parseFloat(company?.notice_charges) || 0;

    const rows = [];
    inRange.forEach((e) => {
      const mine = installments.filter((i) => i.enrollment_id === e.id);
      const lines = [];
      let dues = 0;
      let penalty = 0;

      mine.forEach((inst) => {
        const payable = parseFloat(inst.payable_amount) || 0;
        const paid = paidBy[inst.id]?.paid || 0;
        const pending = Math.max(0, payable - paid);
        if (pending <= 0) return;

        const instPenalty = Math.max(0, (parseFloat(inst.penalty_amount) || 0) - (paidBy[inst.id]?.penalty || 0));
        dues += pending;
        penalty += instPenalty;
        lines.push({
          installment_no: inst.installment_no,
          month: monthName(inst.due_date),
          due_date: inst.due_date,
          subscription: round2(pending),
          dividend: 0, // DFD/dividend column — not modelled yet
          net_due: round2(pending),
        });
      });

      // Only members who are behind by at least the requested number of months.
      if (lines.length < Math.max(1, parseInt(default_months, 10) || 1)) return;

      const credit = creditByMember[e.subscriber_id] || 0;
      const totalDue = round2(dues + penalty - credit + newCharges);

      rows.push({
        enrollment_id: e.id,
        member: {
          id: e.subscriber.id,
          name: e.subscriber.name,
          member_code: e.subscriber.member_id,
          father_name: e.subscriber.parental_name || '',
          address: e.subscriber.address_info_street_name || '',
          mobile_number: e.subscriber.mobile_number || '',
        },
        group_name: e.group.group_name,
        ticket_number: e.group_position_number,
        chit_amount: round2(parseFloat(e.group.chit_amount) || 0),
        installments: e.group.no_of_installments,
        pso_number: e.group.pso_number || '0',
        lines,
        totals: {
          dues: round2(dues),
          penalty: round2(penalty),
          less_at_credit: round2(credit),
          old_incidental_charges: 0, // not modelled — see docs/LEGAL_NOTICE_TEMPLATES.md
          new_incidental_charges: round2(newCharges),
          total_due: totalDue,
        },
      });
    });

    rows.sort((a, b) => (parseInt(a.ticket_number, 10) || 0) - (parseInt(b.ticket_number, 10) || 0));

    return {
      notice_date: asOn,
      company: { name: company?.company_name || '', address: company?.company_address || '' },
      count: rows.length,
      rows,
    };
  }


  /**
   * Every recorded auction in a date range, one row each. Serves the bidders
   * list, the bids register, the dividend list and the GST and turnover
   * statements — they are different cuts of the same rows. Figures are shown as
   * the auction screen stored them; nothing is recalculated here.
   */
  async getAuctionRegister({ from_date, to_date, group_id, company_id }) {
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const where = { company_id };
    if (group_id) where.group_id = group_id;
    if (from_date && to_date) where.auction_date = { [Op.between]: [from_date, to_date] };
    else if (from_date) where.auction_date = { [Op.gte]: from_date };
    else if (to_date) where.auction_date = { [Op.lte]: to_date };

    const auctions = await Auction.findAll({ where, order: [['auction_date', 'ASC'], ['auction_number', 'ASC']] });
    if (auctions.length === 0) {
      return { summary: { auctions: 0, chit_value: 0, bid_loss: 0, commission: 0, gst: 0, dividend_pool: 0, prize: 0 }, rows: [] };
    }

    const groupIds = [...new Set(auctions.map((a) => a.group_id))];
    const groups = await ChitsGroup.findAll({ where: { id: { [Op.in]: groupIds } }, attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments'] });
    const groupById = groups.reduce((acc, g) => { acc[g.id] = g; return acc; }, {});

    const bidderIds = [...new Set(auctions.map((a) => a.bidder_id).filter(Boolean))];
    const bidders = bidderIds.length
      ? await Member.findAll({ where: { id: { [Op.in]: bidderIds } }, attributes: ['id', 'name', 'member_id', 'mobile_number'] })
      : [];
    const bidderById = bidders.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

    // The winner's ticket: the auction row may not carry it, the enrollment does.
    const enrollments = bidderIds.length
      ? await Enrollment.findAll({
          where: { company_id, group_id: { [Op.in]: groupIds }, subscriber_id: { [Op.in]: bidderIds }, delete_status: 0 },
          attributes: ['group_id', 'subscriber_id', 'group_position_number'],
        })
      : [];
    const ticketOf = (gid, sid) => {
      const e = enrollments.find((x) => x.group_id === gid && x.subscriber_id === sid);
      return e ? e.group_position_number : null;
    };

    const rows = auctions.map((a) => {
      const g = groupById[a.group_id];
      const w = a.bidder_id ? bidderById[a.bidder_id] : null;
      const chitValue = round2(a.chit_amount || (g && g.chit_amount));
      return {
        id: a.id,
        auction_number: a.auction_number,
        auction_date: a.auction_date,
        group_id: a.group_id,
        group_name: (g && g.group_name) || '',
        installments: a.installments || (g && g.no_of_installments) || null,
        winner_id: a.bidder_id || null,
        winner_name: w ? w.name : '',
        winner_code: w ? w.member_id : '',
        winner_mobile: w ? w.mobile_number : '',
        ticket_number: a.ticket_number || (a.bidder_id ? ticketOf(a.group_id, a.bidder_id) : null),
        chit_value: chitValue,
        bid_amount: round2(a.bid_amount),
        bid_loss: round2(a.bid_loss),
        commission: round2(a.company_commission),
        gst_percent: a.gst_number_percentage != null ? Number(a.gst_number_percentage) : null,
        gst: round2(a.gst_amount),
        net_prize_payable: round2(a.bid_payable),
        dividend_pool: round2(a.dividend_payable),
        dividend_per_subscriber: round2(a.dividend),
        subscription: round2(a.subscription_amount),
        net_subscription: round2(a.net_payable),
        minutes_filing_date: a.minutes_filing_date || null,
        due_date: a.due_date || null,
      };
    });

    const sum = (k) => round2(rows.reduce((s, r) => s + (r[k] || 0), 0));
    return {
      summary: {
        auctions: rows.length,
        chit_value: sum('chit_value'),
        bid_loss: sum('bid_loss'),
        prize: sum('bid_amount'),
        commission: sum('commission'),
        gst: sum('gst'),
        dividend_pool: sum('dividend_pool'),
      },
      rows,
    };
  }


  /**
   * Verified receipts in a date range, one row each, with the money split by
   * how it came in. Serves the Daily Collection Register, the monthly summary
   * and the cheque enquiry. A mixed receipt is split using its stored cash /
   * UPI / bank parts; money applied from a member's advance (mode 6) is kept
   * apart because it is not fresh money.
   */
  async getCollectionRegister({ from_date, to_date, group_id, payment_mode, company_id }) {
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const MODE = { 1: 'Cash', 2: 'UPI', 3: 'Cheque', 4: 'Bank', 5: 'Mixed', 6: 'From Advance' };

    const where = { payment_status: 1 };
    if (from_date && to_date) where.payment_date = { [Op.between]: [from_date, to_date] };
    else if (from_date) where.payment_date = { [Op.gte]: from_date };
    else if (to_date) where.payment_date = { [Op.lte]: to_date };
    if (payment_mode) where.payment_mode = payment_mode;

    const enrollmentWhere = { company_id };
    if (group_id) enrollmentWhere.group_id = group_id;

    const payments = await CustomerPayment.findAll({
      where,
      include: [{
        model: ChitsInstallment, as: 'installment', required: true, attributes: ['id', 'installment_no', 'due_date'],
        include: [{
          model: Enrollment, as: 'enrollment', required: true, where: enrollmentWhere,
          attributes: ['id', 'group_id', 'group_position_number', 'subscriber_id'],
          include: [
            { model: Member, as: 'subscriber', attributes: ['id', 'name', 'member_id'] },
            { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name'] },
          ],
        }],
      }],
      order: [['payment_date', 'ASC'], ['createdAt', 'ASC']],
    });

    // Who collected it: the agent for field collections, else whoever recorded it.
    const subIds = [...new Set(payments.map((p) => p.collection_agent_amount_id).filter(Boolean))];
    const subs = subIds.length
      ? await CollectionAgentAmount.findAll({
          where: { id: { [Op.in]: subIds } },
          attributes: ['id', 'collection_agent_id'],
          include: [{ model: Member, as: 'collection_agent', attributes: ['id', 'name'] }],
        })
      : [];
    const agentBySub = subs.reduce((acc, s) => { acc[s.id] = s.collection_agent ? s.collection_agent.name : ''; return acc; }, {});

    const rows = payments.map((p) => {
      const e = p.installment.enrollment;
      const total = (parseFloat(p.received_amount) || 0) + (parseFloat(p.penalty_paid) || 0);
      const split = { cash: 0, upi: 0, bank: 0, cheque: 0, advance: 0, other: 0 };
      const mode = Number(p.payment_mode);
      const parts = (parseFloat(p.cash_amount) || 0) + (parseFloat(p.upi_amount) || 0) + (parseFloat(p.bank_amount) || 0);

      if (mode === 6) split.advance = total;
      else if (mode === 3) split.cheque = total;
      else if (parts > 0) {
        split.cash = parseFloat(p.cash_amount) || 0;
        split.upi = parseFloat(p.upi_amount) || 0;
        split.bank = parseFloat(p.bank_amount) || 0;
        const rest = total - parts;
        if (Math.abs(rest) > 0.009) split.other = rest; // parts that don't add up are shown, not hidden
      } else if (mode === 1) split.cash = total;
      else if (mode === 2) split.upi = total;
      else if (mode === 4) split.bank = total;
      else split.other = total;

      return {
        id: p.id,
        payment_date: p.payment_date,
        receipt_number: p.receipt_number || '',
        member_name: e.subscriber ? e.subscriber.name : '',
        member_code: e.subscriber ? e.subscriber.member_id : '',
        group_name: e.group ? e.group.group_name : '',
        ticket_number: e.group_position_number,
        installment_no: p.installment.installment_no,
        mode,
        mode_label: MODE[mode] || 'Other',
        received: round2(p.received_amount),
        penalty: round2(p.penalty_paid),
        total: round2(total),
        total_words: require('../utils/numberToWords').numberToWordsIndian(Math.round(total)),
        cash: round2(split.cash),
        upi: round2(split.upi),
        bank: round2(split.bank),
        cheque: round2(split.cheque),
        advance: round2(split.advance),
        other: round2(split.other),
        cheque_number: p.cheque_number || '',
        cheque_date: p.cheque_date || null,
        reference: p.transaction_reference || '',
        collected_by: p.collection_agent_amount_id
          ? agentBySub[p.collection_agent_amount_id] || 'Agent'
          : p.recorded_by_name || 'Office',
        source: p.collection_agent_amount_id ? 'Agent' : 'Office',
      };
    });

    const sum = (k) => round2(rows.reduce((s, r) => s + (r[k] || 0), 0));
    const company = await Company.findByPk(company_id, { attributes: ['company_name', 'company_address', 'gst_number'] });
    return {
      company: {
        name: company ? company.company_name : '',
        address: company ? company.company_address || '' : '',
        gst_number: company ? company.gst_number || '' : '',
      },
      summary: {
        receipts: rows.length,
        total: sum('total'),
        cash: sum('cash'),
        upi: sum('upi'),
        bank: sum('bank'),
        cheque: sum('cheque'),
        advance: sum('advance'),
        other: sum('other'),
        penalty: sum('penalty'),
      },
      rows,
    };
  }


  /**
   * Every live enrollment with the member behind it. The group-wise subscriber
   * list and the persons report are two views of these rows.
   */
  async getSubscriberRegister({ group_id, company_id }) {
    const where = { company_id, delete_status: 0 };
    if (group_id) where.group_id = group_id;

    const enrollments = await Enrollment.findAll({
      where,
      include: [
        { model: Member, as: 'subscriber', attributes: ['id', 'name', 'member_id', 'mobile_number', 'parental_name', 'is_active'] },
        { model: Member, as: 'collection_agent', attributes: ['id', 'name'], required: false },
        { model: Member, as: 'business_agent', attributes: ['id', 'name'], required: false },
        { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chit_amount', 'chits_group_status'], required: true, where: { is_deleted_status: 0 } },
        { model: Area, as: 'area', attributes: ['id', 'area_name'], required: false },
      ],
      order: [['group_id', 'ASC'], ['group_position_number', 'ASC']],
    });

    const auctions = await Auction.findAll({ where: { company_id }, attributes: ['group_id', 'bidder_id'] });
    const prized = new Set(auctions.filter((a) => a.bidder_id).map((a) => a.group_id + ':' + a.bidder_id));

    const rows = enrollments
      .filter((e) => e.subscriber)
      .map((e) => ({
        enrollment_id: e.id,
        member_id: e.subscriber.id,
        member_code: e.subscriber.member_id,
        name: e.subscriber.name,
        father_name: e.subscriber.parental_name || '',
        mobile_number: e.subscriber.mobile_number || '',
        group_id: e.group_id,
        group_name: e.group.group_name,
        chit_amount: parseFloat(e.group.chit_amount) || 0,
        ticket_number: e.group_position_number,
        enrollment_date: e.enrollment_date,
        is_prized: prized.has(e.group_id + ':' + e.subscriber_id),
        collection_agent: (e.collection_agent && e.collection_agent.name) || '',
        business_agent: (e.business_agent && e.business_agent.name) || '',
        area_name: (e.area && e.area.area_name) || '',
      }));

    return { count: rows.length, members: new Set(rows.map((r) => r.member_id)).size, rows };
  }

  /**
   * Members who look like the same person: same mobile number, or same name
   * once case and spacing are ignored. Nothing is merged — this only points.
   */
  async getRepeatedPersons({ match = 'mobile', company_id }) {
    const members = await Member.findAll({
      where: { company_id, is_deleted_status: 0 },
      attributes: ['id', 'name', 'member_id', 'mobile_number', 'parental_name', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    const keyOf = (m) => {
      if (match === 'name') return (m.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const digits = String(m.mobile_number || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : ''; // last 10: ignores +91 / 0 prefixes
    };

    const groups = {};
    members.forEach((m) => {
      const k = keyOf(m);
      if (!k) return;
      (groups[k] = groups[k] || []).push({
        id: m.id,
        name: m.name,
        member_code: m.member_id,
        mobile_number: m.mobile_number || '',
        father_name: m.parental_name || '',
        created_at: m.createdAt,
      });
    });

    const rows = Object.entries(groups)
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ key, count: list.length, members: list }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    return { match, sets: rows.length, members: rows.reduce((s, r) => s + r.count, 0), rows };
  }


  /**
   * A member's account copy for one ticket: the instalments that have fallen
   * due (debits) and the verified receipts against them (credits), with a
   * running balance. Future instalments are not debited — only what was due by
   * the as-on date, the same rule the outstanding reports use.
   */
  async getAccountCopy({ member_id, enrollment_id, as_on_date, company_id }) {
    const asOn = as_on_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const MODE = { 1: 'Cash', 2: 'UPI', 3: 'Cheque', 4: 'Bank', 5: 'Mixed', 6: 'From Advance' };

    const member = await Member.findOne({
      where: { id: member_id, company_id },
      attributes: ['id', 'name', 'member_id', 'mobile_number', 'parental_name'],
    });
    if (!member) throw new Error('Member not found');

    const enrollments = await Enrollment.findAll({
      where: { company_id, subscriber_id: member.id, delete_status: 0 },
      include: [{ model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments'], required: true }],
      order: [['enrollment_date', 'ASC'], ['id', 'ASC']],
    });
    const tickets = enrollments.map((e) => ({
      enrollment_id: e.id,
      group_name: e.group.group_name,
      ticket_number: e.group_position_number,
    }));

    const chosen = enrollment_id ? enrollments.find((e) => String(e.id) === String(enrollment_id)) : enrollments[0];
    const base = {
      as_on_date: asOn,
      member: { id: member.id, name: member.name, member_code: member.member_id, mobile_number: member.mobile_number || '', father_name: member.parental_name || '' },
      tickets,
    };
    if (!chosen) return { ...base, ticket: null, receipts: [], ledger: [], totals: null };

    const installments = await ChitsInstallment.findAll({
      where: { enrollment_id: chosen.id },
      order: [['due_date', 'ASC'], ['installment_no', 'ASC']],
    });
    const payments = installments.length
      ? await CustomerPayment.findAll({
          where: { chits_installment_id: { [Op.in]: installments.map((i) => i.id) }, payment_status: 1 },
          order: [['payment_date', 'ASC'], ['createdAt', 'ASC']],
        })
      : [];
    const instNoById = installments.reduce((acc, i) => { acc[i.id] = i.installment_no; return acc; }, {});

    const receipts = payments.map((p) => ({
      id: p.id,
      date: p.payment_date,
      receipt_number: p.receipt_number || '',
      installment_no: instNoById[p.chits_installment_id],
      received: round2(p.received_amount),
      penalty: round2(p.penalty_paid),
      total: round2((parseFloat(p.received_amount) || 0) + (parseFloat(p.penalty_paid) || 0)),
      mode: MODE[Number(p.payment_mode)] || 'Other',
    }));

    // Debits: instalments due by the as-on date. Credits: every verified receipt.
    const entries = [];
    installments
      .filter((i) => String(i.due_date) <= asOn && (parseFloat(i.payable_amount) || 0) > 0)
      .forEach((i) => entries.push({
        date: i.due_date, order: 0, particulars: `Instalment ${i.installment_no} due`,
        debit: round2(i.payable_amount), credit: 0,
      }));
    receipts.forEach((r) => entries.push({
      date: r.date, order: 1,
      particulars: `Receipt ${r.receipt_number || ''} — Inst. ${r.installment_no} (${r.mode})`.replace('  ', ' '),
      debit: 0, credit: r.received, // penalty is shown on the receipt, not against the instalment balance
    }));
    entries.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order);

    let balance = 0;
    const ledger = entries.map((e) => {
      balance = round2(balance + e.debit - e.credit);
      return { date: e.date, particulars: e.particulars, debit: e.debit, credit: e.credit, balance };
    });

    const debits = round2(ledger.reduce((s, l) => s + l.debit, 0));
    const credits = round2(ledger.reduce((s, l) => s + l.credit, 0));

    return {
      ...base,
      ticket: {
        enrollment_id: chosen.id,
        group_name: chosen.group.group_name,
        ticket_number: chosen.group_position_number,
        chit_amount: round2(chosen.group.chit_amount),
        installments: chosen.group.no_of_installments,
        enrollment_date: chosen.enrollment_date,
      },
      receipts,
      ledger,
      totals: {
        due: debits,
        paid: credits,
        penalty_paid: round2(receipts.reduce((s, r) => s + r.penalty, 0)),
        balance: round2(debits - credits), // positive = member owes; negative = paid ahead
      },
    };
  }


  /**
   * Every group's security deposit (FDR). A group's FDR becomes due for release
   * once the group has completed (status 2); until then it stays pledged.
   */
  async getFdrStatement({ company_id }) {
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const STATUS = { 0: 'Planning', 1: 'Running', 2: 'Completed' };
    const groups = await ChitsGroup.findAll({
      where: { company_id, is_deleted_status: 0 },
      order: [['group_name', 'ASC']],
    });
    const rows = groups
      .filter((g) => g.fdr_number || (parseFloat(g.fdr_amount) || 0) > 0)
      .map((g) => ({
        group_id: g.id,
        group_name: g.group_name,
        chit_amount: round2(g.chit_amount),
        status: g.chits_group_status,
        status_label: STATUS[g.chits_group_status] || 'Unknown',
        fdr_number: g.fdr_number || '',
        fdr_type: g.fdr_type || '',
        fdr_date: g.fdr_date || null,
        fdr_amount: round2(g.fdr_amount),
        months: g.no_of_months || null,
        roi_per_year: g.roi_per_year != null ? Number(g.roi_per_year) : null,
        maturity_date: g.maturity_date || null,
        maturity_amount: round2(g.fdr_mat_amt),
        bank_name: g.bank_name || '',
        bank_branch: g.bank_branch || '',
        release_due: Number(g.chits_group_status) === 2,
      }));
    const sum = (k) => round2(rows.reduce((s, r) => s + (r[k] || 0), 0));
    return {
      summary: {
        fdrs: rows.length,
        fdr_amount: sum('fdr_amount'),
        maturity_amount: sum('maturity_amount'),
        release_due: rows.filter((r) => r.release_due).length,
        groups_without_fdr: groups.length - rows.length,
      },
      rows,
    };
  }

  /**
   * Each stored agent target against what the agent actually did in the same
   * period. The measure is stated per row, because the two agent types are
   * judged differently:
   *   collection agent (18) — collections the office verified in the period
   *   business agent (16)   — chit value of members they enrolled in the period
   */
  async getAgentTargetReport({ from_date, to_date, company_id }) {
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const where = { company_id };
    // Targets whose period overlaps the one asked for.
    if (from_date) where.to_date = { [Op.gte]: from_date };
    if (to_date) where.from_date = { [Op.lte]: to_date };

    const targets = await AgentTargetEntry.findAll({ where, order: [['from_date', 'ASC']] });
    const agentIds = [...new Set(targets.map((t) => t.agent_id))];
    const agents = agentIds.length
      ? await Member.findAll({ where: { id: { [Op.in]: agentIds } }, attributes: ['id', 'name', 'member_id'] })
      : [];
    const agentById = agents.reduce((acc, a) => { acc[a.id] = a; return acc; }, {});

    const rows = [];
    for (const t of targets) {
      const start = t.from_date;
      const end = t.to_date;
      const type = Number(t.agent_type_id);
      let achieved = 0;
      let measure = '';

      if (type === 18) {
        measure = 'Verified collections';
        const subs = await CollectionAgentAmount.findAll({
          where: {
            collection_agent_id: t.agent_id,
            status: 2,
            confirm_date: { [Op.between]: [`${start} 00:00:00`, `${end} 23:59:59`] },
          },
          attributes: ['received_amount'],
        });
        achieved = subs.reduce((s, x) => s + (parseFloat(x.received_amount) || 0), 0);
      } else if (type === 16) {
        measure = 'Chit value enrolled';
        const enrolled = await Enrollment.findAll({
          where: { company_id, business_agent_id: t.agent_id, delete_status: 0, enrollment_date: { [Op.between]: [start, end] } },
          include: [{ model: ChitsGroup, as: 'group', attributes: ['chit_amount'] }],
        });
        achieved = enrolled.reduce((s, e) => s + (parseFloat(e.group && e.group.chit_amount) || 0), 0);
      }

      const target = parseFloat(t.target_amount) || 0;
      const a = agentById[t.agent_id];
      rows.push({
        id: t.id,
        agent_id: t.agent_id,
        agent_name: a ? a.name : '',
        agent_code: a ? a.member_id : '',
        agent_type: type === 16 ? 'Business Agent' : type === 18 ? 'Collection Agent' : 'Agent',
        from_date: start,
        to_date: end,
        target: round2(target),
        achieved: round2(achieved),
        measure,
        shortfall: round2(Math.max(0, target - achieved)),
        percent: target > 0 ? Math.round((achieved / target) * 1000) / 10 : null,
      });
    }
    return { count: rows.length, rows };
  }

  /**
   * Member advances: money received ahead of dues, and how it was used against
   * instalments later. Balances are as stored on each advance.
   */
  async getAdvanceRegister({ from_date, to_date, company_id }) {
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const inRange = (d) => (!from_date || String(d) >= from_date) && (!to_date || String(d).slice(0, 10) <= to_date);

    const advances = await MemberAdvance.findAll({ where: { company_id }, order: [['date', 'ASC'], ['id', 'ASC']] });
    const memberIds = [...new Set(advances.map((a) => a.member_id))];
    const members = memberIds.length
      ? await Member.findAll({ where: { id: { [Op.in]: memberIds } }, attributes: ['id', 'name', 'member_id'] })
      : [];
    const memberById = members.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

    const applied = advances.length
      ? await CustomerPayment.findAll({
          where: { member_advance_id: { [Op.in]: advances.map((a) => a.id) }, payment_status: 1 },
          include: [{ model: ChitsInstallment, as: 'installment', attributes: ['installment_no'] }],
        })
      : [];

    const rows = [];
    advances.forEach((a) => {
      const m = memberById[a.member_id];
      const date = a.date || a.createdAt;
      if (inRange(date)) {
        rows.push({
          key: `in-${a.id}`, date, kind: 'Received', member_name: m ? m.name : '', member_code: m ? m.member_id : '',
          particulars: a.narration || (a.collection_agent_amount_id ? 'Excess from agent collection' : 'Advance received'),
          received: round2(a.amount), adjusted: 0,
        });
      }
    });
    applied.forEach((p) => {
      const a = advances.find((x) => x.id === p.member_advance_id);
      const m = a ? memberById[a.member_id] : null;
      if (!inRange(p.payment_date)) return;
      rows.push({
        key: `out-${p.id}`, date: p.payment_date, kind: 'Adjusted', member_name: m ? m.name : '', member_code: m ? m.member_id : '',
        particulars: `Applied to instalment ${p.installment ? p.installment.installment_no : ''} — receipt ${p.receipt_number || ''}`.trim(),
        received: 0, adjusted: round2((parseFloat(p.received_amount) || 0) + (parseFloat(p.penalty_paid) || 0)),
      });
    });
    rows.sort((x, y) => String(x.date).localeCompare(String(y.date)));

    return {
      summary: {
        received: round2(rows.reduce((s, r) => s + r.received, 0)),
        adjusted: round2(rows.reduce((s, r) => s + r.adjusted, 0)),
        balance_now: round2(advances.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0)),
      },
      rows,
    };
  }

  /**
   * One group, one line per ticket: what has fallen due, what has been paid
   * against it, and the balance. Same as-on rule as the outstanding reports.
   */
  async getSubscriberLedger({ group_id, as_on_date, company_id }) {
    const asOn = as_on_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
    const enrollments = await Enrollment.findAll({
      where: { company_id, group_id, delete_status: 0 },
      include: [{ model: Member, as: 'subscriber', attributes: ['id', 'name', 'member_id', 'mobile_number'] }],
      order: [['group_position_number', 'ASC']],
    });
    if (enrollments.length === 0) return { as_on_date: asOn, summary: { due: 0, paid: 0, balance: 0 }, rows: [] };

    const installments = await ChitsInstallment.findAll({ where: { enrollment_id: { [Op.in]: enrollments.map((e) => e.id) } } });
    const payments = installments.length
      ? await CustomerPayment.findAll({
          where: { chits_installment_id: { [Op.in]: installments.map((i) => i.id) }, payment_status: 1 },
          attributes: ['chits_installment_id', 'received_amount', 'penalty_paid'],
        })
      : [];
    const auctions = await Auction.findAll({ where: { company_id, group_id }, attributes: ['bidder_id'] });
    const prized = new Set(auctions.map((a) => a.bidder_id).filter(Boolean));

    const rows = enrollments.map((e) => {
      const mine = installments.filter((i) => i.enrollment_id === e.id);
      const ids = new Set(mine.map((i) => i.id));
      const due = mine.filter((i) => String(i.due_date) <= asOn).reduce((s, i) => s + (parseFloat(i.payable_amount) || 0), 0);
      const pays = payments.filter((p) => ids.has(p.chits_installment_id));
      const paid = pays.reduce((s, p) => s + (parseFloat(p.received_amount) || 0), 0);
      const penalty = pays.reduce((s, p) => s + (parseFloat(p.penalty_paid) || 0), 0);
      return {
        enrollment_id: e.id,
        ticket_number: e.group_position_number,
        member_name: e.subscriber ? e.subscriber.name : '',
        member_code: e.subscriber ? e.subscriber.member_id : '',
        mobile_number: e.subscriber ? e.subscriber.mobile_number || '' : '',
        is_prized: prized.has(e.subscriber_id),
        installments_due: mine.filter((i) => String(i.due_date) <= asOn).length,
        due: round2(due),
        paid: round2(paid),
        penalty_paid: round2(penalty),
        balance: round2(due - paid),
      };
    });
    const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
    return { as_on_date: asOn, summary: { due: sum('due'), paid: sum('paid'), balance: sum('balance') }, rows };
  }


  /** Chit groups for a picker: id and name only. */
  async getGroupOptions({ company_id }) {
    const groups = await ChitsGroup.findAll({
      where: { company_id, is_deleted_status: 0 },
      attributes: ['id', 'group_name', 'chits_group_status'],
      order: [['group_name', 'ASC']],
    });
    return groups.map((g) => ({ id: g.id, group_name: g.group_name, status: g.chits_group_status }));
  }

  /** Members for a picker: id, name, code and what they were introduced as (to tell agents apart). */
  async getMemberOptions({ company_id }) {
    const members = await Member.findAll({
      where: { company_id, is_deleted_status: 0 },
      attributes: ['id', 'name', 'member_id', 'introduced_as'],
      order: [['name', 'ASC']],
    });
    const asArray = (v) => {
      if (Array.isArray(v)) return v.map(Number);
      if (typeof v === 'string') { try { return JSON.parse(v).map(Number); } catch { return [Number(v)].filter(Boolean); } }
      return v != null ? [Number(v)] : [];
    };
    return members.map((m) => ({ id: m.id, name: m.name, member_code: m.member_id, introduced_as: asArray(m.introduced_as) }));
  }
}

module.exports = new ReportService();
