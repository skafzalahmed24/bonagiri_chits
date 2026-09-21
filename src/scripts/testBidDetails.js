'use strict';

require('dotenv').config();
const { sequelize, Member, ChitsGroup, Enrollment, Auction } = require('../models');
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

async function testBidDetails() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    const group = await ChitsGroup.findOne({ where: { is_deleted_status: 0 } });
    if (!group) {
      console.log('No group found');
      return;
    }

    const enrollment = await Enrollment.findOne({ where: { group_id: group.id, delete_status: 0 } });
    const subscriberId = enrollment ? enrollment.subscriber_id : 1;

    console.log(`Testing Bid Details for Group ID: ${group.id}, Subscriber ID: ${subscriberId}`);

    const res = createMockRes();
    await userService.getBidDetailsService(res, group.id, { id: subscriberId });

    console.log('Status Code:', res.statusCode);
    console.log('Response Message:', res.body?.message);
    console.log('\n--- Response Data Sample ---');
    console.log(JSON.stringify(res.body?.data, null, 2));

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await sequelize.close();
  }
}

testBidDetails();
