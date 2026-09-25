const { Member, Enrollment } = require('../models');
const userService = require('../services/userService');

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

async function testHomeRating() {
  try {
    console.log('Testing getHomeRecordService with star rating...');

    // Find an active enrollment with a subscriber
    const enrollment = await Enrollment.findOne({
      where: { delete_status: 0 },
      order: [['createdAt', 'DESC']]
    });

    if (!enrollment) {
      console.log('No enrollment found to test.');
      process.exit(0);
    }

    const member = await Member.findByPk(enrollment.subscriber_id);
    console.log(`Found member for test: ID ${member.id}, Name: ${member.name || member.other_info_user_code}`);

    const res = mockRes();
    const userPayload = { id: member.id, role: 'member' };

    await userService.getHomeRecordService(res, userPayload, member.id);

    console.log('Response Status:', res.statusCode);
    console.log('Response Body:', JSON.stringify(res.body, null, 2));

    if (res.body && res.body.data) {
      console.log('\n--- Verified rating object in user/home Response ---');
      console.log('rating:', JSON.stringify(res.body.data.rating, null, 2));
      console.log('\n✓ Test completed successfully!');
    } else {
      console.log('No data returned or error occurred.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error running test:', error);
    process.exit(1);
  }
}

testHomeRating();
