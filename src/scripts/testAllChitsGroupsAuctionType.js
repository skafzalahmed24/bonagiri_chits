'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, Enrollment, ChitsGroup } = require('../models');

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

async function testAllChitsGroups() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing /api/user/all-chits-groups with auction_type parameter ---');

    // Find a member with enrollments
    const enrollment = await Enrollment.findOne({ where: { delete_status: 0 } });
    if (!enrollment) {
      console.log('No enrollment found for testing, skipping live subscriber test.');
      server.close();
      process.exit(0);
    }

    const subscriberId = enrollment.subscriber_id;
    const member = await Member.findByPk(subscriberId);

    const token = jwt.sign({
      id: subscriberId,
      user_id: member ? member.other_info_user_code : subscriberId,
      role: 'member',
      company_id: member ? member.company_id : 1
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = {
      Authorization: `Bearer ${token}`
    };

    // 1. All groups without auction_type
    let res = await request(baseUrl, '/api/user/all-chits-groups', 'POST', {
      subscriber_id: String(subscriberId),
      type: 0
    }, authHeaders);
    console.log('1. All groups response status:', res.statusCode, 'count:', res.body.data?.count);
    if (res.body.data?.rows?.length > 0) {
      console.log('Sample row fields:', Object.keys(res.body.data.rows[0]));
      console.log('Sample auction_type:', res.body.data.rows[0].auction_type);
    }

    // 2. Filter by auction_type = 1 (Regular Flow)
    res = await request(baseUrl, '/api/user/all-chits-groups', 'POST', {
      subscriber_id: String(subscriberId),
      auction_type: 1
    }, authHeaders);
    console.log('2. auction_type = 1 response status:', res.statusCode, 'count:', res.body.data?.count);
    if (res.body.data?.rows) {
      res.body.data.rows.forEach(r => {
        if (r.auction_type !== 1) throw new Error(`Expected auction_type 1, got ${r.auction_type}`);
      });
    }

    // 3. Filter by auction_type = 2 (Fixed Chit)
    res = await request(baseUrl, '/api/user/all-chits-groups', 'POST', {
      subscriber_id: String(subscriberId),
      auction_type: 2
    }, authHeaders);
    console.log('3. auction_type = 2 response status:', res.statusCode, 'count:', res.body.data?.count);
    if (res.body.data?.rows) {
      res.body.data.rows.forEach(r => {
        if (r.auction_type !== 2) throw new Error(`Expected auction_type 2, got ${r.auction_type}`);
      });
    }

    console.log('\n✓ /all-chits-groups auction_type filter test PASSED!');
    server.close();
    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    server.close();
    process.exit(1);
  }
}

testAllChitsGroups();
