'use strict';

const { NotificationHistory, ChitsGroup, sequelize } = require('../models');
const { Op } = require('sequelize');

async function fixNotifications() {
  try {
    const notifs = await NotificationHistory.findAll({
      where: {
        body: {
          [Op.like]: '%undefined%'
        }
      }
    });

    console.log(`Found ${notifs.length} notifications with 'undefined' in body.`);

    let fixedCount = 0;
    for (const notif of notifs) {
      let updatedBody = notif.body;
      const groupId = notif.data_payload ? (notif.data_payload.group_id || notif.data_payload.groupId) : null;

      let groupName = 'Chit Group';
      if (groupId) {
        const group = await ChitsGroup.findByPk(groupId);
        if (group && group.group_name) {
          groupName = group.group_name;
        }
      }

      updatedBody = updatedBody.replace(/Chit Group: undefined/g, `Chit Group: ${groupName}`);
      updatedBody = updatedBody.replace(/Chit undefined/g, `Chit ${groupName}`);
      updatedBody = updatedBody.replace(/undefined/g, groupName);

      if (updatedBody !== notif.body) {
        await notif.update({ body: updatedBody });
        fixedCount++;
        console.log(`Updated notification ID ${notif.id} body to: "${updatedBody}"`);
      }
    }

    console.log(`Successfully repaired ${fixedCount} notification history records.`);
  } catch (error) {
    console.error('Error fixing notification histories:', error);
  } finally {
    process.exit(0);
  }
}

fixNotifications();
