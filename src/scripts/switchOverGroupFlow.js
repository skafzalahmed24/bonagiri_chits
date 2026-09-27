require('dotenv').config();
const { ChitsGroup, Enrollment, ChitsInstallment, Company, sequelize } = require('../models');
const { createInstallmentsForGroup } = require('../services/adminService');
const SystemSettingsService = require('../services/systemSettingsService');
const { Op } = require('sequelize');

const run = async () => {
  try {
    const isApply = process.argv.includes('--apply');
    console.log(isApply ? 'Running in APPLY mode' : 'Running in DRY-RUN mode');

    const businessDate = await SystemSettingsService.getBusinessDate();
    const byyyy = businessDate.getFullYear();
    const bmm = String(businessDate.getMonth() + 1).padStart(2, '0');
    const bdd = String(businessDate.getDate()).padStart(2, '0');
    const businessDateStr = `${byyyy}-${bmm}-${bdd}`;

    const groups = await ChitsGroup.findAll({
      where: { is_deleted_status: 0 },
      include: [{ model: Company, as: 'company', attributes: ['company_name'] }]
    });

    let groupsChanged = 0;
    let installmentsCreated = 0;
    let groupsSwitchedToRunning = 0;

    for (const group of groups) {
      const enrollments = await Enrollment.findAll({
        where: { group_id: group.id, delete_status: 0 }
      });

      let missingInstallmentsCount = 0;
      for (const e of enrollments) {
        const instCount = await ChitsInstallment.count({ where: { enrollment_id: e.id } });
        if (instCount === 0) missingInstallmentsCount++;
      }

      const startStr = group.commencement_date || group.chit_start_date;
      const startDateStr = startStr ? new Date(startStr).toISOString().split('T')[0] : null;
      
      console.log(`Company: ${group.company?.company_name}, Group: ${group.group_name}, Start: ${startDateStr}, Status: ${group.chits_group_status}, Enrollments: ${enrollments.length}, Missing Instalments: ${missingInstallmentsCount}`);

      if (isApply) {
        await sequelize.transaction(async (t) => {
          let changed = false;
          
          if (missingInstallmentsCount > 0) {
            const preCount = await ChitsInstallment.count({ where: { group_id: group.id }, transaction: t });
            await createInstallmentsForGroup(group.id, { transaction: t });
            const postCount = await ChitsInstallment.count({ where: { group_id: group.id }, transaction: t });
            
            const newInstsCount = postCount - preCount;
            installmentsCreated += newInstsCount;
            
            if (newInstsCount > 0) {
              await ChitsInstallment.update(
                { penalty_from_date: businessDateStr },
                { where: { group_id: group.id, due_date: { [Op.lte]: businessDateStr }, penalty_from_date: null }, transaction: t }
              );
            }
            changed = true;
          }

          if (group.chits_group_status === 0 && startDateStr && startDateStr <= businessDateStr) {
            await group.update({ chits_group_status: 1 }, { transaction: t });
            groupsSwitchedToRunning++;
            changed = true;
          }

          if (changed) groupsChanged++;
        });
      }
    }

    console.log(`Summary: Groups changed: ${groupsChanged}, Instalments created: ${installmentsCreated}, Groups switched to Running: ${groupsSwitchedToRunning}`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

run();
