const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { Member, StaffUser, NotificationHistory } = require('../models');

// Initialize Firebase Admin
let isFirebaseInitialized = false;

try {
  const serviceAccountPath = path.join(__dirname, '../notificationsfiles/serviceAccountKey.json');

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    isFirebaseInitialized = true;
    console.log('Firebase Admin initialized successfully using serviceAccountKey.json.');
  } else if (process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FCM_PROJECT_ID,
        clientEmail: process.env.FCM_CLIENT_EMAIL,
        privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    isFirebaseInitialized = true;
    console.log('Firebase Admin initialized successfully using environment variables.');
  } else {
    console.warn('Firebase Admin is not initialized. Missing FCM service account credentials.');
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
 * Convert any object payload into strict string-string key-values for FCM data payload
 */
const sanitizeDataPayload = (dataPayload = {}) => {
  const sanitized = {};
  if (dataPayload && typeof dataPayload === 'object') {
    for (const [key, value] of Object.entries(dataPayload)) {
      if (value !== null && value !== undefined) {
        sanitized[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
  }
  return sanitized;
};

/**
 * Build Multi-Platform Message Object (Supports Android, iOS APNs, and Web)
 */
const buildMultiPlatformMessage = ({ token, tokens, title, body, dataPayload = {}, badgeCount = 1 }) => {
  const stringData = sanitizeDataPayload(dataPayload);
  const notification = { title: String(title), body: String(body) };

  const base = {
    notification,
    data: stringData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'bonagiri_chits_channel',
        sound: 'default',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        defaultSound: true,
        defaultVibrateTimings: true
      }
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert'
      },
      payload: {
        aps: {
          sound: 'default',
          badge: typeof badgeCount === 'number' ? badgeCount : 1,
          contentAvailable: true
        }
      }
    }
  };

  if (tokens && Array.isArray(tokens)) {
    return { ...base, tokens };
  }

  return { ...base, token };
};

/**
 * Get unread notification count for a user
 */
const getUnreadCountForUser = async (userId, userType = 'MEMBER') => {
  try {
    const unread = await NotificationHistory.count({
      where: { user_id: String(userId), user_type: userType, is_read: false }
    });
    return unread;
  } catch (err) {
    return 1;
  }
};

/**
 * Fire-and-forget push for a single member with multi-platform payload
 */
const sendPushToMember = async (member, title, body, dataPayload = {}) => {
  if (!member) return;

  // 1. Save history
  let historyRecord = null;
  if (member.company_id) {
    try {
      historyRecord = await NotificationHistory.create({
        user_id: String(member.id),
        user_type: 'MEMBER',
        company_id: member.company_id,
        title,
        body,
        data_payload: dataPayload,
        is_read: false
      });
    } catch (err) {
      console.error('Failed to save NotificationHistory:', err);
    }
  }

  // 2. Send push (non-blocking)
  if (isFirebaseInitialized && member.fcm_token) {
    const unreadCount = await getUnreadCountForUser(member.id, 'MEMBER');
    const message = buildMultiPlatformMessage({
      token: member.fcm_token,
      title,
      body,
      dataPayload,
      badgeCount: unreadCount
    });

    admin.messaging().send(message)
      .then(response => console.log('Successfully sent push notification to member:', member.id, response))
      .catch(error => handleTokenError(error, 'MEMBER', member.id));
  }

  return historyRecord;
};

/**
 * Fire-and-forget push for a single staff user with multi-platform payload
 */
const sendPushToStaff = async (staff, title, body, dataPayload = {}) => {
  if (!staff) return;

  // 1. Save history
  let historyRecord = null;
  if (staff.company_id) {
    try {
      historyRecord = await NotificationHistory.create({
        user_id: String(staff.id),
        user_type: 'STAFF',
        company_id: staff.company_id,
        title,
        body,
        data_payload: dataPayload,
        is_read: false
      });
    } catch (err) {
      console.error('Failed to save NotificationHistory:', err);
    }
  }

  // 2. Send push (non-blocking)
  if (isFirebaseInitialized && staff.fcm_token) {
    const unreadCount = await getUnreadCountForUser(staff.id, 'STAFF');
    const message = buildMultiPlatformMessage({
      token: staff.fcm_token,
      title,
      body,
      dataPayload,
      badgeCount: unreadCount
    });

    admin.messaging().send(message)
      .then(response => console.log('Successfully sent push notification to staff:', staff.id, response))
      .catch(error => handleTokenError(error, 'STAFF', staff.id));
  }

  return historyRecord;
};

/**
 * Fire-and-forget push using multicast for a group of members with multi-platform payload
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
      data_payload: dataPayload,
      is_read: false
    }));
    await NotificationHistory.bulkCreate(histories);
  } catch (err) {
    console.error('Failed to save NotificationHistories bulk:', err);
  }

  // 2. Send push (non-blocking) using sendEachForMulticast
  if (isFirebaseInitialized) {
    const validMembers = members.filter(m => m.fcm_token);
    if (validMembers.length === 0) return;

    const chunkSize = 500;
    for (let i = 0; i < validMembers.length; i += chunkSize) {
      const chunk = validMembers.slice(i, i + chunkSize);
      const tokens = chunk.map(m => m.fcm_token);

      const message = buildMultiPlatformMessage({
        tokens,
        title,
        body,
        dataPayload,
        badgeCount: 1
      });

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
  sendPushToMulticast,
  getUnreadCountForUser,
  buildMultiPlatformMessage
};
