const fixedSchemeService = require('../services/fixedSchemeService');
const adminService = require('../services/adminService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const storeOrUpdateFixedScheme = async (req, res) => {
  try {
    const comp_id = await adminService.resolveCompanyIdForAuth(req.user);
    return await fixedSchemeService.storeOrUpdateFixedSchemeService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdateFixedScheme:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllFixedSchemes = async (req, res) => {
  try {
    const comp_id = await adminService.resolveCompanyIdForAuth(req.user);
    const { scheme_type, status, min, max, search } = req.body || {};
    return await fixedSchemeService.getAllFixedSchemesService(res, comp_id, scheme_type, status, min, max, search);
  } catch (error) {
    console.error('Error in getAllFixedSchemes:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFixedSchemeById = async (req, res) => {
  try {
    const { id } = req.body || {};
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
      return await fixedSchemeService.getFixedSchemeByIdService(res, id, companyId);
  } catch (error) {
    console.error('Error in getFixedSchemeById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFixedSchemeByType = async (req, res) => {
  try {
    const { scheme_type } = req.body || {};
    return await fixedSchemeService.getFixedSchemeByTypeService(res, scheme_type);
  } catch (error) {
    console.error('Error in getFixedSchemeByType:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteFixedScheme = async (req, res) => {
  try {
    const { id } = req.body || {};
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
      return await fixedSchemeService.deleteFixedSchemeService(res, id, companyId);
  } catch (error) {
    console.error('Error in deleteFixedScheme:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdateFixedScheme,
  getAllFixedSchemes,
  getFixedSchemeById,
  getFixedSchemeByType,
  deleteFixedScheme
};
