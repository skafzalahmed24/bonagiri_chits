const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const fs = require('fs');
const path = require('path');
const { Member, StaffUser, NotificationHistory } = require('../models');

// Helper to mask token for clean and safe console logging
const maskToken = (token) => {
  if (!token || typeof token !== 'string') return 'N/A';
  if (token.length <= 16) return token;
  return `${token.substring(0, 8)}...${token.substring(token.length - 8)}`;
};

// Initialize Firebase Admin
let isFirebaseInitialized = false;

try {
  if (process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) {
    if (getApps().length === 0) {
      const rawKey = process.env.FCM_PRIVATE_KEY;
      const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
      initializeApp({
        credential: cert({
          projectId: process.env.FCM_PROJECT_ID,
          clientEmail: process.env.FCM_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }
    isFirebaseInitialized = true;
    console.log(`[FCM] Firebase Admin initialized successfully using environment variables (.env) [Project: ${process.env.FCM_PROJECT_ID}].`);
  } else {
    let serviceAccountPath = path.join(__dirname, '../notificationsfiles/serviceAccountKey.json');
    if (!fs.existsSync(serviceAccountPath)) {
      const notifDir = path.join(__dirname, '../notificationsfiles');
      if (fs.existsSync(notifDir)) {
        const files = fs.readdirSync(notifDir);
        const adminKeyFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
        if (adminKeyFile) {
          serviceAccountPath = path.join(notifDir, adminKeyFile);
        }
      }
    }

    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      if (getApps().length === 0) {
        initializeApp({
          credential: cert(serviceAccount)
        });
      }
      isFirebaseInitialized = true;
      console.log(`[FCM] Firebase Admin initialized successfully using ${path.basename(serviceAccountPath)}.`);
    } else {
      console.warn('[FCM WARNING] Firebase Admin is NOT initialized. Missing FCM credentials in .env or serviceAccountKey.json. Live push notifications will be skipped.');
    }
  }
} catch (error) {
  console.error('[FCM ERROR] Error initializing Firebase Admin:', error.message || error);
}

/**
 * Handle stale token cleanup
 */
const handleTokenError = async (error, userType, userId) => {
  const errorCode = error.code || error.message;
  if (errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token') {
    try {
      if (userType === 'MEMBER') {
        await Member.update({ fcm_token: null }, { where: { id: userId } });
      } else if (userType === 'STAFF') {
        await StaffUser.update({ fcm_token: null }, { where: { id: userId } });
      }
      console.log(`[FCM] [TOKEN CLEANUP] Cleared invalid/stale FCM token for ${userType} ID ${userId} (Reason: ${errorCode})`);
    } catch (cleanupError) {
      console.error(`[FCM] [CLEANUP ERROR] Failed to clear stale token for ${userType} ID ${userId}:`, cleanupError.message);
    }
  } else {
    console.error(`[FCM] [DELIVERY ERROR] FCM Send Error for ${userType} ID ${userId}:`, errorCode || error);
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
        'apns-push-type': 'alert',
        'apns-topic': process.env.APNS_BUNDLE_ID || 'com.bonagiriChits.app'
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
  if (!member) {
    console.warn('[FCM] [SKIPPED] sendPushToMember called with null/undefined member.');
    return null;
  }

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
      console.log(`[FCM] [HISTORY SAVED] Notification history recorded for Member ID ${member.id} (Company ID: ${member.company_id}) | Title: "${title}"`);
    } catch (err) {
      console.error(`[FCM] [HISTORY ERROR] Failed to save NotificationHistory for Member ID ${member.id}:`, err.message);
    }
  }

  // 2. Check Firebase initialization
  if (!isFirebaseInitialized) {
    console.warn(`[FCM] [SKIPPED - NO FIREBASE] Cannot send live push to Member ID ${member.id}: Firebase Admin is not initialized.`);
    return historyRecord;
  }

  // 3. Check member FCM token
  if (!member.fcm_token) {
    console.log(`[FCM] [SKIPPED - NO TOKEN] Member ID ${member.id} (${member.phone_number || member.email || 'No phone/email'}) has no FCM device token registered. (History saved in DB).`);
    return historyRecord;
  }

  // 4. Send push (non-blocking)
  const unreadCount = await getUnreadCountForUser(member.id, 'MEMBER');
  const message = buildMultiPlatformMessage({
    token: member.fcm_token,
    title,
    body,
    dataPayload,
    badgeCount: unreadCount
  });

  console.log(`[FCM] [SENDING] Dispatching push to Member ID ${member.id} | Device Token: ${maskToken(member.fcm_token)} | Title: "${title}"`);

  getMessaging().send(message)
    .then(response => {
      console.log(`[FCM] [SUCCESS - REACHED] Push notification successfully delivered to Member ID ${member.id} | FCM Message ID: ${response}`);
    })
    .catch(error => {
      console.error(`[FCM] [FAILED - NOT REACHED] Push notification failed to reach Member ID ${member.id} | Reason: ${error.code || error.message}`);
      handleTokenError(error, 'MEMBER', member.id);
    });

  return historyRecord;
};

/**
 * Fire-and-forget push for a single staff user with multi-platform payload
 */
const sendPushToStaff = async (staff, title, body, dataPayload = {}) => {
  if (!staff) {
    console.warn('[FCM] [SKIPPED] sendPushToStaff called with null/undefined staff.');
    return null;
  }

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
      console.log(`[FCM] [HISTORY SAVED] Notification history recorded for Staff ID ${staff.id} (Company ID: ${staff.company_id}) | Title: "${title}"`);
    } catch (err) {
      console.error(`[FCM] [HISTORY ERROR] Failed to save NotificationHistory for Staff ID ${staff.id}:`, err.message);
    }
  }

  // 2. Check Firebase initialization
  if (!isFirebaseInitialized) {
    console.warn(`[FCM] [SKIPPED - NO FIREBASE] Cannot send live push to Staff ID ${staff.id}: Firebase Admin is not initialized.`);
    return historyRecord;
  }

  // 3. Check staff FCM token
  if (!staff.fcm_token) {
    console.log(`[FCM] [SKIPPED - NO TOKEN] Staff ID ${staff.id} (${staff.phone_number || staff.email || 'No phone/email'}) has no FCM device token registered. (History saved in DB).`);
    return historyRecord;
  }

  // 4. Send push (non-blocking)
  const unreadCount = await getUnreadCountForUser(staff.id, 'STAFF');
  const message = buildMultiPlatformMessage({
    token: staff.fcm_token,
    title,
    body,
    dataPayload,
    badgeCount: unreadCount
  });

  console.log(`[FCM] [SENDING] Dispatching push to Staff ID ${staff.id} | Device Token: ${maskToken(staff.fcm_token)} | Title: "${title}"`);

  getMessaging().send(message)
    .then(response => {
      console.log(`[FCM] [SUCCESS - REACHED] Push notification successfully delivered to Staff ID ${staff.id} | FCM Message ID: ${response}`);
    })
    .catch(error => {
      console.error(`[FCM] [FAILED - NOT REACHED] Push notification failed to reach Staff ID ${staff.id} | Reason: ${error.code || error.message}`);
      handleTokenError(error, 'STAFF', staff.id);
    });

  return historyRecord;
};

