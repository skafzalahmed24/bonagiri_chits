'use strict';
require('dotenv').config();
const http = require('http');
const app = require('../app');
const { Member, PlatformTermsPrivacy, PlatformSupportContact, PlatformSupportFaq, sequelize } = require('../models');
const bcrypt = require('bcryptjs');
const { generateTokens } = require('../utils/jwtHelper');

const DEFAULT_API_TOKEN = process.env.DEFAULT_API_TOKEN;

async function request(server, path, method = 'POST', body = {}, headers = {}) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      ...headers
    };

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, rawBody: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING SUPER ADMIN & PUBLIC URLS TESTS ---');
  const server = app.listen(0);
  
  try {
    // 1. Generate Super Admin Token
    const superAdminPayload = {
      email: process.env.SUPERADMIN_EMAIL || 'admin@bonagiri.com',
      role: 'superadmin',
      company_id: null
    };
    const superAdminTokens = generateTokens(superAdminPayload);
    const superAdminHeader = {
      'Authorization': `Bearer ${superAdminTokens.accessToken}`
    };
    const defaultTokenHeader = {
      'Authorization': `Bearer ${DEFAULT_API_TOKEN}`
    };

    console.log('✓ Created Super Admin and Default Auth Tokens');

    // TEST 1.1: Super Admin Terms & Privacy GET (Initial empty/current)
    let res = await request(server, '/api/super-admin/terms-privacy/get', 'POST', { type: 1 }, superAdminHeader);
    console.log('1.1 GET Terms:', res.statusCode, res.body);
    if (res.body.status !== 1) throw new Error('Failed GET Terms');

    // TEST 1.2: Super Admin Terms & Privacy STORE/UPDATE (Terms & Privacy)
    res = await request(server, '/api/super-admin/terms-privacy/store-or-update', 'POST', {
      type: 1,
      content: '<h1>Terms and Conditions</h1><p>Platform terms.</p>'
    }, superAdminHeader);
    console.log('1.2 STORE Terms:', res.statusCode, res.body);
    if (res.body.status !== 1 || !res.body.data.content.includes('Platform terms.')) throw new Error('Failed STORE Terms');

    res = await request(server, '/api/super-admin/terms-privacy/store-or-update', 'POST', {
      type: 2,
      content: '<h1>Privacy Policy</h1><p>Platform privacy policy.</p>'
    }, superAdminHeader);
    console.log('1.2 STORE Privacy:', res.statusCode, res.body);
    if (res.body.status !== 1 || !res.body.data.content.includes('Platform privacy')) throw new Error('Failed STORE Privacy');

    // Verify GET again
    res = await request(server, '/api/super-admin/terms-privacy/get', 'POST', { type: 1 }, superAdminHeader);
    if (res.body.status !== 1 || !res.body.data.content.includes('Platform terms.')) throw new Error('Failed to retrieve updated terms');
    console.log('✓ 1.1 & 1.2 Terms & Privacy endpoints verified');

    // TEST 2.1 & 2.2: Super Admin Support Contact
    res = await request(server, '/api/super-admin/support/contact/store-or-update', 'POST', {
      address: 'Bonagiri Chits HQ, Vijayawada, AP',
      phone_numbers: ['+91 9876543210', '+91 8765432109'],
      emails: ['support@bonagiri.com'],
      website_link: 'https://bonagiri.com',
      social_media_links: {
        facebook: 'https://facebook.com/bonagiri',
        twitter: null,
        instagram: null,
        linkedin: null
      }
    }, superAdminHeader);
    console.log('2.2 STORE Support Contact:', res.statusCode, res.body);
    if (res.body.status !== 1 || res.body.data.phone_numbers.length !== 2) throw new Error('Failed STORE Contact');

    res = await request(server, '/api/super-admin/support/contact/get', 'POST', {}, superAdminHeader);
    console.log('2.1 GET Support Contact:', res.statusCode, res.body);
    if (res.body.status !== 1 || res.body.data.address !== 'Bonagiri Chits HQ, Vijayawada, AP') throw new Error('Failed GET Contact');
    console.log('✓ 2.1 & 2.2 Support Contact endpoints verified');

    // TEST 2.3, 2.4, 2.5: Super Admin FAQ
    res = await request(server, '/api/super-admin/support/faq/store-or-update', 'POST', {
      question: 'How does the bidding work?',
      answer: 'The highest bidder wins the auction.'
    }, superAdminHeader);
    console.log('2.4 CREATE FAQ 1:', res.statusCode, res.body);
    const faq1Id = res.body.data.id;

    res = await request(server, '/api/super-admin/support/faq/store-or-update', 'POST', {
      question: 'When is the dividend paid?',
      answer: 'Dividends are distributed after the auction round.'
    }, superAdminHeader);
    console.log('2.4 CREATE FAQ 2:', res.statusCode, res.body);
    const faq2Id = res.body.data.id;

    res = await request(server, '/api/super-admin/support/faq/get-all', 'POST', {}, superAdminHeader);
    console.log('2.3 GET ALL FAQs:', res.statusCode, res.body);
    if (res.body.status !== 1 || res.body.data.count < 2) throw new Error('Failed GET ALL FAQs');

    // Update FAQ 1
    res = await request(server, '/api/super-admin/support/faq/store-or-update', 'POST', {
      id: faq1Id,
      question: 'How does bidding work? (Updated)',
      answer: 'Updated answer for bidding.'
    }, superAdminHeader);
    if (res.body.status !== 1 || !res.body.data.question.includes('(Updated)')) throw new Error('Failed UPDATE FAQ');

    // Delete FAQ 2
    res = await request(server, '/api/super-admin/support/faq/delete', 'POST', { id: faq2Id }, superAdminHeader);
    console.log('2.5 DELETE FAQ 2:', res.statusCode, res.body);
    if (res.body.status !== 1) throw new Error('Failed DELETE FAQ');
    console.log('✓ 2.3, 2.4 & 2.5 FAQ endpoints verified');

    // TEST 3.1: Public Support Endpoint
    res = await request(server, '/api/public/support', 'POST', {}, defaultTokenHeader);
    console.log('3.1 GET PUBLIC SUPPORT:', res.statusCode, res.body);
    if (res.body.status !== 1 || !res.body.data.contact || !Array.isArray(res.body.data.faqs)) {
      throw new Error('Failed Public Support');
    }
    console.log('✓ 3.1 Public Support endpoint verified');

    // TEST 4.1 & 4.2 & Login Guard: Delete Account Flow
    const testMobile = '9999888877';
    const testPassword = 'TestPassword123!';
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const testUserCode = 999988;

    // Create or update a test member
    let member = await Member.findOne({ where: { other_info_user_code: testUserCode } });
    if (!member) {
      member = await Member.create({
        name: 'Test Delete Member',
        mobile_number: testMobile,
        other_info_user_code: testUserCode,
        other_info_user_password: hashedPassword,
        is_verified: true,
        is_active: true,
        is_deleted_status: 0
      });
    } else {
      await member.update({
        mobile_number: testMobile,
        other_info_user_password: hashedPassword,
        is_verified: true,
        is_active: true,
        is_deleted_status: 0,
        delete_account_otp: null,
        delete_account_otp_expires_at: null
      });
    }

    // 4.1a Send OTP with wrong password
    res = await request(server, '/api/member/delete-account/send-otp', 'POST', {
      mobile: testMobile,
      password: 'WrongPassword!'
    }, defaultTokenHeader);
    console.log('4.1a SEND OTP (Wrong Password):', res.statusCode, res.body);
    if (res.statusCode !== 200 || res.body.status !== 0 || !res.body.message.includes('Incorrect mobile number')) {
      throw new Error('Failed Send OTP Wrong Password check');
    }

    // 4.1b Send OTP with correct password
    res = await request(server, '/api/member/delete-account/send-otp', 'POST', {
      mobile: testMobile,
      password: testPassword
    }, defaultTokenHeader);
    console.log('4.1b SEND OTP (Success):', res.statusCode, res.body);
    if (res.statusCode !== 200 || res.body.status !== 1 || !res.body.message.includes('OTP sent')) {
      throw new Error('Failed Send OTP Success check');
    }

    // Reload member to inspect stored OTP
    await member.reload();
    console.log('Member delete_account_otp stored:', member.delete_account_otp, 'expires_at:', member.delete_account_otp_expires_at);
    if (!member.delete_account_otp || !member.delete_account_otp_expires_at) {
      throw new Error('OTP was not persisted to member record');
    }

    // 4.2a Verify with wrong OTP
    res = await request(server, '/api/member/delete-account/verify', 'POST', {
      mobile: testMobile,
      otp: '000000'
    }, defaultTokenHeader);
    console.log('4.2a VERIFY OTP (Wrong OTP):', res.statusCode, res.body);
    if (res.statusCode !== 200 || res.body.status !== 0 || !res.body.message.includes('Invalid OTP')) {
      throw new Error('Failed Verify Wrong OTP check');
    }

    // 4.2b Verify with correct OTP
    const validOtp = member.delete_account_otp;
    res = await request(server, '/api/member/delete-account/verify', 'POST', {
      mobile: testMobile,
      otp: validOtp
    }, defaultTokenHeader);
    console.log('4.2b VERIFY OTP (Success):', res.statusCode, res.body);
    if (res.statusCode !== 200 || res.body.status !== 1 || !res.body.message.includes('deactivated')) {
      throw new Error('Failed Verify Correct OTP check');
    }

    // Verify member is deactivated
    await member.reload();
    console.log('Member is_active after deactivation:', member.is_active);
    if (member.is_active !== false) {
      throw new Error('Member was not marked as is_active = false');
    }

    // 4.3 Test login guard: Deactivated member trying to login
    res = await request(server, '/api/user/login', 'POST', {
      user_code: String(testUserCode),
      company_password: testPassword,
      type: 2
    }, defaultTokenHeader);
    console.log('4.3 LOGIN DEACTIVATED MEMBER:', res.statusCode, res.body);
    if (res.body.status !== 0 || !res.body.message.includes('deactivated')) {
      throw new Error('Login guard failed for deactivated member');
    }

    // 4.4 Test sending OTP again on deactivated account
    res = await request(server, '/api/member/delete-account/send-otp', 'POST', {
      mobile: testMobile,
      password: testPassword
    }, defaultTokenHeader);
    console.log('4.4 SEND OTP ON DEACTIVATED ACCOUNT:', res.statusCode, res.body);
    if (res.body.status !== 0 || !res.body.message.includes('already deactivated')) {
      throw new Error('Send OTP on deactivated account failed');
    }

    console.log('✓ 4.1, 4.2 & Login Guard fully verified!');
    console.log('\n========================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('========================================');

  } finally {
    server.close();
    await sequelize.close();
  }
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
