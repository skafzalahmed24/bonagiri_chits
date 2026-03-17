const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Company, Member, Route, Area } = require('../models');
const { generateTokens, verifyRefreshToken } = require('../utils/jwtHelper');
const { Op } = require('sequelize');

const loginAdminService = async (res, email, password) => {
  // Static check for superadmin
  if (email === 'superadmin@gmail.com' && password === 'superadmin@123') {
    const user = {
      email: 'superadmin@gmail.com',
      role: 'superadmin'
    };

    // Generate JWT tokens
    const tokens = generateTokens(user);

    return successResponse(res, statusCodes.OK, 'Login success', {
      user,
      tokens
    });
  }

  return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid email or password');
};

const loginCompanyService = async (res, company_id, company_email, company_password) => {
  const company = await Company.findOne({
    where: { company_id, company_email, company_password, is_deleted_status: 0 }
  });

  if (!company) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid company credentials');
  }

  const payload = {
    id: company.id,
    company_id: company.company_id,
    role: 'company'
  };

  const tokens = generateTokens(payload);

  return successResponse(res, statusCodes.OK, 'Company login success', {
    company: {
      id: company.id,
      company_id: company.company_id,
      company_name: company.company_name,
      company_email: company.company_email
    },
    tokens
  });
};

const refreshTokenService = async (res, refresh_token) => {
  try {
    const decoded = verifyRefreshToken(refresh_token);

    // Strip exp/iat to generate a fresh token payload
    const payload = { ...decoded };
    delete payload.iat;
    delete payload.exp;

    // Generate a new access and refresh token
    const tokens = generateTokens(payload);

    return successResponse(res, statusCodes.OK, 'Token refreshed successfully', { tokens });
  } catch (error) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid or expired refresh token');
  }
};

const storeOrUpdateCompanyService = async (res, data = {}) => {
  const { id, ...companyData } = data;

  if (id) {
    // Update existing
    const company = await Company.findByPk(id);
    if (!company) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
    }
    await company.update(companyData);
    return successResponse(res, statusCodes.OK, 'Company updated successfully', company);
  } else {
    // Create new
    const newCompany = await Company.create(companyData);
    return successResponse(res, statusCodes.CREATED, 'Company registered successfully', newCompany);
  }
};

const getAllCompanyDetailsService = async (res, min, max) => {
  const limit = parseInt(max, 10) || 10; // default 10
  const offset = parseInt(min, 10) || 0; // default 0

  const companies = await Company.findAndCountAll({
    where: {
      is_deleted_status: 0
    },
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  return successResponse(res, statusCodes.OK, 'Companies retrieved successfully', companies);
};

const deleteCompanyService = async (res, id) => {
  const company = await Company.findByPk(id);

  if (!company) {
    return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
  }

  // Soft delete
  await company.update({ is_deleted_status: 1 });

  return successResponse(res, statusCodes.OK, 'Company deleted successfully');
};

const storeOrUpdateMemberService = async (res, data = {}) => {
  try {
    const { id, ...memberData } = data;

    if (id) {
      // Update existing
      const member = await Member.findByPk(id);
      if (!member) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
      }
      await member.update(memberData);
      return successResponse(res, statusCodes.OK, 'Member updated successfully', member);
    } else {
      // Create new
      const newMember = await Member.create(memberData);
      return successResponse(res, statusCodes.CREATED, 'Member registered successfully', newMember);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateMemberService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllMemberDetailsService = async (res, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const members = await Member.findAndCountAll({
      limit,
      offset,
      where: {
        is_deleted_status: 0,
        name: {
          [Op.like]: `%${search || ''}%`
        }
      },
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Members retrieved successfully', members);
  } catch (error) {
    console.error('Error in getAllMemberDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteMemberService = async (res, id) => {
  try {
    const member = await Member.findByPk(id);

    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    }

    await member.update({ is_deleted_status: 1 });

    return successResponse(res, statusCodes.OK, 'Member deleted successfully');
  } catch (error) {
    console.error('Error in deleteMemberService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateRouteService = async (res, data = {}) => {
  try {
    const { id, ...routeData } = data;

    if (id) {
      const route = await Route.findByPk(id);
      if (!route) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Route not found');
      }
      await route.update(routeData);
      return successResponse(res, statusCodes.OK, 'Route updated successfully', route);
    } else {
      const newRoute = await Route.create(routeData);
      return successResponse(res, statusCodes.CREATED, 'Route created successfully', newRoute);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateRouteService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllRouteDetailsService = async (res, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const routes = await Route.findAndCountAll({
      limit,
      offset,
      where: search ? {
        is_deleted_status: 0,
        route_name: {
          [Op.like]: `%${search}%`
        }
      } : { is_deleted_status: 0 },
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Routes retrieved successfully', routes);
  } catch (error) {
    console.error('Error in getAllRouteDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteRouteService = async (res, id) => {
  try {
    const route = await Route.findByPk(id);

    if (!route) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Route not found');
    }

    await route.update({ is_deleted_status: 1 });

    return successResponse(res, statusCodes.OK, 'Route deleted successfully');
  } catch (error) {
    console.error('Error in deleteRouteService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAreaService = async (res, data = {}) => {
  try {
    const { id, ...areaData } = data;

    if (id) {
      const area = await Area.findByPk(id);
      if (!area) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Area not found');
      }
      await area.update(areaData);
      return successResponse(res, statusCodes.OK, 'Area updated successfully', area);
    } else {
      const newArea = await Area.create(areaData);
      return successResponse(res, statusCodes.CREATED, 'Area created successfully', newArea);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateAreaService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAreaDetailsService = async (res, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const areas = await Area.findAndCountAll({
      limit,
      offset,
      where: search ? {
        is_deleted_status: 0,
        area_name: {
          [Op.like]: `%${search}%`
        }
      } : { is_deleted_status: 0 },
      include: [
        {
          model: Route,
          as: 'route',
          attributes: ['id', 'route_name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Areas retrieved successfully', areas);
  } catch (error) {
    console.error('Error in getAllAreaDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteAreaService = async (res, id) => {
  try {
    const area = await Area.findByPk(id);

    if (!area) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Area not found');
    }

    await area.update({ is_deleted_status: 1 });

    return successResponse(res, statusCodes.OK, 'Area deleted successfully');
  } catch (error) {
    console.error('Error in deleteAreaService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  loginAdminService,
  storeOrUpdateCompanyService,
  getAllCompanyDetailsService,
  deleteCompanyService,
  loginCompanyService,
  refreshTokenService,
  storeOrUpdateMemberService,
  getAllMemberDetailsService,
  deleteMemberService,
  storeOrUpdateRouteService,
  getAllRouteDetailsService,
  deleteRouteService,
  storeOrUpdateAreaService,
  getAllAreaDetailsService,
  deleteAreaService
};
