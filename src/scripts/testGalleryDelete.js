'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { Gallery, Company } = require('../models');

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

async function testGalleryFlow() {
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    console.log('--- Testing Gallery Delete with Token & Image File Cleanup ---');

    // 1. Setup company token
    let company = await Company.findOne({ where: { is_deleted_status: 0 } });
    const companyId = company ? company.id : '11111111-1111-1111-1111-111111111111';

    const companyToken = jwt.sign({
      id: companyId,
      user_id: company ? company.company_id : 'COMP001',
      role: 'company'
    }, JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = {
      Authorization: `Bearer ${companyToken}`
    };

    // 2. Create a test image file on disk in uploads/
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const testFileName = `test-gallery-${Date.now()}.png`;
    const testFilePath = path.join(uploadsDir, testFileName);
    fs.writeFileSync(testFilePath, 'DUMMY_IMAGE_DATA_CONTENT');

    console.log(`1. Created test file on disk: ${testFilePath}`);
    if (!fs.existsSync(testFilePath)) throw new Error('Failed to create test image file');

    // 3. Store gallery record via API
    let res = await request(baseUrl, '/api/gallery/store-or-update', 'POST', {
      gallery_image: testFileName,
      status: 0
    }, authHeaders);

    console.log('2. Store Gallery response:', res.statusCode, res.body);
    if (res.statusCode !== 201 || res.body.status !== 1) {
      throw new Error(`Failed to store gallery: ${JSON.stringify(res.body)}`);
    }

    const galleryId = res.body.data.id;
    console.log(`✓ Stored Gallery ID: ${galleryId}`);

    // 4. Test get-by-id
    res = await request(baseUrl, '/api/gallery/get-by-id', 'POST', {
      id: galleryId
    }, authHeaders);
    console.log('3. Get Gallery By ID response:', res.statusCode, res.body);
    if (res.statusCode !== 200 || res.body.status !== 1) {
      throw new Error('Failed to get gallery by id');
    }

    // 5. Test delete gallery with token
    res = await request(baseUrl, '/api/gallery/delete', 'POST', {
      id: galleryId
    }, authHeaders);
    console.log('4. Delete Gallery response:', res.statusCode, res.body);
    if (res.statusCode !== 200 || res.body.status !== 1) {
      throw new Error('Failed to delete gallery');
    }

    // 6. Verify record is deleted in DB
    const dbRecord = await Gallery.findByPk(galleryId);
    if (dbRecord) throw new Error('Gallery record still exists in DB');
    console.log('✓ Verified Gallery record removed from Database');

    // 7. Verify file was deleted from uploads directory
    const fileExistsAfter = fs.existsSync(testFilePath);
    if (fileExistsAfter) {
      throw new Error('Test image file was NOT deleted from uploads directory');
    }
    console.log('✓ Verified physical image file was deleted from uploads folder');

    // 8. Test delete on non-existent record returns 404
    res = await request(baseUrl, '/api/gallery/delete', 'POST', {
      id: galleryId
    }, authHeaders);
    console.log('5. Delete non-existent ID response:', res.statusCode, res.body);
    if (res.statusCode !== 404) {
      throw new Error('Expected 404 for deleting non-existent gallery');
    }

    console.log('\n========================================');
    console.log('🎉 GALLERY DELETE TESTS PASSED 100%! 🎉');
    console.log('========================================');
    server.close();
    process.exit(0);
  } catch (error) {
    console.error('Test Failed:', error);
    server.close();
    process.exit(1);
  }
}

testGalleryFlow();
