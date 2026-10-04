const { ChitsGroup } = require('../models');

async function listGroups() {
  const groups = await ChitsGroup.findAll();
  console.log(groups.map(g => ({
    id: g.id,
    group_name: g.group_name,
    scheme_configuration_id: g.scheme_configuration_id,
    auction_type: g.auction_type
  })));
  process.exit(0);
}

listGroups();
