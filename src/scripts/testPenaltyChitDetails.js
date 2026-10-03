'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, Enrollment, ChitsGroup, ChitsInstallment, CustomerPayment } = require('../models');

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

async function testPenaltyInChitDetails() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing /api/user/chit-details Penalty & Paid Amounts ---');

    const enrollment = await Enrollment.findOne({ where: { delete_status: 0 } });
    if (!enrollment) {
      console.log('No enrollment found for testing.');
      server.close();
      process.exit(0);
    }

    const subscriberId = enrollment.subscriber_id;
    const groupId = enrollment.group_id;
    const member = await Member.findByPk(subscriberId);

    // Get an installment for this enrollment
    let inst = await ChitsInstallment.findOne({
      where: { enrollment_id: enrollment.id, installment_no: 1 }
    });

    if (!inst) {
      console.log('No installment #1 found, skipping test.');
      server.close();
      process.exit(0);
    }

    // Set penalty on installment
    await inst.update({
      penalty_amount: 500,
      over_due_days_count: 5
    });

    // Create a payment with 5000 received + 500 penalty
    const testPayment = await CustomerPayment.create({
      chits_installment_id: inst.id,
      received_amount: 5000,
      penalty_paid: 500,
      payment_status: 0,
      payment_date: '2026-10-03',
      payment_mode: 2
    });

    const token = jwt.sign({
      id: subscriberId,
      user_id: member ? member.other_info_user_code : subscriberId,
      role: 'member',
      company_id: member ? member.company_id : 1
    }, JWT_SECRET, { expiresIn: '1h' });

    const res = await request(baseUrl, '/api/user/chit-details', 'POST', {
      group_id: groupId
    }, { Authorization: `Bearer ${token}` });

    console.log('Chit Details Status:', res.statusCode);
    const month1 = res.body.data.monthly_activity.find(m => m.month_count === 1);
    console.log('Month 1 Activity:', {
      payable: month1.payable,
      paid_amount: month1.paid_amount,
      penalty_amount: month1.penalty_amount,
      penalty_text: month1.penalty_text,
      total_amount: month1.total_amount
    });

    const member1 = month1.member_breakdown[0];
    console.log('Member Breakdown:', {
      payable: member1.payable,
      paid_amount: member1.paid_amount,
      penalty_amount: member1.penalty_amount,
      penalty_paid: member1.penalty_paid,
      penalty_text: member1.penalty_text,
      total_amount: member1.total_amount
    });

    if (month1.paid_amount !== 5500) {
      throw new Error(`Expected month1.paid_amount to be 5500, got ${month1.paid_amount}`);
    }
    if (month1.penalty_amount !== 500) {
      throw new Error(`Expected month1.penalty_amount to be 500, got ${month1.penalty_amount}`);
    }
    if (!month1.penalty_text || !month1.penalty_text.includes('500')) {
      throw new Error(`Expected month1.penalty_text to show 500, got ${month1.penalty_text}`);
    }

    // Clean up test payment
    await testPayment.destroy();
    await inst.update({ penalty_amount: 0, over_due_days_count: 0 });

    console.log('\n✓ Penalty and Total Paid Amount verification PASSED 100%!');
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    server.close();
    process.exit(0);
  }
}

testPenaltyInChitDetails();
