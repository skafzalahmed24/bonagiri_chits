'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { ChitType, Member } = require('../models');

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

async function testChitTypesApi() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing /api/user/chit-types API ---');

    const member = await Member.findOne();
    const token = jwt.sign({
      id: member ? member.id : 1,
      user_id: member ? member.other_info_user_code : 1,
      role: 'member',
      company_id: member ? member.company_id : 1
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = {
      Authorization: `Bearer ${token}`
    };

    // 1. Test POST /api/user/chit-types (all)
    let res = await request(baseUrl, '/api/user/chit-types', 'POST', {}, authHeaders);
    console.log('1. All chit types POST status:', res.statusCode);
    console.log('Result count:', res.body.data?.count);
    console.log('Rows:', JSON.stringify(res.body.data?.rows, null, 2));

    if (res.statusCode !== 200) throw new Error(`Failed to fetch chit types: ${JSON.stringify(res.body)}`);
    if (res.body.data?.count !== 5) throw new Error(`Expected 5 chit types, got ${res.body.data?.count}`);

    console.log('\n✓ POST /api/user/chit-types test PASSED 100%!');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test Failed:', err);
    server.close();
    process.exit(1);
  }
}

testChitTypesApi();
