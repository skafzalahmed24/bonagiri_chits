const adminService = require('../services/adminService');
const { errorResponse, successResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Call service layer and pass res for it to handle responses
    return await adminService.loginAdminService(res, email, password);

  } catch (error) {
    console.error('Error in adminLogin:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateCompanyRegistraction = async (req, res) => {
  try {
    // Pass the request body exactly as it is to the service layer
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
  getPositionNumbers
};
