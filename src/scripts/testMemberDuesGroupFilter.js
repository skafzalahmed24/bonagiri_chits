require('dotenv').config();
const { sequelize, Member, Enrollment, ChitsGroup, ChitsInstallment, CustomerPayment } = require('../models');
const { getMemberDuesService } = require('../services/userService');

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

async function test() {
  await sequelize.authenticate();
  console.log('DB connected');

  // Find a member with enrollments
  const enrollment = await Enrollment.findOne({
    where: { delete_status: 0 },
    include: [{ model: ChitsGroup, as: 'group' }]
  });

  if (!enrollment) {
    console.log('No enrollment found for testing');
    process.exit(0);
  }

  const memberId = enrollment.subscriber_id;
  const groupId = enrollment.group_id;

  console.log(`Testing with Member ID: ${memberId}, Group ID: ${groupId}`);

  // Test 1: Without group_id (all groups)
  const resAll = createMockRes();
  await getMemberDuesService(resAll, memberId, null);
  console.log('\n--- 1. Member Dues (All Groups): ---');
  console.log(resAll.body);

  // Test 2: With group_id (single group)
  const resGroup = createMockRes();
  await getMemberDuesService(resGroup, memberId, null, groupId);
  console.log('\n--- 2. Member Dues (Specific Group): ---');
  console.log(resGroup.body);

  // Test 3: With non-matching group_id
  const resNonMatching = createMockRes();
  await getMemberDuesService(resNonMatching, memberId, null, '00000000-0000-0000-0000-000000000000');
  console.log('\n--- 3. Member Dues (Non-matching Group): ---');
  console.log(resNonMatching.body);

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
