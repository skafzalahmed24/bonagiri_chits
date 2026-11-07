const { SystemSettings, SystemAuditLog, StaffUser, sequelize } = require('../models');

class SystemSettingsService {
  /**
   * Business Date, scheduler mode and manual job tools are for dev and staging only.
   * ENABLE_BUSINESS_DATE_TOOLS ('true' / 'false') is the single switch and wins when set.
   * When it is not set the tools are on, except when NODE_ENV is production, so a forgotten
   * setting can never expose them on a production server.
   */
  static toolsEnabled() {
    const flag = String(process.env.ENABLE_BUSINESS_DATE_TOOLS || '').trim().toLowerCase();
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return process.env.NODE_ENV !== 'production';
  }

  /**
   * Get the current system settings. If none exist, create default.
   */
  static async getSettings() {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({
        scheduler_mode: 'AUTOMATIC',
        environment: process.env.NODE_ENV === 'production' ? 'Production' : 'Development'
      });
    } else if (process.env.NODE_ENV !== 'production' && settings.environment === 'Production') {
      settings.environment = 'Development';
      await settings.save();
    }
    return settings;
  }

  /**
   * Get the current business date. Returns real date if not set, and always the real date
   * when the tools are off (production), so an override saved earlier can never stay active.
   */
  static async getBusinessDate() {
    if (!this.toolsEnabled()) return new Date();
    const settings = await this.getSettings();
    if (settings.business_date) {
      return new Date(settings.business_date);
    }
    return new Date(); // Real server date
  }

  /**
   * Update the business date and log the audit trail.
   */
  static async updateBusinessDate({ newDate, reason, remarks, changedBy }) {
    const transaction = await sequelize.transaction();
    try {
      const settings = await this.getSettings();
      const previousDate = settings.business_date;

      await settings.update({
        business_date: newDate,
        last_updated_by: changedBy,
        last_updated_on: new Date()
      }, { transaction });

      await SystemAuditLog.create({
        action_type: 'UPDATE_BUSINESS_DATE',
        previous_value: { business_date: previousDate },
        new_value: { business_date: newDate },
        changed_by: changedBy,
        changed_on: new Date(),
        reason,
        remarks,
        status: 'SUCCESS'
      }, { transaction });

      await transaction.commit();
      return settings;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Update the scheduler mode (AUTOMATIC / MANUAL).
   */
  static async updateSchedulerMode({ mode, reason, remarks, changedBy }) {
    const transaction = await sequelize.transaction();
    try {
      const settings = await this.getSettings();
      const previousMode = settings.scheduler_mode;

      if (settings.environment === 'Production' && mode === 'MANUAL') {
        throw new Error('Cannot set scheduler mode to MANUAL in Production environment.');
      }

      await settings.update({
        scheduler_mode: mode,
        last_updated_by: changedBy,
        last_updated_on: new Date()
      }, { transaction });

      await SystemAuditLog.create({
        action_type: 'UPDATE_SCHEDULER_MODE',
        previous_value: { scheduler_mode: previousMode },
        new_value: { scheduler_mode: mode },
        changed_by: changedBy,
        changed_on: new Date(),
        reason,
        remarks,
        status: 'SUCCESS'
      }, { transaction });

      await transaction.commit();
      return settings;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = SystemSettingsService;
