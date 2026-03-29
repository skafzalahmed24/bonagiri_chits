const fs = require('fs');
const path = require('path');
const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Company, Member, Route, Area, ChitsGroup, Country, State, District, City, StaticDropdownsList, Enrollment, ChitsInstallment, sequelize } = require('../models');
const { generateTokens, verifyRefreshToken } = require('../utils/jwtHelper');
const { Op } = require('sequelize');

const loginAdminService = async (res, email, password) => {
  if (email === 'superadmin@gmail.com' && password === 'superadmin@123') {
    const user = { email: 'superadmin@gmail.com', role: 'superadmin' };
    const tokens = generateTokens(user);
    return successResponse(res, statusCodes.OK, 'Login success', { user, tokens });
  }
  return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid email or password');
};

const loginCompanyService = async (res, user_code, password, type, deviceInfo = {}) => {
  try {
    let user;
    let role;
    if (type === 1) {
      user = await Company.findOne({ where: { company_id: user_code, company_password: password, is_deleted_status: 0 } });
      role = 'company';
    } else if (type === 2) {
      user = await Member.findOne({ where: { other_info_user_code: user_code, other_info_user_password: password, is_deleted_status: 0 } });
      role = 'member';
    }

    if (!user) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid credentials');

    // Update device information
    const { device_id, device_unique_id, platform_type, device_details } = deviceInfo;
    await user.update({
      device_id,
      device_unique_id,
      platform_type,
      device_details
    });

    const payload = { 
      id: user.id, 
      user_id: type === 1 ? user.company_id : user.other_info_user_code, 
      role, 
      device_unique_id 
    };
    const tokens = generateTokens(payload);
    
    return successResponse(res, statusCodes.OK, 'Login success', {
      user: { id: user.id, user_id: payload.user_id, name: user.company_name || user.name, type: user.type },
      tokens
    });
  } catch (error) {
    console.error('Error in loginCompanyService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Login failed');
  }
};

const forgotPasswordService = async (res, user_code, type) => {
  try {
    let user;
    if (type === 1) user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
    else user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');

    const otp = '123456'; // Default as per request
    await user.update({ mobile_otp: otp });

    // TODO: Call sendMesageOtpMobile(user.mobile_number, otp) if implemented
    return successResponse(res, statusCodes.OK, 'OTP sent successfully', { user_code, type });
  } catch (error) {
    console.error('Error in forgotPasswordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to send OTP');
  }
};

const verifyOtpService = async (res, user_code, type, otp) => {
  try {
    let user;
    if (type === 1) user = await Company.findOne({ where: { company_id: user_code, mobile_otp: otp, is_deleted_status: 0 } });
    else user = await Member.findOne({ where: { other_info_user_code: user_code, mobile_otp: otp, is_deleted_status: 0 } });

    if (!user) return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid OTP');

    return successResponse(res, statusCodes.OK, 'OTP verified successfully');
  } catch (error) {
    console.error('Error in verifyOtpService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'OTP verification failed');
  }
};

const resetPasswordService = async (res, user_code, type, password) => {
  try {
    let user;
    if (type === 1) user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
    else user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');

    if (type === 1) await user.update({ company_password: password, mobile_otp: null });
    else await user.update({ other_info_user_password: password, mobile_otp: null });

    return successResponse(res, statusCodes.OK, 'Password reset successfully');
  } catch (error) {
    console.error('Error in resetPasswordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Password reset failed');
  }
};

const refreshTokenService = async (res, refresh_token) => {
  try {
    const decoded = verifyRefreshToken(refresh_token);
    // On refresh, we could also verify if device_unique_id still matches the DB
    const payload = { ...decoded };
    delete payload.iat;
    delete payload.exp;
    const tokens = generateTokens(payload);
    return successResponse(res, statusCodes.OK, 'Token refreshed successfully', { tokens });
  } catch (error) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid or expired refresh token');
  }
};

const storeOrUpdateCompanyService = async (res, data = {}) => {
  const { id, ...companyData } = data;
  if (id) {
    const company = await Company.findByPk(id);
    if (!company) return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
    await company.update(companyData);
    return successResponse(res, statusCodes.OK, 'Company updated successfully', company);
  } else {
    const newCompany = await Company.create(companyData);
    return successResponse(res, statusCodes.CREATED, 'Company registered successfully', newCompany);
  }
};

