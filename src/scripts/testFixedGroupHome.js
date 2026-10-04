const { Enrollment, Member, ChitsGroup } = require('../models');
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

async function testFixedGroupHome() {
  const groups = await ChitsGroup.findAll({
    where: { is_deleted_status: 0 }
  });
  console.log(`Found ${groups.length} groups.`);
  for (const g of groups) {
    console.log(`Group ${g.group_name}: id=${g.id}, scheme_configuration_id=${g.scheme_configuration_id}, auction_type=${g.auction_type}`);
    const enr = await Enrollment.findOne({
      where: { group_id: g.id, delete_status: 0 }
    });
    if (enr) {
      const res = mockRes();
      const userPayload = { id: enr.subscriber_id, role: 'member' };
      await userService.getHomeRecordService(res, userPayload, enr.subscriber_id);
      console.log(` -> Home Record for sub ${enr.subscriber_id}: auction_type=${res.body?.data?.auction_type}, label=${res.body?.data?.auction_type_label}`);
    }
  }
  process.exit(0);
}

testFixedGroupHome();
