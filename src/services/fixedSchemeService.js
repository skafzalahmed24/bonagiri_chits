const { FixedSchemeChitsConfiguration } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────────
// ADD / EDIT (store or update) - stores all fields as-is, no type validation
// ─────────────────────────────────────────────────────────────────────────────
const storeOrUpdateFixedSchemeService = async (res, company_id, body) => {
  try {
    const {
      id,
      scheme_type,
      title,
      description,
      months_count,
      members_count,
      status,
      company_profit,
      prices,
      chit_value,
      adding_percentage,
      installment,
      company_percentage,
      company_chit
    } = body;

    const payload = {
      scheme_type,
      title,
      company_id,
      description: description || null,
      months_count,
      members_count,
      status: status !== undefined ? status : 1,
      company_profit: company_profit || null,
      prices: prices || null,
      chit_value: chit_value || null,
      adding_percentage: adding_percentage || null,
      installment: installment || null,
      company_percentage: company_percentage || null,
      company_chit: company_chit || null
    };

    let record;
    let message;

    if (id) {
      const existing = await FixedSchemeChitsConfiguration.findByPk(id);
      if (!existing) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Record not found');
      }
      await existing.update(payload);
      record = await FixedSchemeChitsConfiguration.findByPk(id);
      message = 'Fixed scheme chit configuration updated successfully';
    } else {
      record = await FixedSchemeChitsConfiguration.create(payload);
      message = 'Fixed scheme chit configuration created successfully';
    }

    return successResponse(res, statusCodes.OK, message, record);
  } catch (error) {
    console.error('Error in storeOrUpdateFixedSchemeService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL (paginated, filterable by scheme_type / status / search)
// ─────────────────────────────────────────────────────────────────────────────
const getAllFixedSchemesService = async (res, company_id, scheme_type, status, min = 0, max = 10, search = '') => {
  try {
    const whereClause = {};

    if (company_id) {
      whereClause.company_id = company_id;
    }
    if (scheme_type !== undefined && scheme_type !== null && scheme_type !== '') {
      whereClause.scheme_type = parseInt(scheme_type);
    }
    if (status !== undefined && status !== null && status !== '') {
      whereClause.status = parseInt(status);
    }
    if (search) {
      whereClause.title = { [Op.iLike]: `%${search}%` };
    }

    const offset = parseInt(min, 10) || 0;
    const limit = parseInt(max, 10) || 10;

    const { count, rows } = await FixedSchemeChitsConfiguration.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return successResponse(res, statusCodes.OK, 'Fixed scheme chit configurations retrieved successfully', {
      count,
      rows
    });
  } catch (error) {
    console.error('Error in getAllFixedSchemesService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────
const getFixedSchemeByIdService = async (res, id) => {
  try {
    const record = await FixedSchemeChitsConfiguration.findByPk(id);
    if (!record) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Record not found');
    }
    return successResponse(res, statusCodes.OK, 'Fixed scheme chit configuration retrieved successfully', record);
  } catch (error) {
    console.error('Error in getFixedSchemeByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFixedSchemeByTypeService = async (res, scheme_type) => {
  try {
    const record = await FixedSchemeChitsConfiguration.findOne({ where: { scheme_type } });
    if (!record) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Record not found');
    }
    return successResponse(res, statusCodes.OK, 'Fixed scheme chit configuration retrieved successfully', record);
  } catch (error) {
    console.error('Error in getFixedSchemeByTypeService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────
const deleteFixedSchemeService = async (res, id) => {
  try {
    const record = await FixedSchemeChitsConfiguration.findByPk(id);
    if (!record) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Record not found');
    }
    await record.destroy();
    return successResponse(res, statusCodes.OK, 'Fixed scheme chit configuration deleted successfully', { id });
  } catch (error) {
    console.error('Error in deleteFixedSchemeService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdateFixedSchemeService,
  getAllFixedSchemesService,
  getFixedSchemeByIdService,
  getFixedSchemeByTypeService,
  deleteFixedSchemeService
};