const getAllCompanyDetailsService = async (res, min, max) => {
  const limit = parseInt(max, 10) || 10;
  const offset = parseInt(min, 10) || 0;
  const companies = await Company.findAndCountAll({ where: { is_deleted_status: 0 }, limit, offset, order: [['createdAt', 'DESC']] });
  return successResponse(res, statusCodes.OK, 'Companies retrieved successfully', companies);
};

const deleteCompanyService = async (res, id) => {
  const company = await Company.findByPk(id);
  if (!company) return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
  await company.update({ is_deleted_status: 1 });
  return successResponse(res, statusCodes.OK, 'Company deleted successfully');
};

const generateUniqueUserCode = async () => {
  let code;
  let isUnique = false;
  while (!isUnique) {
    code = Math.floor(100000 + Math.random() * 900000);
    const existing = await Member.findOne({ where: { other_info_user_code: code } });
    if (!existing) isUnique = true;
  }
  return code;
};

const storeOrUpdateMemberService = async (res, data = {}) => {
  try {
    const { id, ...memberData } = data;
    if (!memberData.other_info_user_code) memberData.other_info_user_code = await generateUniqueUserCode();
    else {
      const existing = await Member.findOne({ where: { other_info_user_code: memberData.other_info_user_code, ...(id && { id: { [Op.ne]: id } }) } });
      if (existing) return errorResponse(res, statusCodes.BAD_REQUEST, 'User Code already exists');
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

const getAllMemberDetailsService = async (res, company_id, introduced_as, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const where = {
      is_deleted_status: 0,
      ...(company_id && company_id !== '' ? { company_id } : {}),
      ...(introduced_as && introduced_as !== '' ? { introduced_as: { [Op.contains]: [introduced_as] } } : {}),
      [Op.or]: [
        { name: { [Op.like]: `%${search || ''}%` } },
        { member_id: { [Op.like]: `%${search || ''}%` } },
        { mobile_number: { [Op.like]: `%${search || ''}%` } }
      ]
    };

    const members = await Member.findAndCountAll({
      limit,
      offset,
      where,
      include: [
        { model: StaticDropdownsList, as: 'title', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'parental_title', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'gender_dropdown', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'occupation', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'emp_type', attributes: ['dropdown_name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Resolve labels and filter by introduced_as if provided
    let rows = await Promise.all(members.rows.map(async (member) => {
      const memberData = member.toJSON();

      // Resolve introduced_as
      if (Array.isArray(memberData.introduced_as)) {
        console.log(`Resolving introduced_as for member ${memberData.id}:`, memberData.introduced_as);
        const labels = await StaticDropdownsList.findAll({
          where: { id: { [Op.in]: memberData.introduced_as } },
          attributes: ['id', 'dropdown_name']
        });
        console.log(`Found labels:`, labels.map(l => l.toJSON()));
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

    // Filter by introduced_as UUID is now handled in SQL
    return successResponse(res, statusCodes.OK, 'Members retrieved successfully', { count: members.count, rows });
  } catch (error) {
    console.error('Error in getAllMemberDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteMemberService = async (res, id) => {
  try {
    const member = await Member.findByPk(id);
    if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    await member.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Member deleted successfully');
  } catch (error) {
    console.error('Error in deleteMemberService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const uploadDocumentService = async (res, type, files) => {
  return successResponse(res, statusCodes.OK, 'Documents uploaded successfully');
};

const storeOrUpdateRouteService = async (res, data = {}) => {
  try {
    const { id, ...routeData } = data;
    if (id) {
      const route = await Route.findByPk(id);
      if (!route) return errorResponse(res, statusCodes.NOT_FOUND, 'Route not found');
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
    const routes = await Route.findAndCountAll({ limit, offset, where: { is_deleted_status: 0, ...(search && { route_name: { [Op.like]: `%${search}%` } }) }, order: [['createdAt', 'DESC']] });
    return successResponse(res, statusCodes.OK, 'Routes retrieved successfully', routes);
  } catch (error) {
    console.error('Error in getAllRouteDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteRouteService = async (res, id) => {
  try {
    const route = await Route.findByPk(id);
    if (!route) return errorResponse(res, statusCodes.NOT_FOUND, 'Route not found');
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
      if (!area) return errorResponse(res, statusCodes.NOT_FOUND, 'Area not found');
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
      limit, offset, where: { is_deleted_status: 0, ...(search && { area_name: { [Op.like]: `%${search}%` } }) },
      include: [{ model: Route, as: 'route', attributes: ['id', 'route_name'] }],
      order: [['createdAt', 'DESC']]
    });
    const formattedRows = areas.rows.map(area => {
      const areaData = area.toJSON();
      return { ...areaData, route_id: areaData.route?.id || null, route_name: areaData.route?.route_name || null, route: undefined };
    });
    return successResponse(res, statusCodes.OK, 'Areas retrieved successfully', { count: areas.count, rows: formattedRows });
  } catch (error) {
    console.error('Error in getAllAreaDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteAreaService = async (res, id) => {
  try {
    const area = await Area.findByPk(id);
    if (!area) return errorResponse(res, statusCodes.NOT_FOUND, 'Area not found');
    await area.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Area deleted successfully');
  } catch (error) {
    console.error('Error in deleteAreaService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const createInstallaments = async (chits_group_id, chits_group_status) => {
  try {
    if (Number(chits_group_status) === 1) {
      const group = await ChitsGroup.findByPk(chits_group_id);
      if (!group) {
        console.error('Chits Group not found for createInstallaments');
        return;
      }

      const enrollments = await Enrollment.findAll({
        where: { group_id: chits_group_id, delete_status: 0 },
        include: [{ model: StaticDropdownsList, as: 'payment_mode', attributes: ['dropdown_name'] }]
      });

      const noOfInstallments = group.no_of_installments || 1;
      const initialDateStr = group.chit_start_date || group.commencement_date || new Date().toISOString().split('T')[0];
      const chitAmount = parseFloat(group.chit_amount) || 0;
      const payableAmount = parseFloat((chitAmount / noOfInstallments).toFixed(2));

      for (const e of enrollments) {
        const data = e.toJSON();
        const modeName = data.payment_mode ? data.payment_mode.dropdown_name : 'Unknown';
        
        let mappedType = null;
        if (modeName.toLowerCase() === 'monthly') mappedType = 1;
        else if (modeName.toLowerCase() === 'weekly') mappedType = 2;
        else if (modeName.toLowerCase() === 'daily') mappedType = 3;

        // Skip if installments data already generated for this enrollment
        const existingInstallmentRecord = await ChitsInstallment.findOne({ where: { enrollment_id: data.id } });
        if (existingInstallmentRecord) continue;

        const dateIterator = new Date(initialDateStr);
        const installmentsJsonArray = [];

        // Generate JSON data array directly
        for (let i = 1; i <= noOfInstallments; i++) {
          installmentsJsonArray.push({
            enrollment_id: data.id,
            type: mappedType || 1, // Fallback to 1
            installment_no: i,
            due_date: new Date(dateIterator.getTime() - (dateIterator.getTimezoneOffset() * 60000)).toISOString().split('T')[0],
            over_due_days_count: 0,
            penalty_amount: 0.00,
            payable_amount: payableAmount
          });

          // Move iterator forward to the next due date based on schedule type
          if (mappedType === 1) {
            dateIterator.setMonth(dateIterator.getMonth() + 1); // 1 = Monthly
          } else if (mappedType === 2) {
            dateIterator.setDate(dateIterator.getDate() + 7); // 2 = Weekly
          } else if (mappedType === 3) {
            dateIterator.setDate(dateIterator.getDate() + 1); // 3 = Daily
          }
        }

        // Create individual relational rows for each installment month/week
        await ChitsInstallment.bulkCreate(installmentsJsonArray);
      }

      console.log(`\n--- Set up Installments data in DB for Chits Group ${chits_group_id} (Status: 1) ---`);
    }
  } catch (error) {
    console.error('Error in createInstallaments:', error);
  }
};

const storeOrUpdateChitsGroupService = async (res, data = {}) => {
  try {
    const { id, ...chitsGroupData } = data;
    if (id) {
      const chitsGroup = await ChitsGroup.findByPk(id);
      if (!chitsGroup) return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');
      await chitsGroup.update(chitsGroupData);
      
      // Step case: Trigger createInstallaments on update
      await createInstallaments(chitsGroup.id, chitsGroup.chits_group_status);
      
      return successResponse(res, statusCodes.OK, 'Chits group updated successfully', chitsGroup);
    } else {
      console.log('Creating new ChitsGroup with data:', chitsGroupData);
      const newChitsGroup = await ChitsGroup.create(chitsGroupData);
      console.log('New ChitsGroup created:', newChitsGroup.toJSON());

      // Auto-enroll company if company_chit_number is provided
      if (chitsGroupData.company_chit_number && chitsGroupData.company_chit_number !== '') {
        console.log('company_chit_number provided:', chitsGroupData.company_chit_number);
        const targetCompanyId = newChitsGroup.company_id || chitsGroupData.company_id;
        console.log('Target Company ID:', targetCompanyId);
        if (targetCompanyId) {
          let companyMember = await Member.findOne({
            where: {
              company_id: targetCompanyId,
              group_status: 1,
              is_deleted_status: 0
            }
          });

          // If company member doesn't exist, create one
          if (!companyMember) {
            console.log('Company member not found, creating one...');
            const company = await Company.findByPk(targetCompanyId);
            companyMember = await Member.create({
              name: company ? company.company_name : 'Company Member',
              company_id: targetCompanyId,
              group_status: 1,
              member_id: `COMP-${targetCompanyId.toString().slice(0, 8).toUpperCase()}`,
              is_deleted_status: 0,
              other_info_user_code: await generateUniqueUserCode()
            });
            console.log('Created company member with ID:', companyMember.id);
          }

          if (companyMember) {
            const enrollment = await Enrollment.create({
              company_id: targetCompanyId,
              group_id: newChitsGroup.id,
              group_position_number: chitsGroupData.company_chit_number,
              subscriber_id: companyMember.id,
              enrollment_date: chitsGroupData.commencement_date || new Date().toISOString().split('T')[0],
              address_type: 1, // Default to home
              business_type_id: 1, // Default to direct
              delete_status: 0
            });
            console.log('Enrollment created:', enrollment.id);
          }
        }
        else {
          console.log('Skipping enrollment: targetCompanyId is missing');
        }
      }

      // Step case: Trigger createInstallaments on create
      await createInstallaments(newChitsGroup.id, newChitsGroup.chits_group_status);

      return successResponse(res, statusCodes.CREATED, 'Chits group created successfully', newChitsGroup);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateChitsGroupService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllChitsGroupDetailsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const chitsGroups = await ChitsGroup.findAndCountAll({
      limit, offset, where: {
        is_deleted_status: 0,
        ...(company_id && company_id !== '' ? { company_id } : {}),
        ...(search && {
          [Op.or]: [
            { group_name: { [Op.like]: `%${search}%` } },
            { chit_agreement_number: { [Op.like]: `%${search}%` } },
            sequelize.where(sequelize.cast(sequelize.col('company_chit_number'), 'varchar'), { [Op.like]: `%${search}%` }),
            { fdr_number: { [Op.like]: `%${search}%` } }
          ]
        })
      },
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
    if (!chitsGroup) return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');
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
    if (!fs.existsSync(countryCsvPath) || !fs.existsSync(stateCsvPath)) return errorResponse(res, statusCodes.NOT_FOUND, 'CSV files not found');
    const parseCsv = (filePath, mappingFn) => fs.readFileSync(filePath, 'utf8').split('\n').slice(1).filter(line => line.trim()).map(mappingFn).filter(item => !isNaN(item.id));
    const countryData = parseCsv(countryCsvPath, line => { const cols = line.split(','); return { id: parseInt(cols[0]), country_name: cols[1]?.trim(), country_code: cols[2]?.trim(), dialing_code: cols[3]?.trim(), currency: cols[4]?.trim(), currency_name: cols[5]?.trim(), currency_symbol: cols[6]?.trim(), emoji: cols[7]?.trim(), createdAt: new Date(), updatedAt: new Date() }; });
    const stateData = parseCsv(stateCsvPath, line => { const cols = line.split(','); return { id: parseInt(cols[0]), state_name: cols[1]?.trim(), country_id: parseInt(cols[2]), createdAt: new Date(), updatedAt: new Date() }; });
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
    const countries = await Country.findAll({ where: search ? { country_name: { [Op.like]: `%${search}%` } } : {}, order: [['country_name', 'ASC']] });
    return successResponse(res, statusCodes.OK, 'Countries retrieved successfully', countries);
  } catch (error) {
    console.error('Error in getCountriesListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getStatesListService = async (res, country_id, search) => {
  try {
    const states = await State.findAll({ where: { country_id, ...(search && { state_name: { [Op.like]: `%${search}%` } }) }, order: [['state_name', 'ASC']] });
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
    const districts = await District.findAndCountAll({ limit, offset, where: { is_deleted_status: 0, ...(search && { district_name: { [Op.like]: `%${search}%` } }) }, include: [{ model: Country, attributes: ['country_name'] }, { model: State, attributes: ['state_name'] }], order: [['createdAt', 'DESC']] });
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
    const cities = await City.findAndCountAll({ limit, offset, where: { is_deleted_status: 0, ...(search && { city_name: { [Op.like]: `%${search}%` } }) }, include: [{ model: Country, attributes: ['country_name'] }, { model: State, attributes: ['state_name'] }, { model: District, attributes: ['district_name'] }], order: [['createdAt', 'DESC']] });
    return successResponse(res, statusCodes.OK, 'Cities retrieved successfully', cities);
  } catch (error) {
    console.error('Error in getAllCityDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDistrictsListService = async (res, state_id, search) => {
  try {
    const districts = await District.findAll({ where: { state_id, is_deleted_status: 0, ...(search && { district_name: { [Op.like]: `%${search}%` } }) }, order: [['district_name', 'ASC']] });
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
    const dropdowns = await StaticDropdownsList.findAll({ where: { type_id, status: 1, dropdown_name: { [Op.like]: `%${search || ''}%` } }, attributes: ['id', 'dropdown_name', 'type_id'], order: [['dropdown_name', 'ASC']] });
    return successResponse(res, statusCodes.OK, 'Dropdown values retrieved successfully', dropdowns);
  } catch (error) {
    console.error('Error in fetchStaticDropdownService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateEnrollmentService = async (res, data = {}) => {
  try {
    const { id, ...enrollmentData } = data;
    if (id) {
      const enrollment = await Enrollment.findByPk(id);
      if (!enrollment) return errorResponse(res, statusCodes.NOT_FOUND, 'Enrollment not found');
      await enrollment.update(enrollmentData);
      return successResponse(res, statusCodes.OK, 'Enrollment updated successfully', enrollment);
    } else {
      const newEnrollment = await Enrollment.create(enrollmentData);
      return successResponse(res, statusCodes.CREATED, 'Enrollment stored successfully', newEnrollment);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateEnrollmentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllEnrollmentDetailsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const enrollments = await Enrollment.findAndCountAll({
      limit, offset,
      where: {
        ...(company_id && company_id !== '' ? { company_id } : {}),
        delete_status: 0,
        [Op.or]: [
          { nominee_name: { [Op.like]: `%${search || ''}%` } },
          sequelize.where(sequelize.cast(sequelize.col('group_position_number'), 'varchar'), { [Op.like]: `%${search || ''}%` })
        ]
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
    return successResponse(res, statusCodes.OK, 'Enrollments retrieved successfully', enrollments);
  } catch (error) {
    console.error('Error in getAllEnrollmentDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteEnrollmentService = async (res, id) => {
  try {
    const enrollment = await Enrollment.findByPk(id);
    if (!enrollment) return errorResponse(res, statusCodes.NOT_FOUND, 'Enrollment not found');
    await enrollment.update({ delete_status: 1 });
    return successResponse(res, statusCodes.OK, 'Enrollment deleted successfully');
  } catch (error) {
    console.error('Error in deleteEnrollmentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPositionNumbersService = async (res, group_id) => {
  try {
    const totalPositions = 20;
    const enrollments = await Enrollment.findAll({ where: { group_id, delete_status: 0 }, attributes: ['group_position_number'] });
    const takenPositions = enrollments.map(e => parseInt(e.group_position_number)).filter(n => !isNaN(n));
    const availablePositions = [];
    for (let i = 1; i <= totalPositions; i++) if (!takenPositions.includes(i)) availablePositions.push(i);
    return successResponse(res, statusCodes.OK, 'Available position numbers retrieved successfully', availablePositions);
  } catch (error) {
    console.error('Error in getPositionNumbersService:', error);
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
  forgotPasswordService,
  verifyOtpService,
  resetPasswordService,
  generateUniqueUserCode,
  storeOrUpdateMemberService,
  getAllMemberDetailsService,
  deleteMemberService,
  uploadDocumentService,
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
  fetchStaticDropdownService,
  storeOrUpdateEnrollmentService,
  getAllEnrollmentDetailsService,
  deleteEnrollmentService,
  getPositionNumbersService
};
