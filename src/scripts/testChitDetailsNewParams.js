'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, Enrollment, ChitsGroup, Auction, ChitsInstallment, CustomerPayment } = require('../models');

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

async function testNewParams() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing /api/user/chit-details with NEW UI params ---');

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

    const authHeaders = {
      Authorization: `Bearer ${token}`
    };

    const res = await request(baseUrl, '/api/user/chit-details', 'POST', {
      group_id: groupId
    }, authHeaders);

    console.log('Response Status:', res.statusCode);
    console.log('Response Body Data:', JSON.stringify(res.body.data, null, 2));

    const chitGroup = res.body.data.chit_group_details;
    console.log('\n--- Checking Chit Group Details ---');
    console.log('start_date:', chitGroup.start_date);
    console.log('end_date:', chitGroup.end_date);
    console.log('total_amount:', chitGroup.total_amount);
    console.log('pending_amount:', chitGroup.pending_amount);
    console.log('advance_payment:', chitGroup.advance_payment);
    console.log('total_months:', chitGroup.total_months);
    console.log('current_month:', chitGroup.current_month);

    if (chitGroup.start_date === undefined) throw new Error('Missing start_date in chit_group_details');
    if (chitGroup.end_date === undefined) throw new Error('Missing end_date in chit_group_details');
    if (chitGroup.total_months === undefined) throw new Error('Missing total_months in chit_group_details');
    if (chitGroup.current_month === undefined) throw new Error('Missing current_month in chit_group_details');

    console.log('\n--- Checking Monthly Activity ---');
    if (res.body.data.monthly_activity && res.body.data.monthly_activity.length > 0) {
      const firstAct = res.body.data.monthly_activity[0];
      console.log('month_count:', firstAct.month_count);
      console.log('total_months_count:', firstAct.total_months_count);
      console.log('month_badge:', firstAct.month_badge);
      console.log('original_amount:', firstAct.original_amount);
      console.log('profit_amount:', firstAct.profit_amount);
      console.log('payable_amount:', firstAct.payable_amount);
      console.log('paid_amount:', firstAct.paid_amount);
      console.log('pending_amount:', firstAct.pending_amount);
      console.log('advance_payment:', firstAct.advance_payment);
      console.log('total_amount:', firstAct.total_amount);
      console.log('is_winner_status:', firstAct.is_winner_status);
      console.log('winner_info:', firstAct.winner_info);
      console.log('member_breakdown count:', firstAct.member_breakdown?.length);
      console.log('breakdown_summary:', firstAct.breakdown_summary);
    }

    console.log('\n✓ ALL assertions PASSED successfully!');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test Failed:', err);
    server.close();
    process.exit(1);
  }
}

testNewParams();
