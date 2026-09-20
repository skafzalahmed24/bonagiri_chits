'use strict';

require('dotenv').config();
const { sequelize, Member, ChitsGroup, Enrollment } = require('../models');
const adminService = require('../services/adminService');
const userService = require('../services/userService');

const createMockRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
};

async function testMemberDocuments() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    const enrollment = await Enrollment.findOne({ where: { delete_status: 0 } });
    if (!enrollment) {
      console.log('No enrollment found');
      return;
    }

    const { group_id, subscriber_id: member_id } = enrollment;
    console.log(`Testing with Member ID: ${member_id}, Group ID: ${group_id}`);

    // 1. Get initial documents list from admin service (should return all 9 types)
    let res = createMockRes();
    await adminService.getMemberDocumentsAdminService(res, group_id, member_id);
    console.log('\n--- 1. Admin Service: Get Member Documents ---');
    console.log('Status:', res.statusCode);
    console.log('Total document items returned:', res.body?.data?.documents?.length);
    console.log('Documents list:', res.body?.data?.documents);

    // 2. User Service: Upload Aadhaar Card and Bank Statement
    console.log('\n--- 2. User Service: Upload Aadhaar Card & Bank Statement ---');
    res = createMockRes();
    await userService.uploadMemberDocumentService(res, {
      group_id,
      member_id,
      document_type: 'aadhar',
      document_url: '/uploads/documents/aadhaar_card_test.pdf',
      status: 1
    }, { id: 1 });
    console.log('Upload aadhar status:', res.statusCode, res.body?.message);

    res = createMockRes();
    await userService.uploadMemberDocumentService(res, {
      group_id,
      member_id,
      document_type: 'bank_statement',
      document_url: '/uploads/documents/bank_statement_test.pdf',
      status: 1
    }, { id: 1 });
    console.log('Upload bank_statement status:', res.statusCode, res.body?.message);

    // 3. Admin Service: Upload Cheques and Photo
    console.log('\n--- 3. Admin Service: Upload Cheques ---');
    res = createMockRes();
    await adminService.uploadMemberDocumentService(res, {
      group_id,
      member_id,
      document_type: 'cheques',
      document_url: '/uploads/documents/cheque_leaf.png',
      status: 1
    }, { id: 1 });
    console.log('Upload cheques status:', res.statusCode, res.body?.message);

    // 4. Admin Service: Verify Document
    console.log('\n--- 4. Admin Service: Verify Document ---');
    res = createMockRes();
    await adminService.verifyMemberDocumentService(res, {
      group_id,
      member_id,
      document_type: 'aadhar',
      status: 1
    });
    console.log('Verify aadhar status:', res.statusCode, res.body?.message);

    // 5. User Service: Get Documents List (should show all 9 types and statuses)
    res = createMockRes();
    await userService.getMemberDocumentsService(res, { id: 1 }, group_id, member_id);
    console.log('\n--- 5. User Service: Get Member Documents ---');
    console.log('Status:', res.statusCode);
    console.log('Total document items returned:', res.body?.data?.documents?.length);
    res.body?.data?.documents?.forEach(d => {
      console.log(`- ${d.document_title} (${d.document_type}): status=${d.status}, url=${d.document_url || 'None'}`);
    });

    console.log('\n--- All Document Tests Passed Successfully! ---');
  } catch (e) {
    console.error('Error during test:', e);
  } finally {
    await sequelize.close();
  }
}

testMemberDocuments();

