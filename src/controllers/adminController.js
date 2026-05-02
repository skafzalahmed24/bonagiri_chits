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
    const { company_id, introduced_as, min, max, search } = req.body || {};
    return await adminService.getAllMemberDetailsService(res, company_id, introduced_as, min, max, search);
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
    return await adminService.storeOrUpdateRouteService(res, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateRoute:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllRouteDetails = async (req, res) => {
  try {
    const { min, max, search } = req.body || {};
    return await adminService.getAllRouteDetailsService(res, min, max, search);
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
    return await adminService.storeOrUpdateAreaService(res, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateArea:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAreaDetails = async (req, res) => {
  try {
    const { min, max, search } = req.body || {};
    return await adminService.getAllAreaDetailsService(res, min, max, search);
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
    const { company_id, min, max, search } = req.body || {};
    return await adminService.getAllChitsGroupDetailsService(res, company_id, min, max, search);
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
    return await adminService.storeOrUpdateDistrictService(res, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateDistrict:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllDistrictDetails = async (req, res) => {
  try {
    const { min, max, search } = req.body || {};
    return await adminService.getAllDistrictDetailsService(res, min, max, search);
  } catch (error) {
    console.error('Error in getAllDistrictDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateCity = async (req, res) => {
  try {
    return await adminService.storeOrUpdateCityService(res, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateCity:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllCityDetails = async (req, res) => {
  try {
    const { min, max, search } = req.body || {};
    return await adminService.getAllCityDetailsService(res, min, max, search);
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
    const { state_id, search } = req.body || {};
    return await adminService.getDistrictsListService(res, state_id, search);
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
    const { company_id, status, chit_date, min, max } = req.body || {};
    return await adminService.getAllUpcomingChitsService(res, company_id, status, chit_date, min, max);
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
    const { group_id, min, max } = req.body || {};
    return await adminService.getGroupMembersService(res, group_id, min, max);
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
    const { company_id, group_id, subscriber_id, min, max } = req.body || {};
    return await adminService.getAllSuitFileInformationService(res, company_id, group_id, subscriber_id, min, max);
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
    const { company_id, group_id, bidder_id, min, max } = req.body || {};
    return await adminService.getAllAuctionsService(res, company_id, group_id, bidder_id, min, max);
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
    const { agent_type_id, min, max, search } = req.body || {};
    return await adminService.getAgentByAgentTypeService(res, agent_type_id, min, max, search);
  } catch (error) {
    console.error('Error in getAgentByAgentType:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAgentEnrollments = async (req, res) => {
  try {
    const { agent_type_id, agent_id, group_id, position, min, max, search } = req.body || {};
    return await adminService.getAgentEnrollmentsService(res, agent_type_id, agent_id, group_id, position, min, max, search);
  } catch (error) {
    console.error('Error in getAgentEnrollments:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFilteredMembersByGroupAndAgent = async (req, res) => {
  try {
    const { agent_type_id, agent_id, group_id, min, max } = req.body || {};
    return await adminService.getFilteredMembersByGroupAndAgentService(res, agent_type_id, agent_id, group_id, min, max);
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
    const { min, max, search } = req.body || {};
    return await adminService.getAllGroupUnderStaticListsService(res, min, max, search);
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

module.exports = {
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
  getAuctionById
};
