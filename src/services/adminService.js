const fs = require('fs');
const path = require('path');
const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Company, Member, Route, Area, ChitsGroup, Country, State, District, City, StaticDropdownsList } = require('../models');
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

const loginCompanyService = async (res, company_id, company_password) => {
  const company = await Company.findOne({
    where: { company_id, company_password, is_deleted_status: 0 }
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
      company_name: company.company_name
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

const generateUniqueUserCode = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;

  while (!isUnique) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const existing = await Member.findOne({ where: { other_info_user_code: code } });
    if (!existing) {
      isUnique = true;
    }
  }
  return code;
};

const storeOrUpdateMemberService = async (res, data = {}) => {
  try {
    const { id, ...memberData } = data;

    // Auto generate user code if not provided
    if (!memberData.other_info_user_code) {
      memberData.other_info_user_code = await generateUniqueUserCode();
    } else {
      // Check uniqueness if provided
      const existing = await Member.findOne({
        where: {
          other_info_user_code: memberData.other_info_user_code,
          ...(id && { id: { [Op.ne]: id } })
        }
      });
      if (existing) {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'User Code already exists');
      }
    }

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
        [Op.or]: [
          { name: { [Op.like]: `%${search || ''}%` } },
          { member_id: { [Op.like]: `%${search || ''}%` } },
          { mobile_number: { [Op.like]: `%${search || ''}%` } }
        ]
      },
      include: [
        { model: StaticDropdownsList, as: 'title', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'parental_title', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'gender_dropdown', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'occupation', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'emp_type', attributes: ['dropdown_name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Resolve labels for JSON fields (arrays of UUIDs)
    const rows = await Promise.all(members.rows.map(async (member) => {
      const memberData = member.toJSON();

      // Resolve introduced_as
      if (Array.isArray(memberData.introduced_as)) {
        const labels = await StaticDropdownsList.findAll({
          where: { id: { [Op.in]: memberData.introduced_as } },
          attributes: ['id', 'dropdown_name']
        });
        memberData.introduced_as_dropdown = labels;
      }

      // Resolve other_info_kyc_details
      if (Array.isArray(memberData.other_info_kyc_details)) {
        const labels = await StaticDropdownsList.findAll({
          where: { id: { [Op.in]: memberData.other_info_kyc_details } },
          attributes: ['id', 'dropdown_name']
        });
        memberData.kyc_type = labels;
      }

      return memberData;
    }));

    return successResponse(res, statusCodes.OK, 'Members retrieved successfully', { count: members.count, rows });
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

    // 🔥 Flatten route
    const formattedRows = areas.rows.map(area => {
      const areaData = area.toJSON();

      return {
        ...areaData,
        route_id: areaData.route?.id || null,
        route_name: areaData.route?.route_name || null,
        route: undefined // remove nested object
      };
    });

    const response = {
      count: areas.count,
      rows: formattedRows
    };

    return successResponse(res, statusCodes.OK, 'Areas retrieved successfully', response);
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

const storeOrUpdateChitsGroupService = async (res, data = {}) => {
  try {
    const { id, ...chitsGroupData } = data;

    if (id) {
      const chitsGroup = await ChitsGroup.findByPk(id);
      if (!chitsGroup) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');
      }
      await chitsGroup.update(chitsGroupData);
      return successResponse(res, statusCodes.OK, 'Chits group updated successfully', chitsGroup);
    } else {
      const newChitsGroup = await ChitsGroup.create(chitsGroupData);
      return successResponse(res, statusCodes.CREATED, 'Chits group created successfully', newChitsGroup);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateChitsGroupService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllChitsGroupDetailsService = async (res, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const chitsGroups = await ChitsGroup.findAndCountAll({
      limit,
      offset,
      where: search ? {
        is_deleted_status: 0,
        [Op.or]: [
          { chit_agreement_number: { [Op.like]: `%${search}%` } },
          { company_chit_number: { [Op.like]: `%${search}%` } },
          { fdr_number: { [Op.like]: `%${search}%` } }
        ]
      } : { is_deleted_status: 0 },
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Chits groups retrieved successfully', chitsGroups);
  } catch (error) {
    console.error('Error in getAllChitsGroupDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteChitsGroupService = async (res, id) => {
  try {
    const chitsGroup = await ChitsGroup.findByPk(id);

    if (!chitsGroup) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');
    }

    await chitsGroup.update({ is_deleted_status: 1 });

    return successResponse(res, statusCodes.OK, 'Chits group deleted successfully');
  } catch (error) {
    console.error('Error in deleteChitsGroupService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const importLocationsService = async (res) => {
  try {
    const countryCsvPath = path.join(__dirname, '../utils/public/countrycodes.csv');
    const stateCsvPath = path.join(__dirname, '../utils/public/stateNames.csv');

    if (!fs.existsSync(countryCsvPath) || !fs.existsSync(stateCsvPath)) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'CSV files not found');
    }

    // Parse Countries
    const countryLines = fs.readFileSync(countryCsvPath, 'utf8').split('\n');
    const countryData = countryLines
      .slice(1)
      .filter(line => line.trim())
      .map(line => {
        const cols = line.split(',');
        return {
          id: parseInt(cols[0]),
          country_name: cols[1]?.trim(),
          country_code: cols[2]?.trim(),
          dialing_code: cols[3]?.trim(),
          currency: cols[4]?.trim(),
          currency_name: cols[5]?.trim(),
          currency_symbol: cols[6]?.trim(),
          emoji: cols[7]?.trim(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      })
      .filter(item => !isNaN(item.id));

    // Parse States
    const stateLines = fs.readFileSync(stateCsvPath, 'utf8').split('\n');
    const stateData = stateLines
      .slice(1)
      .filter(line => line.trim())
      .map(line => {
        const cols = line.split(',');
        return {
          id: parseInt(cols[0]),
          state_name: cols[1]?.trim(),
          country_id: parseInt(cols[2]),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      })
      .filter(item => !isNaN(item.id));

    // Bulk Insert
    await Country.bulkCreate(countryData, { updateOnDuplicate: ['country_name', 'country_code', 'dialing_code', 'currency', 'currency_name', 'currency_symbol', 'emoji'] });
    await State.bulkCreate(stateData, { updateOnDuplicate: ['state_name', 'country_id'] });

    return successResponse(res, statusCodes.OK, 'Countries and States imported successfully');
  } catch (error) {
    console.error('Error in importLocationsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, error.message || 'Internal server error');
  }
};

const getCountriesListService = async (res, search) => {
  try {
    const countries = await Country.findAll({
      where: search ? {
        country_name: { [Op.like]: `%${search}%` }
      } : {},
      order: [['country_name', 'ASC']]
    });
    return successResponse(res, statusCodes.OK, 'Countries retrieved successfully', countries);
  } catch (error) {
    console.error('Error in getCountriesListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getStatesListService = async (res, country_id, search) => {
  try {
    const states = await State.findAll({
      where: {
        country_id,
        ...(search && { state_name: { [Op.like]: `%${search}%` } })
      },
      order: [['state_name', 'ASC']]
    });
    return successResponse(res, statusCodes.OK, 'States retrieved successfully', states);
  } catch (error) {
    console.error('Error in getStatesListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateDistrictService = async (res, data = {}) => {
  try {
    const { id, ...districtData } = data;
    if (id) {
      const district = await District.findByPk(id);
      if (!district) return errorResponse(res, statusCodes.NOT_FOUND, 'District not found');
      await district.update(districtData);
      return successResponse(res, statusCodes.OK, 'District updated successfully', district);
    } else {
      const newDistrict = await District.create(districtData);
      return successResponse(res, statusCodes.CREATED, 'District created successfully', newDistrict);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateDistrictService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllDistrictDetailsService = async (res, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const districts = await District.findAndCountAll({
      limit,
      offset,
      where: {
        is_deleted_status: 0,
        ...(search && { district_name: { [Op.like]: `%${search}%` } })
      },
      include: [
        { model: Country, attributes: ['country_name'] },
        { model: State, attributes: ['state_name'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'Districts retrieved successfully', districts);
  } catch (error) {
    console.error('Error in getAllDistrictDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateCityService = async (res, data = {}) => {
  try {
    const { id, ...cityData } = data;
    if (id) {
      const city = await City.findByPk(id);
      if (!city) return errorResponse(res, statusCodes.NOT_FOUND, 'City not found');
      await city.update(cityData);
      return successResponse(res, statusCodes.OK, 'City updated successfully', city);
    } else {
      const newCity = await City.create(cityData);
      return successResponse(res, statusCodes.CREATED, 'City created successfully', newCity);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateCityService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllCityDetailsService = async (res, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const cities = await City.findAndCountAll({
      limit,
      offset,
      where: {
        is_deleted_status: 0,
        ...(search && { city_name: { [Op.like]: `%${search}%` } })
      },
      include: [
        { model: Country, attributes: ['country_name'] },
        { model: State, attributes: ['state_name'] },
        { model: District, attributes: ['district_name'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'Cities retrieved successfully', cities);
  } catch (error) {
    console.error('Error in getAllCityDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDistrictsListService = async (res, state_id, search) => {
  try {
    const districts = await District.findAll({
      where: {
        state_id,
        is_deleted_status: 0,
        ...(search && { district_name: { [Op.like]: `%${search}%` } })
      },
      order: [['district_name', 'ASC']]
    });
    return successResponse(res, statusCodes.OK, 'Districts retrieved successfully', districts);
  } catch (error) {
    console.error('Error in getDistrictsListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteCityService = async (res, id) => {
  try {
    const city = await City.findByPk(id);
    if (!city) return errorResponse(res, statusCodes.NOT_FOUND, 'City not found');
    await city.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'City deleted successfully');
  } catch (error) {
    console.error('Error in deleteCityService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const fetchStaticDropdownService = async (res, type_id, search) => {
  try {
    const dropdowns = await StaticDropdownsList.findAll({
      where: {
        type_id,
        status: 1,
        dropdown_name: {
          [Op.like]: `%${search || ''}%`
        }
      },
      attributes: ['id', 'dropdown_name', 'type_id'],
      order: [['dropdown_name', 'ASC']]
    });

    return successResponse(res, statusCodes.OK, 'Dropdown values retrieved successfully', dropdowns);
  } catch (error) {
    console.error('Error in fetchStaticDropdownService:', error);
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
  deleteAreaService,
  storeOrUpdateChitsGroupService,
  getAllChitsGroupDetailsService,
  deleteChitsGroupService,
  importLocationsService,
  getCountriesListService,
  getStatesListService,
  storeOrUpdateDistrictService,
  getAllDistrictDetailsService,
  storeOrUpdateCityService,
  getAllCityDetailsService,
  getDistrictsListService,
  deleteCityService,
  fetchStaticDropdownService
};
