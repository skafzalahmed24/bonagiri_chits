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

async function testChitDetails() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing /api/user/chit-details with auction_type parameter ---');

    // Find an enrollment
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

    console.log(`Testing with Subscriber ID: ${subscriberId}, Group ID: ${groupId}, Group actual auction_type: ${group.auction_type}`);

    const token = jwt.sign({
      id: subscriberId,
      user_id: member ? member.other_info_user_code : subscriberId,
      role: 'member',
      company_id: member ? member.company_id : 1
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = {
      Authorization: `Bearer ${token}`
    };

    // 1. Get chit details with group_id only
    let res = await request(baseUrl, '/api/user/chit-details', 'POST', {
      group_id: groupId
    }, authHeaders);

    console.log('1. Basic chit-details response status:', res.statusCode);
    if (res.statusCode !== 200 || res.body.status !== 1) {
      throw new Error(`Failed basic chit-details: ${JSON.stringify(res.body)}`);
    }

    console.log('Returned auction_type at root:', res.body.data.auction_type);
    console.log('Returned auction_type_label at root:', res.body.data.auction_type_label);
    console.log('Returned auction_type in chit_group_details:', res.body.data.chit_group_details?.auction_type);
    console.log('Returned auction_type_label in chit_group_details:', res.body.data.chit_group_details?.auction_type_label);

    if (res.body.data.auction_type === undefined) throw new Error('Missing auction_type in root data');
    if (res.body.data.chit_group_details?.auction_type === undefined) throw new Error('Missing auction_type in chit_group_details');

    // 2. Get chit details with matching auction_type
    res = await request(baseUrl, '/api/user/chit-details', 'POST', {
      group_id: groupId,
      auction_type: group.auction_type
    }, authHeaders);

    console.log('2. Matching auction_type response status:', res.statusCode);
    if (res.statusCode !== 200 || res.body.status !== 1) {
      throw new Error(`Failed matching auction_type: ${JSON.stringify(res.body)}`);
    }

    // 3. Get chit details with opposite/mismatching auction_type
    const oppositeType = group.auction_type === 1 ? 2 : 1;
    res = await request(baseUrl, '/api/user/chit-details', 'POST', {
      group_id: groupId,
      auction_type: oppositeType
    }, authHeaders);

    console.log('3. Mismatched auction_type response status:', res.statusCode, res.body.message);
    if (res.statusCode !== 404) {
      throw new Error('Expected 404 for mismatched auction_type');
    }

    console.log('\n✓ /api/user/chit-details auction_type integration test PASSED 100%!');
    server.close();
    process.exit(0);
  } catch (error) {
    console.error('Test error:', error);
    server.close();
    process.exit(1);
  }
}

testChitDetails();
