'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, Enrollment } = require('../models');

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

async function testCollectionFloats() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing Collection Agent Floats ---');

    const agentEnrollment = await Enrollment.findOne({
      where: { delete_status: 0 }
    });

    const agentId = agentEnrollment ? (agentEnrollment.collection_agent_id || 1) : 1;

    const token = jwt.sign({
      id: agentId,
      user_id: 1001,
      role: 'collection_agent',
      company_id: '82f8d38e-cf02-4ec0-b8d9-2d129759c864'
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = {
      Authorization: `Bearer ${token}`
    };

    // 1. Total pending collection
    let res = await request(baseUrl, '/api/user/collection-agent/total-pending-collection', 'POST', {}, authHeaders);
    console.log('1. total-pending-collection Status:', res.statusCode);
    console.log('Response data:', JSON.stringify(res.body.data, null, 2));

    // 2. Today collection
    res = await request(baseUrl, '/api/user/collection-agent/today-collection', 'POST', {}, authHeaders);
    console.log('\n2. today-collection Status:', res.statusCode);
    console.log('Response data:', JSON.stringify(res.body.data, null, 2));

    console.log('\n✓ Collection agent floats test completed successfully!');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test Failed:', err);
    server.close();
    process.exit(1);
  }
}

testCollectionFloats();
