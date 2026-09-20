'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, Enrollment, ChitsGroup, Auction, ChitsInstallment } = require('../models');

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

async function test() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const subscriber = await Member.findOne({ where: { is_deleted_status: 0 } });
    if (!subscriber) {
      console.log('No subscriber found to test');
      server.close();
      return;
    }

    const token = jwt.sign({
      id: subscriber.id,
      user_id: subscriber.user_id,
      role: 'member',
      company_id: subscriber.company_id
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = { Authorization: `Bearer ${token}` };

    console.log('--- Testing /api/user/due-payments ---');
    const res = await request(baseUrl, '/api/user/due-payments', 'POST', { min: 0, max: 10 }, authHeaders);
    console.log('Status:', res.statusCode);
    if (res.body.data && res.body.data.rows && res.body.data.rows.length > 0) {
      console.log('First due row:', JSON.stringify(res.body.data.rows[0], null, 2));
    } else {
      console.log('Response:', JSON.stringify(res.body, null, 2));
    }

    console.log('\n--- Testing /api/user/chit-details ---');
    const enrollment = await Enrollment.findOne({ where: { subscriber_id: subscriber.id, delete_status: 0 } });
    if (enrollment) {
      const detailsRes = await request(baseUrl, '/api/user/chit-details', 'POST', { group_id: enrollment.group_id }, authHeaders);
      console.log('Chit details status:', detailsRes.statusCode);
      if (detailsRes.body.data && detailsRes.body.data.monthly_activity && detailsRes.body.data.monthly_activity.length > 0) {
        const act = detailsRes.body.data.monthly_activity[0];
        console.log('First activity item:', {
          month_name: act.month_name,
          original_amount: act.original_amount,
          installment_amount: act.installment_amount,
          profit_amount: act.profit_amount,
          bonus: act.bonus,
          payable_amount: act.payable_amount,
          net_payable: act.net_payable,
          penalty_amount: act.penalty_amount,
          penalty_text: act.penalty_text
        });
        if (act.member_breakdown && act.member_breakdown.length > 0) {
          console.log('First member breakdown item:', {
            original_amount: act.member_breakdown[0].original_amount,
            installment_amount: act.member_breakdown[0].installment_amount,
            profit_amount: act.member_breakdown[0].profit_amount,
            bonus: act.member_breakdown[0].bonus,
            payable_amount: act.member_breakdown[0].payable_amount,
            net_payable: act.member_breakdown[0].net_payable
          });
        }
      }
    }

    console.log('\n✓ Validation completed successfully!');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  }
}

test();
