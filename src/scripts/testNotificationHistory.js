'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Member, ChitsGroup, NotificationHistory } = require('../models');

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

async function testNotificationHistory() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing /api/user/notifications/history ---');

    let member = await Member.findOne({ where: { is_deleted_status: 0 } });
    if (!member) {
      console.log('No member found for test.');
      server.close();
      process.exit(0);
    }

    let group = await ChitsGroup.findOne();
    const groupName = group ? group.group_name : 'Test Group';

    // Insert a test notification with 'undefined' in body to test dynamic sanitization
    const testNotif = await NotificationHistory.create({
      user_id: String(member.id),
      user_type: 'MEMBER',
      company_id: member.company_id,
      title: 'Enrolled Successfully',
      body: 'You have been successfully enrolled in Chit Group: undefined',
      data_payload: {
        type: 'ENROLLMENT',
        group_id: group ? String(group.id) : 'test-id'
      },
      is_read: false
    });

    const token = jwt.sign({
      id: member.id,
      user_id: member.other_info_user_code || member.id,
      role: 'member',
      company_id: member.company_id
    }, JWT_SECRET, { expiresIn: '1h' });

    const res = await request(baseUrl, '/api/user/notifications/history', 'POST', {
      min: 0,
      max: 10,
      filter: 'all'
    }, { Authorization: `Bearer ${token}` });

    console.log('Response Status:', res.statusCode);
    console.log('Response Body:', JSON.stringify(res.body, null, 2));

    const found = res.body.data.rows.find(r => r.id === testNotif.id);
    if (!found) {
      throw new Error('Created notification not found in response');
    }

    console.log('Sanitized notification body:', found.body);
    if (found.body.includes('undefined')) {
      throw new Error(`Body still contains undefined: "${found.body}"`);
    }

    // Clean up test notification
    await testNotif.destroy();

    console.log('\n✓ /api/user/notifications/history PASSED successfully!');
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    server.close();
    process.exit(0);
  }
}

testNotificationHistory();
