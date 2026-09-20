'use strict';

const { Op } = require('sequelize');
const { Banner, AssignedBannerToPeople, Member, Company, sequelize } = require('../models');
const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { getSimulatedNow } = require('../utils/timeSimulator');

const parseSubscriberIds = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      }
    } catch (e) {
      // If comma separated
      return input.split(',').map(s => parseInt(s.trim(), 10)).filter(id => !isNaN(id));
    }
  }
  const single = parseInt(input, 10);
  return !isNaN(single) ? [single] : [];
};

const resolveCompanyId = (userToken) => {
  if (!userToken) return null;
  return (userToken.role === 'staff' || userToken.role === 'member') ? userToken.company_id : userToken.id;
};

const getValidOffersForSubscriberHelper = async (subscriberId, companyId = null) => {
  try {
    const simulatedNow = await getSimulatedNow();
    const todayStr = simulatedNow.toISOString().split('T')[0];

    // Find assigned banner IDs for this subscriber
    const assignedRecords = await AssignedBannerToPeople.findAll({
      where: { subscriber_id: subscriberId },
      attributes: ['assigned_banner_id']
    });
    const assignedBannerIds = assignedRecords.map(r => r.assigned_banner_id);

    const whereClause = {
      is_deleted_status: 0,
      status: 1,
      banner_start_date: { [Op.lte]: todayStr },
      banner_end_date: { [Op.gte]: todayStr },
      [Op.or]: [
        { banner_type: 1 }, // Regular (for all)
        ...(assignedBannerIds.length > 0 ? [{ id: { [Op.in]: assignedBannerIds }, banner_type: 2 }] : [])
      ]
    };

    if (companyId) {
      whereClause.company_id = companyId;
    }

    const banners = await Banner.findAll({
      where: whereClause,
      order: [['banner_start_date', 'DESC'], ['id', 'DESC']],
      attributes: ['id', 'company_id', 'banner_image', 'banner_type', 'status', 'banner_start_date', 'banner_end_date', 'createdAt']
    });

    return banners.map(b => ({
      id: b.id,
      banner_image: b.banner_image,
      banner_type: b.banner_type,
      banner_type_label: b.banner_type === 1 ? 'Regular' : 'Targeted',
      banner_start_date: b.banner_start_date,
      banner_end_date: b.banner_end_date,
      status: b.status
    }));
  } catch (error) {
    console.error('Error in getValidOffersForSubscriberHelper:', error);
    return [];
  }
};

