const userService = require('../services/userService');

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function(data) {
    this.body = data;
    return this;
  };
  return res;
};

async function testMember88() {
  const res = mockRes();
  const userPayload = { id: 88, role: 'member' };
  await userService.getHomeRecordService(res, userPayload, 88);
  console.log('Member 88 Home Response Status:', res.statusCode);
  console.log('Member 88 Home Response Body:', JSON.stringify(res.body, null, 2));
  process.exit(0);
}

testMember88();
