const adminService = require('../services/adminService');
const { errorResponse, successResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    return await adminService.loginAdminService(res, email, password);
  } catch (error) {
    console.error('Error in adminLogin:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateCompanyRegistraction = async (req, res) => {
  try {
    return await adminService.storeOrUpdateCompanyService(res, req.body);
  } catch (error) {
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllCompanyDetails = async (req, res) => {
  try {
    const { min, max } = req.body || {};
    return await adminService.getAllCompanyDetailsService(res, min, max);
  } catch (error) {
    console.error('Error in getAllCompanyDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteCompany = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteCompanyService(res, id);
  } catch (error) {
    console.error('Error in deleteCompany:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const loginCompany = async (req, res) => {
  try {
    const { user_code, company_password, type, device_id, device_unique_id, platform_type, device_details } = req.body;
    const deviceInfo = { device_id, device_unique_id, platform_type, device_details };
    return await adminService.loginCompanyService(res, user_code, company_password, type, deviceInfo);
  } catch (error) {
    console.error('Error in loginCompany:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { user_code, type } = req.body;
    return await adminService.forgotPasswordService(res, user_code, type);
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { user_code, type, otp } = req.body;
    return await adminService.verifyOtpService(res, user_code, type, otp);
  } catch (error) {
    console.error('Error in verifyOtp:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const resetPassword = async (req, res) => {
  try {
    const { user_code, type, password } = req.body;
    return await adminService.resetPasswordService(res, user_code, type, password);
  } catch (error) {
    console.error('Error in resetPassword:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    return await adminService.refreshTokenService(res, refresh_token);
  } catch (error) {
    console.error('Error in refreshToken:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateMember = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateMemberService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateMember:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllMemberDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { introduced_as, min, max, search } = req.body || {};
    return await adminService.getAllMemberDetailsService(res, comp_id, introduced_as, min, max, search);
  } catch (error) {
    console.error('Error in getAllMemberDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteMember = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteMemberService(res, id);
  } catch (error) {
    console.error('Error in deleteMember:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const uploadDocument = async (req, res) => {
  try {
    const { type } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'No documents uploaded');
    }

    if (String(type) === '1' && files.length > 1) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Only one document is allowed for type 1');
    }

    const filePaths = files.map(file => `/uploads/${file.filename}`);

    return successResponse(res, statusCodes.OK, 'Documents uploaded successfully', {
      file_paths: filePaths
    });
  } catch (error) {
    console.error('Error in uploadDocument:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, error.message || 'Internal server error');
  }
};

const storeOrUpdateRoute = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    return await adminService.storeOrUpdateRouteService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateRoute:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllRouteDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllRouteDetailsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllRouteDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteRoute = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteRouteService(res, id);
  } catch (error) {
    console.error('Error in deleteRoute:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateArea = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    return await adminService.storeOrUpdateAreaService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateArea:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAreaDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllAreaDetailsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllAreaDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteArea = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteAreaService(res, id);
  } catch (error) {
    console.error('Error in deleteArea:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateChitsGroup = async (req, res) => {
  try {
    const data = { ...req.body };

    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateChitsGroupService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateChitsGroup:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllChitsGroupDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllChitsGroupDetailsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllChitsGroupDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteChitsGroup = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteChitsGroupService(res, id);
  } catch (error) {
    console.error('Error in deleteChitsGroup:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const updateChitsGroupStatus = async (req, res) => {
  try {
    const { id, chits_group_status } = req.body || {};
    return await adminService.updateChitsGroupStatusService(res, id, chits_group_status);
  } catch (error) {
    console.error('Error in updateChitsGroupStatus:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const importLocations = async (req, res) => {
  try {
    return await adminService.importLocationsService(res);
  } catch (error) {
    console.error('Error in importLocations:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCountriesList = async (req, res) => {
  try {
    const { search } = req.body || {};
    return await adminService.getCountriesListService(res, search);
  } catch (error) {
    console.error('Error in getCountriesList:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getStatesList = async (req, res) => {
  try {
    const { country_id, search } = req.body || {};
    return await adminService.getStatesListService(res, country_id, search);
  } catch (error) {
    console.error('Error in getStatesList:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateDistrict = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    return await adminService.storeOrUpdateDistrictService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateDistrict:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllDistrictDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllDistrictDetailsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllDistrictDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateCity = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    return await adminService.storeOrUpdateCityService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateCity:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllCityDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllCityDetailsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllCityDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteCity = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteCityService(res, id);
  } catch (error) {
    console.error('Error in deleteCity:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const fetchStaticDropdown = async (req, res) => {
  try {
    const { type_id, search } = req.body || {};
    return await adminService.fetchStaticDropdownService(res, type_id, search);
  } catch (error) {
    console.error('Error in fetchStaticDropdown:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDistrictsList = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { state_id, search } = req.body || {};
    return await adminService.getDistrictsListService(res, comp_id, state_id, search);
  } catch (error) {
    console.error('Error in getDistrictsList:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateEnrollment = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateEnrollmentService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateEnrollment:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllEnrollmentDetails = async (req, res) => {
  try {
    const { company_id, min, max, search } = req.body || {};
    return await adminService.getAllEnrollmentDetailsService(res, company_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllEnrollmentDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteEnrollment = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteEnrollmentService(res, id);
  } catch (error) {
    console.error('Error in deleteEnrollment:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPositionNumbers = async (req, res) => {
  try {
    const { group_id } = req.body || {};
    return await adminService.getPositionNumbersService(res, group_id);
  } catch (error) {
    console.error('Error in getPositionNumbers:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateUpcomingChit = async (req, res) => {
  try {
    return await adminService.storeOrUpdateUpcomingChitService(res, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateUpcomingChit:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllUpcomingChits = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { status, chit_date, min, max, search } = req.body || {};
    return await adminService.getAllUpcomingChitsService(res, comp_id, status, chit_date, min, max, search);
  } catch (error) {
    console.error('Error in getAllUpcomingChits:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteUpcomingChit = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteUpcomingChitService(res, id);
  } catch (error) {
    console.error('Error in deleteUpcomingChit:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const updateFavorites = async (req, res) => {
  try {
    const { user_id, type, is_favorites } = req.body || {};
    return await adminService.updateFavoritesService(res, user_id, type, is_favorites);
  } catch (error) {
    console.error('Error in updateFavorites:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getGroupMembers = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { group_id, min, max } = req.body || {};
    return await adminService.getGroupMembersService(res, comp_id, group_id, min, max);
  } catch (error) {
    console.error('Error in getGroupMembers:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateSuitFileInformation = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateSuitFileInformationService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateSuitFileInformation:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllSuitFileInformation = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { group_id, subscriber_id, min, max, search } = req.body || {};
    return await adminService.getAllSuitFileInformationService(res, comp_id, group_id, subscriber_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllSuitFileInformation:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteSuitFileInformation = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteSuitFileInformationService(res, id);
  } catch (error) {
    console.error('Error in deleteSuitFileInformation:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAuction = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateAuctionService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateAuction:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAuctions = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { group_id, bidder_id, min, max, search } = req.body || {};
    return await adminService.getAllAuctionsService(res, comp_id, group_id, bidder_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllAuctions:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteAuction = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteAuctionService(res, id);
  } catch (error) {
    console.error('Error in deleteAuction:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllSubcategories = async (req, res) => {
  try {
    const { category_id } = req.body;
    return await adminService.getAllSubcategoriesService(res, category_id);
  } catch (error) {
    console.error('Error in getAllSubcategories:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAgentByAgentType = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { agent_type_id, min, max, search } = req.body || {};
    return await adminService.getAgentByAgentTypeService(res, comp_id, agent_type_id, min, max, search);
  } catch (error) {
    console.error('Error in getAgentByAgentType:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAgentEnrollments = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { agent_type_id, agent_id, group_id, position, min, max, search } = req.body || {};
    return await adminService.getAgentEnrollmentsService(res, comp_id, agent_type_id, agent_id, group_id, position, min, max, search);
  } catch (error) {
    console.error('Error in getAgentEnrollments:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFilteredMembersByGroupAndAgent = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { agent_type_id, agent_id, group_id, min, max } = req.body || {};
    return await adminService.getFilteredMembersByGroupAndAgentService(res, comp_id, agent_type_id, agent_id, group_id, min, max);
  } catch (error) {
    console.error('Error in getFilteredMembersByGroupAndAgent:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const transferAgentUpdate = async (req, res) => {
  try {
    const { member_id, agent_type_id, new_agent_id } = req.body || {};
    return await adminService.transferAgentUpdateService(res, member_id, agent_type_id, new_agent_id);
  } catch (error) {
    console.error('Error in transferAgentUpdate:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAgentTargetEntry = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateAgentTargetEntryService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateAgentTargetEntry:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllGroupUnderStaticLists = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllGroupUnderStaticListsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllGroupUnderStaticLists:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCompanyById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getCompanyByIdService(res, id);
  } catch (error) {
    console.error('Error in getCompanyById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMemberById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getMemberByIdService(res, id);
  } catch (error) {
    console.error('Error in getMemberById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getRouteById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getRouteByIdService(res, id);
  } catch (error) {
    console.error('Error in getRouteById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAreaById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getAreaByIdService(res, id);
  } catch (error) {
    console.error('Error in getAreaById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getChitsGroupById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getChitsGroupByIdService(res, id);
  } catch (error) {
    console.error('Error in getChitsGroupById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCountryById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getCountryByIdService(res, id);
  } catch (error) {
    console.error('Error in getCountryById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getStateById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getStateByIdService(res, id);
  } catch (error) {
    console.error('Error in getStateById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDistrictById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getDistrictByIdService(res, id);
  } catch (error) {
    console.error('Error in getDistrictById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCityById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getCityByIdService(res, id);
  } catch (error) {
    console.error('Error in getCityById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getEnrollmentById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getEnrollmentByIdService(res, id);
  } catch (error) {
    console.error('Error in getEnrollmentById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getUpcomingChitById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getUpcomingChitByIdService(res, id);
  } catch (error) {
    console.error('Error in getUpcomingChitById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getSuitFileInformationById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getSuitFileInformationByIdService(res, id);
  } catch (error) {
    console.error('Error in getSuitFileInformationById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAuctionById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getAuctionByIdService(res, id);
  } catch (error) {
    console.error('Error in getAuctionById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateGroupUnderStaticList = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    return await adminService.storeOrUpdateGroupUnderStaticListService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateGroupUnderStaticList:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteGroupUnderStaticList = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteGroupUnderStaticListService(res, id);
  } catch (error) {
    console.error('Error in deleteGroupUnderStaticList:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getGroupUnderStaticListById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getGroupUnderStaticListByIdService(res, id);
  } catch (error) {
    console.error('Error in getGroupUnderStaticListById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAccountCreationDetail = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const login_user_id = req.user ? req.user.id : null;
    return await adminService.storeOrUpdateAccountCreationDetailService(res, comp_id, login_user_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateAccountCreationDetail:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAccountCreationDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search, account_group_id } = req.body || {};
    return await adminService.getAllAccountCreationDetailsService(res, comp_id, min, max, search, account_group_id);
  } catch (error) {
    console.error('Error in getAllAccountCreationDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAccountTree = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { group_under_id, search } = req.body || {};
    return await adminService.getAllAccountTreeService(res, comp_id, group_under_id, search);
  } catch (error) {
    console.error('Error in getAllAccountTree:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAccountCreationDetailById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getAccountCreationDetailByIdService(res, id);
  } catch (error) {
    console.error('Error in getAccountCreationDetailById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteAccountCreationDetail = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteAccountCreationDetailService(res, id);
  } catch (error) {
    console.error('Error in deleteAccountCreationDetail:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const bulkEditAccountCreationDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const login_user_id = req.user ? req.user.id : null;
    const { accounts } = req.body || {};
    return await adminService.bulkEditAccountCreationDetailsService(res, comp_id, login_user_id, accounts);
  } catch (error) {
    console.error('Error in bulkEditAccountCreationDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    return await adminService.changePasswordService(res, req.user, old_password, new_password);
  } catch (error) {
    console.error('Error in changePassword:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateContactUs = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const data = { ...req.body };
    if (comp_id) data.company_id = comp_id;
    return await adminService.storeOrUpdateContactUsService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateContactUs:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllContactUs = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllContactUsService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllContactUs:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getContactUsById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getContactUsByIdService(res, id);
  } catch (error) {
    console.error('Error in getContactUsById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteContactUs = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteContactUsService(res, id);
  } catch (error) {
    console.error('Error in deleteContactUs:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateFAQ = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const data = { ...req.body };
    if (comp_id) data.company_id = comp_id;
    return await adminService.storeOrUpdateFAQService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateFAQ:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllFAQ = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max, search } = req.body || {};
    return await adminService.getAllFAQService(res, comp_id, min, max, search);
  } catch (error) {
    console.error('Error in getAllFAQ:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFAQById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getFAQByIdService(res, id);
  } catch (error) {
    console.error('Error in getFAQById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteFAQ = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteFAQService(res, id);
  } catch (error) {
    console.error('Error in deleteFAQ:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateTermsPrivacy = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { type, content } = req.body;
    return await adminService.storeOrUpdateTermsPrivacyService(res, comp_id, type, content);
  } catch (error) {
    console.error('Error in storeOrUpdateTermsPrivacy:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getTermsPrivacy = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { type } = req.body;
    return await adminService.getTermsPrivacyService(res, comp_id, type);
  } catch (error) {
    console.error('Error in getTermsPrivacy:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const logout = async (req, res) => {
  try {
    return await adminService.logoutService(res, req.user);
  } catch (error) {
    console.error('Error in logout:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateSelfChit = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateSelfChitService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateSelfChit:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllSelfChitDetails = async (req, res) => {
  try {
    const comp_id = await adminService.getCompanyIdFromUser(req.user, req.body);
    const { min, max } = req.body || {};
    return await adminService.getAllSelfChitDetailsService(res, comp_id, min, max);
  } catch (error) {
    console.error('Error in getAllSelfChitDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getSelfChitById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getSelfChitByIdService(res, id);
  } catch (error) {
    console.error('Error in getSelfChitById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteSelfChit = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteSelfChitService(res, id);
  } catch (error) {
    console.error('Error in deleteSelfChit:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateConfigureBusinessAgentCommission = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.user && req.user.role === 'company' && req.user.id) {
      data.company_id = req.user.id;
    }
    return await adminService.storeOrUpdateConfigureBusinessAgentCommissionService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateConfigureBusinessAgentCommission:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllConfigureBusinessAgentCommissions = async (req, res) => {
  try {
    const { min, max, group_id, business_agent_id } = req.body || {};
    return await adminService.getAllConfigureBusinessAgentCommissionsService(res, { group_id, business_agent_id }, min, max);
  } catch (error) {
    console.error('Error in getAllConfigureBusinessAgentCommissions:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getConfigureBusinessAgentCommissionById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getConfigureBusinessAgentCommissionByIdService(res, id);
  } catch (error) {
    console.error('Error in getConfigureBusinessAgentCommissionById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteConfigureBusinessAgentCommission = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteConfigureBusinessAgentCommissionService(res, id);
  } catch (error) {
    console.error('Error in deleteConfigureBusinessAgentCommission:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateHistoryBusinessAgent = async (req, res) => {
  try {
    const data = { ...req.body };
    return await adminService.storeOrUpdateHistoryBusinessAgentService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateHistoryBusinessAgent:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllHistoryBusinessAgents = async (req, res) => {
  try {
    const { configure_business_agent_id, min, max } = req.body || {};
    return await adminService.getAllHistoryBusinessAgentsService(res, configure_business_agent_id, min, max);
  } catch (error) {
    console.error('Error in getAllHistoryBusinessAgents:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getHistoryBusinessAgentById = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.getHistoryBusinessAgentByIdService(res, id);
  } catch (error) {
    console.error('Error in getHistoryBusinessAgentById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteHistoryBusinessAgent = async (req, res) => {
  try {
    const { id } = req.body || {};
    return await adminService.deleteHistoryBusinessAgentService(res, id);
  } catch (error) {
    console.error('Error in deleteHistoryBusinessAgent:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBusinessAgentCommissionSummary = async (req, res) => {
  try {
    const { business_agent_id, min, max } = req.body || {};
    return await adminService.getBusinessAgentCommissionSummaryService(res, business_agent_id, min, max);
  } catch (error) {
    console.error('Error in getBusinessAgentCommissionSummary:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getHistoryByGroupId = async (req, res) => {
  try {
    const { group_id, min, max } = req.body || {};
    return await adminService.getHistoryByGroupIdService(res, group_id, min, max);
  } catch (error) {
    console.error('Error in getHistoryByGroupId:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdateFAQ,
  getAllFAQ,
  getFAQById,
  deleteFAQ,
  storeOrUpdateTermsPrivacy,
  getTermsPrivacy,
  logout,
  storeOrUpdateContactUs,
  getAllContactUs,
  getContactUsById,
  deleteContactUs,
  changePassword,
  loginAdmin,
  storeOrUpdateCompanyRegistraction,
  getAllCompanyDetails,
  deleteCompany,
  loginCompany,
  refreshToken,
  forgotPassword,
  verifyOtp,
  resetPassword,
  storeOrUpdateMember,
  getAllMemberDetails,
  deleteMember,
  uploadDocument,
  storeOrUpdateRoute,
  getAllRouteDetails,
  deleteRoute,
  storeOrUpdateArea,
  getAllAreaDetails,
  deleteArea,
  storeOrUpdateChitsGroup,
  getAllChitsGroupDetails,
  deleteChitsGroup,
  updateChitsGroupStatus,
  importLocations,
  getCountriesList,
  getStatesList,
  storeOrUpdateDistrict,
  getAllDistrictDetails,
  storeOrUpdateCity,
  getAllCityDetails,
  getDistrictsList,
  deleteCity,
  fetchStaticDropdown,
  storeOrUpdateEnrollment,
  getAllEnrollmentDetails,
  deleteEnrollment,
  getPositionNumbers,
  storeOrUpdateUpcomingChit,
  getAllUpcomingChits,
  deleteUpcomingChit,
  updateFavorites,
  getGroupMembers,
  storeOrUpdateSuitFileInformation,
  getAllSuitFileInformation,
  deleteSuitFileInformation,
  storeOrUpdateAuction,
  getAllAuctions,
  deleteAuction,
  getAllSubcategories,
  getAgentByAgentType,
  getAgentEnrollments,
  storeOrUpdateAgentTargetEntry,
  getFilteredMembersByGroupAndAgent,
  transferAgentUpdate,
  getAllGroupUnderStaticLists,
  getCompanyById,
  getMemberById,
  getRouteById,
  getAreaById,
  getChitsGroupById,
  getCountryById,
  getStateById,
  getDistrictById,
  getCityById,
  getEnrollmentById,
  getUpcomingChitById,
  getSuitFileInformationById,
  getAuctionById,
  storeOrUpdateGroupUnderStaticList,
  deleteGroupUnderStaticList,
  getGroupUnderStaticListById,
  storeOrUpdateAccountCreationDetail,
  getAllAccountCreationDetails,
  getAllAccountTree,
  getAccountCreationDetailById,
  deleteAccountCreationDetail,
  bulkEditAccountCreationDetails,
  storeOrUpdateSelfChit,
  getAllSelfChitDetails,
  getSelfChitById,
  deleteSelfChit,
  storeOrUpdateConfigureBusinessAgentCommission,
  getAllConfigureBusinessAgentCommissions,
  getConfigureBusinessAgentCommissionById,
  deleteConfigureBusinessAgentCommission,
  storeOrUpdateHistoryBusinessAgent,
  getAllHistoryBusinessAgents,
  getHistoryBusinessAgentById,
  deleteHistoryBusinessAgent,
  getBusinessAgentCommissionSummary,
  getHistoryByGroupId
};
