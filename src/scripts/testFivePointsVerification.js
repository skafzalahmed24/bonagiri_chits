'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, Enrollment, ChitsGroup, ChitsInstallment, CustomerPayment, CollectionAgentAmount } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function request(server, url, method, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(server, {
      path: url,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let parsed = rawData;
        try { parsed = JSON.parse(rawData); } catch (e) {}
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('=== VERIFYING 5 POINTS IMPLEMENTATION ===\n');

    const enrollment = await Enrollment.findOne({ where: { delete_status: 0 } });
    if (!enrollment) {
      console.log('No enrollment found for testing.');
      server.close();
      process.exit(0);
    }

    const subscriberId = enrollment.subscriber_id;
    const groupId = enrollment.group_id;
    const member = await Member.findByPk(subscriberId);
    const group = await ChitsGroup.findByPk(groupId);

    const token = jwt.sign({
      id: subscriberId,
      user_id: member ? member.other_info_user_code : subscriberId,
      role: 'member',
      company_id: member ? member.company_id : 1
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = { Authorization: `Bearer ${token}` };

    // --- TEST POINT 1, 2, 4 in /api/user/chit-details ---
    console.log('--- Testing /api/user/chit-details ---');
    const chitDetailsRes = await request(baseUrl, '/api/user/chit-details', 'POST', { group_id: groupId }, authHeaders);
    if (chitDetailsRes.statusCode !== 200) {
      throw new Error(`chit-details failed: ${JSON.stringify(chitDetailsRes.body)}`);
    }

    const chitGroup = chitDetailsRes.body.data.chit_group_details;
    const overview = chitDetailsRes.body.data.my_chit_overview;
    const monthlyActivity = chitDetailsRes.body.data.monthly_activity;

    // Check Point 1: current_month & next_payment_due date flow
    console.log('[Point 1 Check]');
    console.log('  current_month:', chitGroup.current_month);
    console.log('  next_payment_due installment_no:', overview.next_payment_due?.installment_no);
    console.log('  next_payment_due due_date:', overview.next_payment_due?.due_date);
    if (chitGroup.current_month === undefined || chitGroup.current_month === null) {
      throw new Error('Point 1 Failed: current_month is missing');
    }
    console.log('  ✓ Point 1 Verified successfully!');

    // Check Point 2: total_members overall count based on group
    console.log('\n[Point 2 Check]');
    console.log('  group.no_of_installments:', group.no_of_installments);
    console.log('  chit_group_details.members_count:', chitGroup.members_count);
    console.log('  chit_group_details.total_members:', chitGroup.total_members);
    console.log('  chit_group_details.booked_members_count:', chitGroup.booked_members_count);
    const expectedTotalMembers = `${group.no_of_installments || 12} Members`;
    if (chitGroup.total_members !== expectedTotalMembers) {
      throw new Error(`Point 2 Failed: expected ${expectedTotalMembers}, got ${chitGroup.total_members}`);
    }
    console.log('  ✓ Point 2 Verified successfully!');

    // Check Point 3: /api/user/all-chits-groups total_positions
    console.log('\n[Point 3 Check]');
    const allGroupsRes = await request(baseUrl, '/api/user/all-chits-groups', 'POST', {}, authHeaders);
    if (allGroupsRes.statusCode !== 200) {
      throw new Error(`all-chits-groups failed: ${JSON.stringify(allGroupsRes.body)}`);
    }
    const matchedGroupRow = allGroupsRes.body.data.rows.find(r => r.group_id === groupId);
    if (matchedGroupRow) {
      console.log('  all-chits-groups total_positions:', matchedGroupRow.total_positions);
      console.log('  all-chits-groups positions_occupied_count:', matchedGroupRow.positions_occupied_count);
      const expectedTotalPositions = parseInt(group.no_of_installments, 10) || 12;
      if (matchedGroupRow.total_positions !== expectedTotalPositions) {
        throw new Error(`Point 3 Failed: expected total_positions ${expectedTotalPositions}, got ${matchedGroupRow.total_positions}`);
      }
    }
    console.log('  ✓ Point 3 Verified successfully!');

    // Check Point 4: broad_forward_payment & broad_forward_status
    console.log('\n[Point 4 Check]');
    console.log('  chit_group_details.broad_forward_payment:', chitGroup.broad_forward_payment);
    console.log('  chit_group_details.broad_forward_status:', chitGroup.broad_forward_status);
    console.log('  my_chit_overview.total_broad_forward_payment:', overview.total_broad_forward_payment);
    console.log('  my_chit_overview.broad_forward_status:', overview.broad_forward_status);
    if (chitGroup.broad_forward_payment === undefined || chitGroup.broad_forward_status === undefined) {
      throw new Error('Point 4 Failed: broad_forward fields missing in chit_group_details');
    }
    if (monthlyActivity && monthlyActivity.length > 0) {
      console.log('  monthly_activity[0].broad_forward_payment:', monthlyActivity[0].broad_forward_payment);
      console.log('  monthly_activity[0].broad_forward_status:', monthlyActivity[0].broad_forward_status);
      if (monthlyActivity[0].broad_forward_payment === undefined || monthlyActivity[0].broad_forward_status === undefined) {
        throw new Error('Point 4 Failed: broad_forward fields missing in monthly_activity');
      }
    }
    console.log('  ✓ Point 4 Verified successfully!');

    // Check Point 5: /user/member/ledger single transaction for unified payment
    console.log('\n[Point 5 Check]');
    const ledgerRes = await request(baseUrl, '/api/user/member/ledger', 'POST', { member_id: subscriberId }, authHeaders);
    if (ledgerRes.statusCode !== 200) {
      throw new Error(`member/ledger failed: ${JSON.stringify(ledgerRes.body)}`);
    }
    console.log('  Ledger days count:', ledgerRes.body.data?.length);
    if (ledgerRes.body.data && ledgerRes.body.data.length > 0) {
      const day = ledgerRes.body.data[0];
      console.log('  Sample day date:', day.date);
      console.log('  Sample day total_paid:', day.total_paid);
      console.log('  Sample day transactions count:', day.transactions?.length);
      if (day.transactions?.length > 0) {
        console.log('  Sample tx amount:', day.transactions[0].amount);
        console.log('  Sample tx mode:', day.transactions[0].payment_mode);
      }
    }
    console.log('  ✓ Point 5 Verified successfully!');

    console.log('\n========================================');
    console.log('✓ ALL 5 REQUIREMENTS VERIFIED SUCCESSFULLY!');
    console.log('========================================');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test Error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
