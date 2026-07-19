const admin = require('firebase-admin');
const { Member, StaffUser, NotificationHistory } = require('../models');

// Initialize Firebase Admin lazily if env vars are present
let isFirebaseInitialized = false;
try {
  if (process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FCM_PROJECT_ID,
        clientEmail: process.env.FCM_CLIENT_EMAIL,
        privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    isFirebaseInitialized = true;
    console.log('Firebase Admin initialized successfully.');
  } else {
    console.warn('Firebase Admin is not initialized. Missing FCM environment variables.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
}

/**
 * Handle stale token cleanup
 */
const handleTokenError = async (error, userType, userId) => {
  if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token') {
    try {
      if (userType === 'MEMBER') {
        await Member.update({ fcm_token: null }, { where: { id: userId } });
      } else if (userType === 'STAFF') {
        await StaffUser.update({ fcm_token: null }, { where: { id: userId } });
      }
      console.log(`Cleared invalid FCM token for ${userType} ${userId}`);
    } catch (cleanupError) {
      console.error(`Failed to clear stale token for ${userType} ${userId}:`, cleanupError);
    }
  } else {
    console.error('FCM Send Error:', error);
  }
};

/**
 * Fire-and-forget push for a single member
 */
const sendPushToMember = async (member, title, body, dataPayload = {}) => {
  if (!member) return;

  // 1. Save history
  if (member.company_id) {
    try {
      await NotificationHistory.create({
        user_id: String(member.id),
        user_type: 'MEMBER',
        company_id: member.company_id,
        title,
        body,
        data_payload: dataPayload
      });
    } catch (err) {
      console.error('Failed to save NotificationHistory:', err);
    }
  }

  // 2. Send push (non-blocking)
  if (isFirebaseInitialized && member.fcm_token) {
    const message = {
      notification: { title, body },
      data: dataPayload,
      token: member.fcm_token
    };

    admin.messaging().send(message)
      .then(response => console.log('Successfully sent message:', response))
      .catch(error => handleTokenError(error, 'MEMBER', member.id));
  }
};

/**
 * Fire-and-forget push for a single staff user
 */
const sendPushToStaff = async (staff, title, body, dataPayload = {}) => {
  if (!staff) return;

  // 1. Save history
  if (staff.company_id) {
    try {
      await NotificationHistory.create({
        user_id: String(staff.id),
        user_type: 'STAFF',
        company_id: staff.company_id,
        title,
        body,
        data_payload: dataPayload
      });
    } catch (err) {
      console.error('Failed to save NotificationHistory:', err);
    }
  }

  // 2. Send push (non-blocking)
  if (isFirebaseInitialized && staff.fcm_token) {
    const message = {
      notification: { title, body },
      data: dataPayload,
      token: staff.fcm_token
    };

    admin.messaging().send(message)
      .then(response => console.log('Successfully sent message:', response))
      .catch(error => handleTokenError(error, 'STAFF', staff.id));
  }
};

/**
 * Fire-and-forget push using multicast for a group of members
 */
const sendPushToMulticast = async (members, companyId, title, body, dataPayload = {}) => {
  if (!members || members.length === 0) return;

  // 1. Save history for all members
  try {
    const histories = members.map(m => ({
      user_id: String(m.id),
      user_type: 'MEMBER',
      company_id: companyId || m.company_id,
      title,
      body,
      data_payload: dataPayload
    }));
    await NotificationHistory.bulkCreate(histories);
  } catch (err) {
    console.error('Failed to save NotificationHistories bulk:', err);
  }

  // 2. Send push (non-blocking) using sendEachForMulticast
  if (isFirebaseInitialized) {
    const validMembers = members.filter(m => m.fcm_token);
    if (validMembers.length === 0) return;

    // chunk to max 500
    const chunkSize = 500;
    for (let i = 0; i < validMembers.length; i += chunkSize) {
      const chunk = validMembers.slice(i, i + chunkSize);
      const tokens = chunk.map(m => m.fcm_token);

      const message = {
        notification: { title, body },
        data: dataPayload,
        tokens: tokens
      };

      admin.messaging().sendEachForMulticast(message)
        .then(response => {
          console.log(`Multicast sent. Success: ${response.successCount}, Failure: ${response.failureCount}`);
          if (response.failureCount > 0) {
            response.responses.forEach((res, idx) => {
              if (!res.success) {
                handleTokenError(res.error, 'MEMBER', chunk[idx].id);
              }
            });
          }
        })
        .catch(error => console.error('Error sending multicast:', error));
    }
  }
};

module.exports = {
  sendPushToMember,
  sendPushToStaff,
  sendPushToMulticast
};
