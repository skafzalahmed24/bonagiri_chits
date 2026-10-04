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

async function checkGroup() {
  const grp = await ChitsGroup.findByPk("6e379aa5-882d-46d3-bb14-eac415077fde");
  console.log('Group info:', {
    id: grp?.id,
    group_name: grp?.group_name,
    scheme_configuration_id: grp?.scheme_configuration_id,
    auction_type: grp?.auction_type
  });

  const enr = await Enrollment.findOne({
    where: { group_id: "6e379aa5-882d-46d3-bb14-eac415077fde", delete_status: 0 }
  });
  if (enr) {
    console.log('Found enrollment:', enr.id, 'subscriber_id:', enr.subscriber_id);
    const res = mockRes();
    const userPayload = { id: enr.subscriber_id, role: 'member' };
    await userService.getHomeRecordService(res, userPayload, enr.subscriber_id);
    console.log('getHomeRecordService response for subscriber:', enr.subscriber_id);
    console.log('auction_type:', res.body?.data?.auction_type);
    console.log('auction_type_label:', res.body?.data?.auction_type_label);
  }
  process.exit(0);
}

checkGroup();
