const { SystemSettings, ChitsGroup, Enrollment, Member } = require('../models');

async function listAll() {
  const settings = await SystemSettings.findOne();
  console.log('SystemSettings:', settings ? settings.toJSON() : 'None');

  const groups = await ChitsGroup.findAll({
    attributes: ['id', 'group_name', 'penality_for_nps', 'penality_for_ps', 'chits_group_status', 'is_deleted_status']
  });
  console.log('\nAll Groups in DB:', groups.map(g => g.toJSON()));
}

listAll().catch(console.error).finally(() => process.exit(0));