/**
 * Fire-and-forget push using multicast for a group of members with multi-platform payload
 */
const sendPushToMulticast = async (members, companyId, title, body, dataPayload = {}) => {
  if (!members || members.length === 0) {
    console.warn('[FCM] [MULTICAST SKIPPED] sendPushToMulticast called with empty member list.');
    return;
  }

  console.log(`[FCM] [MULTICAST INITIATED] Target members count: ${members.length} | Title: "${title}"`);

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
    console.log(`[FCM] [MULTICAST HISTORY SAVED] Successfully saved ${histories.length} NotificationHistory records in database.`);
  } catch (err) {
    console.error('[FCM] [MULTICAST HISTORY ERROR] Failed to save NotificationHistories bulk:', err.message);
  }

  // 2. Check Firebase initialization
  if (!isFirebaseInitialized) {
    console.warn('[FCM] [MULTICAST SKIPPED - NO FIREBASE] Cannot send live multicast push: Firebase Admin is not initialized.');
    return;
  }

  const validMembers = members.filter(m => m.fcm_token);
  const withoutTokens = members.length - validMembers.length;
  console.log(`[FCM] [MULTICAST STATS] Registered FCM tokens: ${validMembers.length} / ${members.length} (${withoutTokens} members have no device token registered).`);

  if (validMembers.length === 0) {
    console.log('[FCM] [MULTICAST SKIPPED - NO TOKENS] None of the targeted members have active device tokens. Skipping FCM dispatch.');
    return;
  }

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

    const batchNum = Math.floor(i / chunkSize) + 1;
    const totalBatches = Math.ceil(validMembers.length / chunkSize);
    console.log(`[FCM] [MULTICAST DISPATCHING] Sending Batch ${batchNum}/${totalBatches} (${chunk.length} devices)...`);

    getMessaging().sendEachForMulticast(message)
      .then(response => {
        console.log(`[FCM] [MULTICAST BATCH ${batchNum} RESULTS] Delivered (Reached): ${response.successCount}, Failed (Not Reached): ${response.failureCount}`);
        if (response.failureCount > 0) {
          response.responses.forEach((res, idx) => {
            if (!res.success) {
              const targetMember = chunk[idx];
              console.error(`[FCM] [MULTICAST FAILED] Failed to reach Member ID ${targetMember.id} (Token: ${maskToken(targetMember.fcm_token)}) | Error: ${res.error?.code || res.error?.message}`);
              handleTokenError(res.error, 'MEMBER', targetMember.id);
            }
          });
        }
      })
      .catch(error => console.error(`[FCM] [MULTICAST BATCH ${batchNum} ERROR]`, error.message || error));
  }
};

module.exports = {
  sendPushToMember,
  sendPushToStaff,
  sendPushToMulticast,
  getUnreadCountForUser,
  buildMultiPlatformMessage
};
