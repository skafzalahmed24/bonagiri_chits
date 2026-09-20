'use strict';

require('dotenv').config();
const { sequelize, Banner, AssignedBannerToPeople, Member, Company } = require('../models');
const bannerService = require('../services/bannerService');
const { getValidOffersForSubscriberHelper } = require('../services/bannerService');

// Mock response object to capture controller/service responses
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

async function runTests() {
  try {
    console.log('--- Starting Valid Offers / Banners Test ---');
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // 1. Get or create a sample test company and member
    let company = await Company.findOne({ where: { is_deleted_status: 0 } });
    if (!company) {
      console.log('No company found, fetching any company or skipping...');
    }
    const companyId = company ? company.id : 1;

    let members = await Member.findAll({
      where: { is_deleted_status: 0 },
      limit: 3
    });

    if (members.length === 0) {
      console.log('Creating mock members for test...');
      const m1 = await Member.create({
        name: 'Test Subscriber 1',
        mobile_number: '9876543210',
        other_info_user_code: 'SUB001',
        company_id: companyId,
        is_deleted_status: 0,
        is_active: true,
        is_verified: true
      });
      const m2 = await Member.create({
        name: 'Test Subscriber 2',
        mobile_number: '9876543211',
        other_info_user_code: 'SUB002',
        company_id: companyId,
        is_deleted_status: 0,
        is_active: true,
        is_verified: true
      });
      members = [m1, m2];
    }

    const sub1 = members[0];
    const sub2 = members[1] || members[0];
    console.log(`Using subscribers: ID ${sub1.id} (${sub1.name}) and ID ${sub2.id} (${sub2.name})`);

    const adminUser = {
      id: companyId,
      role: 'company',
      company_id: companyId
    };

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // TEST 1: Create Regular Banner (banner_type = 1)
    console.log('\n--- Test 1: Create Regular Banner (banner_type = 1) ---');
    let res = createMockRes();
    await bannerService.storeOrUpdateBannerService(res, adminUser, {
      banner_type: 1,
      banner_image: '/uploads/test_regular_banner.jpg',
      banner_start_date: today,
      banner_end_date: futureDate,
      status: 1
    }, null);
    console.log('Create Regular Banner Response:', res.body?.status, res.body?.message, 'Banner ID:', res.body?.data?.id);
    const regularBannerId = res.body?.data?.id;

    // TEST 2: Create Targeted Banner (banner_type = 2) with multiple people checkboxes
    console.log('\n--- Test 2: Create Targeted Banner (banner_type = 2) for subscriber ' + sub1.id + ' ---');
    res = createMockRes();
    await bannerService.storeOrUpdateBannerService(res, adminUser, {
      banner_type: 2,
      banner_image: '/uploads/test_targeted_banner.jpg',
      banner_start_date: today,
      banner_end_date: futureDate,
      status: 1,
      subscriber_ids: [sub1.id] // selected via checkboxes
    }, null);
    console.log('Create Targeted Banner Response:', res.body?.status, res.body?.message, 'Banner ID:', res.body?.data?.id);
    const targetedBannerId = res.body?.data?.id;

    // TEST 3: Get All Banners (Admin)
    console.log('\n--- Test 3: Get All Banners (Admin) ---');
    res = createMockRes();
    await bannerService.getAllBannersService(res, adminUser, { min: 0, max: 10 });
    console.log('Get All Banners Count:', res.body?.data?.count);
    console.log('Banners retrieved:', res.body?.data?.rows?.map(r => ({ id: r.id, type: r.banner_type_label, assigned_count: r.assigned_subscribers_count })));

    // TEST 4: Get Banner By ID (Admin)
    console.log('\n--- Test 4: Get Targeted Banner By ID ---');
    res = createMockRes();
    await bannerService.getBannerByIdService(res, adminUser, targetedBannerId);
    console.log('Banner Details:', {
      id: res.body?.data?.id,
      banner_type: res.body?.data?.banner_type_label,
      subscriber_ids: res.body?.data?.subscriber_ids,
      assigned_subscribers: res.body?.data?.assigned_subscribers
    });

    // TEST 5: Update Banner (Add sub2 to targeted banner)
    console.log('\n--- Test 5: Update Banner with multiple subscribers [' + sub1.id + ', ' + sub2.id + '] ---');
    res = createMockRes();
    await bannerService.storeOrUpdateBannerService(res, adminUser, {
      id: targetedBannerId,
      banner_type: 2,
      banner_start_date: today,
      banner_end_date: futureDate,
      subscriber_ids: [sub1.id, sub2.id]
    }, null);
    console.log('Update Banner Response:', res.body?.status, res.body?.message);

    // TEST 6: Check User Valid Offers Helper for sub1 and sub2
    console.log('\n--- Test 6: Check Valid Offers for Subscriber 1 and Subscriber 2 ---');
    const sub1Offers = await getValidOffersForSubscriberHelper(sub1.id, companyId);
    console.log(`Subscriber 1 (${sub1.id}) sees ${sub1Offers.length} offers:`, sub1Offers.map(o => ({ id: o.id, type: o.banner_type_label })));

    const nonExistentSubOffers = await getValidOffersForSubscriberHelper(9999999, companyId);
    console.log(`Non-targeted Subscriber (9999999) sees ${nonExistentSubOffers.length} offers (only regular):`, nonExistentSubOffers.map(o => ({ id: o.id, type: o.banner_type_label })));

    // TEST 7: Change Status Toggle
    console.log('\n--- Test 7: Toggle Banner Status to Inactive ---');
    res = createMockRes();
    await bannerService.changeBannerStatusService(res, adminUser, targetedBannerId, 0);
    console.log('Toggle Status Response:', res.body?.status, res.body?.message);

    const sub1OffersAfterInactive = await getValidOffersForSubscriberHelper(sub1.id, companyId);
    console.log(`Subscriber 1 sees ${sub1OffersAfterInactive.length} offers after targeted banner deactivated.`);

    // TEST 8: Soft Delete Banner
    console.log('\n--- Test 8: Soft Delete Banners ---');
    res = createMockRes();
    await bannerService.deleteBannerService(res, adminUser, regularBannerId);
    console.log('Delete Regular Banner:', res.body?.status, res.body?.message);
    res = createMockRes();
    await bannerService.deleteBannerService(res, adminUser, targetedBannerId);
    console.log('Delete Targeted Banner:', res.body?.status, res.body?.message);

    console.log('\n--- All Valid Offers / Banners Tests Passed Successfully! ---');
  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    await sequelize.close();
  }
}

runTests();