const storeOrUpdateBannerService = async (res, userToken, data, file) => {
  const transaction = await sequelize.transaction();
  try {
    const companyId = resolveCompanyId(userToken);
    const { id, banner_type, banner_start_date, banner_end_date, status } = data;

    let banner_image = null;
    if (file) {
      banner_image = `/uploads/${file.filename}`;
    } else if (data.banner_image) {
      banner_image = data.banner_image;
    }

    const typeInt = parseInt(banner_type, 10) || 1;
    const subscriberIds = parseSubscriberIds(data.subscriber_ids);

    if (typeInt === 2 && subscriberIds.length === 0 && !id) {
      await transaction.rollback();
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Please select at least one subscriber for targeted banner (banner_type: 2)');
    }

    let bannerRecord;
    if (id) {
      bannerRecord = await Banner.findOne({
        where: { id, is_deleted_status: 0, ...(companyId ? { company_id: companyId } : {}) },
        transaction
      });

      if (!bannerRecord) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.NOT_FOUND, 'Banner not found');
      }

      const updateData = {
        banner_type: typeInt,
        ...(banner_image ? { banner_image } : {}),
        ...(banner_start_date ? { banner_start_date } : {}),
        ...(banner_end_date ? { banner_end_date } : {}),
        ...(status !== undefined && status !== null ? { status: parseInt(status, 10) } : {})
      };

      await bannerRecord.update(updateData, { transaction });

      // If updating to banner_type 2 with subscriberIds provided, replace assignments
      if (typeInt === 2 && data.subscriber_ids !== undefined) {
        await AssignedBannerToPeople.destroy({
          where: { assigned_banner_id: bannerRecord.id },
          transaction
        });

        if (subscriberIds.length > 0) {
          const assignments = subscriberIds.map(subId => ({
            assigned_banner_id: bannerRecord.id,
            subscriber_id: subId
          }));
          await AssignedBannerToPeople.bulkCreate(assignments, { transaction });
        }
      } else if (typeInt === 1) {
        // Clear any previous assignments if switched to regular
        await AssignedBannerToPeople.destroy({
          where: { assigned_banner_id: bannerRecord.id },
          transaction
        });
      }
    } else {
      if (!banner_image) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Banner image is required');
      }
      if (!banner_start_date || !banner_end_date) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.BAD_REQUEST, 'banner_start_date and banner_end_date are required');
      }

      bannerRecord = await Banner.create({
        company_id: companyId,
        banner_image,
        banner_type: typeInt,
        status: status !== undefined && status !== null ? parseInt(status, 10) : 1,
        is_deleted_status: 0,
        banner_start_date,
        banner_end_date
      }, { transaction });

      if (typeInt === 2 && subscriberIds.length > 0) {
        const assignments = subscriberIds.map(subId => ({
          assigned_banner_id: bannerRecord.id,
          subscriber_id: subId
        }));
        await AssignedBannerToPeople.bulkCreate(assignments, { transaction });
      }
    }

    await transaction.commit();

    // Fetch refreshed banner with associations
    const result = await Banner.findByPk(bannerRecord.id, {
      include: [
        {
          model: AssignedBannerToPeople,
          as: 'assigned_subscribers',
          include: [
            {
              model: Member,
              as: 'subscriber',
              attributes: ['id', 'name', 'member_id', 'mobile_number', 'upload_image']
            }
          ]
        }
      ]
    });

    const isUpdate = !!id;
    return successResponse(
      res,
      isUpdate ? statusCodes.OK : statusCodes.CREATED,
      isUpdate ? 'Banner updated successfully' : 'Banner created successfully',
      result
    );
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Error in storeOrUpdateBannerService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllBannersService = async (res, userToken, filters = {}) => {
  try {
    const companyId = resolveCompanyId(userToken);
    const { min = 0, max = 10, banner_type, status, from_date, to_date, search } = filters;

    const whereClause = {
      is_deleted_status: 0
    };

    if (companyId) {
      whereClause.company_id = companyId;
    }

    if (banner_type !== undefined && banner_type !== null && banner_type !== '') {
      whereClause.banner_type = parseInt(banner_type, 10);
    }

    if (status !== undefined && status !== null && status !== '') {
      whereClause.status = parseInt(status, 10);
    }

    if (from_date && to_date) {
      whereClause[Op.and] = [
        { banner_start_date: { [Op.lte]: to_date } },
        { banner_end_date: { [Op.gte]: from_date } }
      ];
    } else if (from_date) {
      whereClause.banner_end_date = { [Op.gte]: from_date };
    } else if (to_date) {
      whereClause.banner_start_date = { [Op.lte]: to_date };
    }

    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const { count, rows } = await Banner.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: AssignedBannerToPeople,
          as: 'assigned_subscribers',
          include: [
            {
              model: Member,
              as: 'subscriber',
              attributes: ['id', 'name', 'member_id', 'mobile_number', 'upload_image']
            }
          ]
        }
      ],
      order: [['banner_start_date', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    const formattedRows = rows.map(b => {
      const assigned = b.assigned_subscribers || [];
      return {
        id: b.id,
        company_id: b.company_id,
        banner_image: b.banner_image,
        banner_type: b.banner_type,
        banner_type_label: b.banner_type === 1 ? 'Regular' : 'Targeted',
        status: b.status,
        status_label: b.status === 1 ? 'Active' : 'Inactive',
        banner_start_date: b.banner_start_date,
        banner_end_date: b.banner_end_date,
        assigned_subscribers_count: assigned.length,
        assigned_subscribers: assigned.map(a => a.subscriber).filter(Boolean),
        createdAt: b.createdAt,
        updatedAt: b.updatedAt
      };
    });

    return successResponse(res, statusCodes.OK, 'Banners retrieved successfully', {
      count,
      rows: formattedRows
    });
  } catch (error) {
    console.error('Error in getAllBannersService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBannerByIdService = async (res, userToken, id) => {
  try {
    const companyId = resolveCompanyId(userToken);
    if (!id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Banner ID is required');
    }

    const banner = await Banner.findOne({
      where: { id, is_deleted_status: 0, ...(companyId ? { company_id: companyId } : {}) },
      include: [
        {
          model: AssignedBannerToPeople,
          as: 'assigned_subscribers',
          include: [
            {
              model: Member,
              as: 'subscriber',
              attributes: ['id', 'name', 'member_id', 'mobile_number', 'upload_image', 'email']
            }
          ]
        }
      ]
    });

    if (!banner) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Banner not found');
    }

    const assigned = banner.assigned_subscribers || [];
    const formatted = {
      id: banner.id,
      company_id: banner.company_id,
      banner_image: banner.banner_image,
      banner_type: banner.banner_type,
      banner_type_label: banner.banner_type === 1 ? 'Regular' : 'Targeted',
      status: banner.status,
      status_label: banner.status === 1 ? 'Active' : 'Inactive',
      banner_start_date: banner.banner_start_date,
      banner_end_date: banner.banner_end_date,
      assigned_subscribers_count: assigned.length,
      assigned_subscribers: assigned.map(a => a.subscriber).filter(Boolean),
      subscriber_ids: assigned.map(a => a.subscriber_id),
      createdAt: banner.createdAt,
      updatedAt: banner.updatedAt
    };

    return successResponse(res, statusCodes.OK, 'Banner details retrieved successfully', formatted);
  } catch (error) {
    console.error('Error in getBannerByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteBannerService = async (res, userToken, id) => {
  try {
    const companyId = resolveCompanyId(userToken);
    if (!id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Banner ID is required');
    }

    const banner = await Banner.findOne({
      where: { id, is_deleted_status: 0, ...(companyId ? { company_id: companyId } : {}) }
    });

    if (!banner) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Banner not found');
    }

    await banner.update({ is_deleted_status: 1 });

    return successResponse(res, statusCodes.OK, 'Banner deleted successfully');
  } catch (error) {
    console.error('Error in deleteBannerService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const changeBannerStatusService = async (res, userToken, id, status) => {
  try {
    const companyId = resolveCompanyId(userToken);
    if (!id || status === undefined || status === null) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'id and status are required');
    }

    const banner = await Banner.findOne({
      where: { id, is_deleted_status: 0, ...(companyId ? { company_id: companyId } : {}) }
    });

    if (!banner) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Banner not found');
    }

    const statusInt = parseInt(status, 10) === 1 ? 1 : 0;
    await banner.update({ status: statusInt });

    return successResponse(res, statusCodes.OK, `Banner status updated to ${statusInt === 1 ? 'Active' : 'Inactive'}`, {
      id: banner.id,
      status: statusInt
    });
  } catch (error) {
    console.error('Error in changeBannerStatusService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getUserValidOffersService = async (res, userPayload) => {
  try {
    if (!userPayload || !userPayload.id) {
      return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
    }

    const subscriberId = userPayload.id;
    const companyId = userPayload.company_id || null;

    const offers = await getValidOffersForSubscriberHelper(subscriberId, companyId);

    return successResponse(res, statusCodes.OK, 'Valid offers retrieved successfully', {
      count: offers.length,
      rows: offers
    });
  } catch (error) {
    console.error('Error in getUserValidOffersService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdateBannerService,
  getAllBannersService,
  getBannerByIdService,
  deleteBannerService,
  changeBannerStatusService,
  getUserValidOffersService,
  getValidOffersForSubscriberHelper
};
