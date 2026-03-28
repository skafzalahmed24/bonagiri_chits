const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Enrollment, Company, ChitsGroup, Member, StaticDropdownsList, Area, City } = require('../models');

const getHomeRecordService = async (res, subscriber_id) => {
  try {
    const enrollment = await Enrollment.findOne({
      where: {
        subscriber_id,
        delete_status: 0
      },
      include: [
        { model: Company, as: 'company', attributes: ['company_name'] },
        { model: ChitsGroup, as: 'group', attributes: ['group_name'] },
        { model: Member, as: 'subscriber', attributes: ['name', 'member_id'] },
        { model: Member, as: 'business_agent', attributes: ['name', 'member_id'] },
        { model: Member, as: 'collection_agent', attributes: ['name', 'member_id'] },
        { model: StaticDropdownsList, as: 'payment_mode', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'intimation_card', attributes: ['dropdown_name'] },
        { model: Area, as: 'area', attributes: ['area_name'] },
        { model: City, as: 'nominee_city', attributes: ['city_name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (!enrollment) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'No enrollment record found for this subscriber');
    }

    return successResponse(res, statusCodes.OK, 'Latest enrollment record retrieved successfully', enrollment);
  } catch (error) {
    console.error('Error in getHomeRecordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  getHomeRecordService
};
