const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Company, Member, Route, Area, ChitsGroup, Country, State, District, City, StaticDropdownsList, StaticDropdownSubcategoryList, Enrollment, ChitsInstallment, UpcomingChit, SuitFileInformation, Auction, AgentTargetEntry, GroupUnderStaticList, AccountCreationDetail, ContactUs, FAQ, TermsPrivacy, SelfChit, ConfigureBusinessAgentCommission, HistoryBusinessAgent, CollectionAgentAmount, CustomerPayment, Gallery, FixedSchemeChitsConfiguration, Role, StaffUser, AuditLog, MemberDocument, sequelize } = require('../models');
const { generateTokens, verifyRefreshToken, generateResetToken, verifyResetToken } = require('../utils/jwtHelper');
const { applyWinnerSchemeAdjustments, getSchemeWinningAmount, applyOpenAuctionAdjustments, calculateOpenAuctionFinancials } = require('../utils/schemeHelpers');
const { Op } = require('sequelize');

const resolveCompanyIdForAssociation = async (userPayload, reqBody = {}) => {
  if (reqBody && reqBody.company_id) {
    return reqBody.company_id;
  }
  return resolveCompanyIdForAuth(userPayload);
};

const resolveCompanyIdForAuth = async (userPayload) => {
  if (!userPayload) return null;

  if (userPayload.role === 'company') {
    return userPayload.id;
  }
  if (userPayload.role === 'staff') {
    return userPayload.company_id; // already embedded in the JWT, no DB lookup needed
  }
  if (userPayload.role === 'member') {
    const mem = await Member.findByPk(userPayload.id);
    return mem ? mem.company_id : null;
  }

  if (userPayload.company_id) {
    return userPayload.company_id;
  }
  if (userPayload.user_id && userPayload.user_id.length > 20) {
    return userPayload.user_id;
  }
  return null;
};

const loginAdminService = async (res, email, password) => {
  if (email === 'superadmin@gmail.com' && password === 'superadmin@123') {
    const user = { email: 'superadmin@gmail.com', role: 'superadmin', company_id: null };
    const tokens = generateTokens(user);
    return successResponse(res, statusCodes.OK, 'Login success', { user, tokens });
  }
  return errorResponse(res, statusCodes.NOT_FOUND, 'Invalid email or password');
};

const loginCompanyService = async (res, user_code, password, type, deviceInfo = {}) => {
  try {
    let user;
    let role;
    if (type === 1) {
      user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
      role = 'company';

      if (user && !(await bcrypt.compare(password, user.company_password))) {
        user = null;
      }

      if (!user) {
        const staffUser = await StaffUser.findOne({ where: { user_code, is_deleted_status: 0 } });
        if (staffUser && (await bcrypt.compare(password, staffUser.password))) {
          if (!staffUser.is_active) {
            return errorResponse(res, statusCodes.FORBIDDEN, "You don't have access to login");
          }
          user = staffUser;
          role = 'staff';
        }
      }
    } else if (type === 2) {
      user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });
      if (user && (await bcrypt.compare(password, user.other_info_user_password))) {
        if (!user.is_verified) {
          return errorResponse(res, statusCodes.BAD_REQUEST, 'Admin will review your account, please wait.');
        }
        role = 'member';
      } else {
        user = null;
      }
    }

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'Invalid credentials');

    // Update device information
    const { device_id, device_unique_id, platform_type, device_details } = deviceInfo;
    await user.update({
      device_id,
      device_unique_id,
      platform_type,
      device_details
    });

    let staffPermissions = null;
    if (role === 'staff') {
      const staffRole = await Role.findByPk(user.role_id);
      staffPermissions = staffRole?.permissions || {};
    }

    const payload = {
      id: user.id,
      user_id: type === 1 ? (role === 'company' ? user.company_id : user.user_code) : user.other_info_user_code,
      role,
      company_id: role !== 'company' ? user.company_id : undefined,
      permissions: role === 'staff' ? staffPermissions : undefined,
      device_unique_id
    };
    const tokens = generateTokens(payload);

    let introduced_as_details = [];
    if (type === 2 && user.introduced_as) {
      let intIds = [];
      if (Array.isArray(user.introduced_as)) {
        intIds = user.introduced_as.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      } else if (typeof user.introduced_as === 'string') {
        try {
          intIds = JSON.parse(user.introduced_as).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } catch (e) {
          intIds = [parseInt(user.introduced_as, 10)].filter(id => !isNaN(id));
        }
      } else {
        intIds = [parseInt(user.introduced_as, 10)].filter(id => !isNaN(id));
      }

      if (intIds.length > 0) {
        const introducers = await StaticDropdownsList.findAll({
          where: { id: { [Op.in]: intIds } },
          attributes: ['id', 'dropdown_name']
        });
        introduced_as_details = introducers.map(ind => ({
          id: ind.id,
          name: ind.dropdown_name
        }));
      }
    }

    return successResponse(res, statusCodes.OK, 'Login success', {
      user: {
        id: user.id,
        user_id: payload.user_id,
        company_id: type === 1 ? (role === 'company' ? user.id : user.company_id) : user.company_id,
        name: user.company_name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.name),
        type: user.type,
        role: role,
        is_favorites: user.is_favorites || [],
        introduced_as: introduced_as_details
      },
      tokens
    });
  } catch (error) {
    console.error('Error in loginCompanyService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Login failed');
  }
};

const forgotPasswordService = async (res, user_code, type) => {
  try {
    let user, role;
    if (type === 1) {
      user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
      role = 'company';
      if (!user) {
        user = await StaffUser.findOne({ where: { user_code, is_deleted_status: 0 } });
        role = 'staff';
      }
    } else {
      user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });
      role = 'member';
    }

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');

    const otp = '123456'; // Default as per request
    const expiresAt = new Date(Date.now() + 15 * 60000);

    if (role === 'staff') {
      await user.update({ otp, otp_expires_at: expiresAt, otp_attempts: 0 });
    } else {
      await user.update({ mobile_otp: otp, mobile_otp_expires_at: expiresAt, mobile_otp_attempts: 0 });
    }

    // TODO: Call sendMesageOtpMobile(user.mobile_number, otp) if implemented
    return successResponse(res, statusCodes.OK, 'OTP sent successfully', { user_code, type });
  } catch (error) {
    console.error('Error in forgotPasswordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to send OTP');
  }
};

const verifyOtpService = async (res, user_code, type, otp) => {
  try {
    let user, role;
    if (type === 1) {
      user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
      role = 'company';
      if (!user) {
        user = await StaffUser.findOne({ where: { user_code, is_deleted_status: 0 } });
        role = 'staff';
      }
    } else {
      user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });
      role = 'member';
    }

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');

    const maxAttempts = 3;
    const now = new Date();
    
    let dbOtp, dbExpiresAt, dbAttempts;
    if (role === 'staff') {
      dbOtp = user.otp;
      dbExpiresAt = user.otp_expires_at;
      dbAttempts = user.otp_attempts || 0;
    } else {
      dbOtp = user.mobile_otp;
      dbExpiresAt = user.mobile_otp_expires_at;
      dbAttempts = user.mobile_otp_attempts || 0;
    }

    if (dbAttempts >= maxAttempts) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Maximum OTP attempts exceeded');
    }

    if (dbExpiresAt && now > new Date(dbExpiresAt)) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'OTP has expired');
    }

    if (String(dbOtp) !== String(otp)) {
      if (role === 'staff') {
        await user.update({ otp_attempts: dbAttempts + 1 });
      } else {
        await user.update({ mobile_otp_attempts: dbAttempts + 1 });
      }
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid OTP');
    }

    if (role === 'staff') {
      await user.update({ otp: null, otp_expires_at: null, otp_attempts: 0 });
    } else {
      await user.update({ mobile_otp: null, mobile_otp_expires_at: null, mobile_otp_attempts: 0 });
    }

    const resetToken = generateResetToken({ user_code, type });

    return successResponse(res, statusCodes.OK, 'OTP verified successfully', { reset_token: resetToken });
  } catch (error) {
    console.error('Error in verifyOtpService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'OTP verification failed');
  }
};

const resetPasswordService = async (res, user_code, type, password, reset_token) => {
  try {
    let decoded;
    try {
      decoded = verifyResetToken(reset_token);
    } catch (err) {
      return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid or expired reset token');
    }

    user_code = decoded.user_code;
    type = decoded.type;

    let user, role;
    if (type === 1) {
      user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
      role = 'company';
      if (!user) {
        user = await StaffUser.findOne({ where: { user_code, is_deleted_status: 0 } });
        role = 'staff';
      }
    } else {
      user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });
      role = 'member';
    }

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');

    const hashedPassword = await bcrypt.hash(password, 10);

    if (role === 'company') await user.update({ company_password: hashedPassword, mobile_otp: null });
    else if (role === 'staff') await user.update({ password: hashedPassword, otp: null });
    else await user.update({ other_info_user_password: hashedPassword, mobile_otp: null });

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
    delete companyData.company_id; // prevent updating generated field
    await company.update(companyData);
    return successResponse(res, statusCodes.OK, 'Company updated successfully', company);
  } else {
    delete companyData.company_id; // model hook will handle creation
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

const generateUniqueMemberId = async () => {
  let memberId;
  let isUnique = false;
  while (!isUnique) {
    memberId = 'MEM' + Math.floor(100000 + Math.random() * 900000);
    const existing = await Member.findOne({ where: { member_id: memberId } });
    if (!existing) isUnique = true;
  }
  return memberId;
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
      // Prevent updating generated fields during edit
      delete memberData.member_id;
      delete memberData.other_info_user_code;

      await member.update(memberData);
      return successResponse(res, statusCodes.OK, 'Member updated successfully', member);
    } else {
      // Create new
      if (!memberData.member_id) {
        memberData.member_id = await generateUniqueMemberId();
      } else {
        const existing = await Member.findOne({ where: { member_id: memberData.member_id } });
        if (existing) return errorResponse(res, statusCodes.BAD_REQUEST, 'Member ID already exists');
      }

      if (!memberData.other_info_user_code) {
        memberData.other_info_user_code = await generateUniqueUserCode();
      } else {
        const existing = await Member.findOne({ where: { other_info_user_code: memberData.other_info_user_code } });
        if (existing) return errorResponse(res, statusCodes.BAD_REQUEST, 'User Code already exists');
      }

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
      attributes: { exclude: ['verification_otp', 'verification_otp_expires_at', 'verification_otp_attempts', 'other_info_user_password'] },
      include: [
        { model: StaticDropdownsList, as: 'title', attributes: ['dropdown_name'] },
        { model: StaticDropdownSubcategoryList, as: 'parental_title', attributes: ['subcategory_name'] },
        { model: StaticDropdownsList, as: 'gender_dropdown', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'occupation', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'emp_type', attributes: ['dropdown_name'] },
        { model: StaticDropdownSubcategoryList, as: 'business_type_details', attributes: ['subcategory_name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Resolve labels and filter by introduced_as if provided
    let rows = await Promise.all(members.rows.map(async (member) => {
      const memberData = member.toJSON();

      // Resolve introduced_as
      if (Array.isArray(memberData.introduced_as)) {
        const intIds = memberData.introduced_as.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (intIds.length > 0) {
          const labels = await StaticDropdownsList.findAll({
            where: { id: { [Op.in]: intIds } },
            attributes: ['id', 'dropdown_name']
          });
          memberData.introduced_as_dropdown = labels;
        } else {
          memberData.introduced_as_dropdown = [];
        }
      }

      // Resolve other_info_kyc_details
      if (Array.isArray(memberData.other_info_kyc_details)) {
        const intIds = memberData.other_info_kyc_details.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (intIds.length > 0) {
          const labels = await StaticDropdownsList.findAll({
            where: { id: { [Op.in]: intIds } },
            attributes: ['id', 'dropdown_name']
          });
          memberData.kyc_type = labels;
        } else {
          memberData.kyc_type = [];
        }
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

const deleteMemberService = async (res, id, companyId) => {
  try {
    const member = await Member.findOne({ where: { id, company_id: companyId } });
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

const storeOrUpdateRouteService = async (res, comp_id, data = {}) => {
  try {
    const { id, ...routeData } = data;
    if (comp_id) routeData.company_id = comp_id;
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

const getAllRouteDetailsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && { route_name: { [Op.like]: `%${search}%` } })
    };
    const routes = await Route.findAndCountAll({ limit, offset, where, order: [['createdAt', 'DESC']] });
    return successResponse(res, statusCodes.OK, 'Routes retrieved successfully', routes);
  } catch (error) {
    console.error('Error in getAllRouteDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteRouteService = async (res, id, companyId) => {
  try {
    const route = await Route.findOne({ where: { id, company_id: companyId } });
    if (!route) return errorResponse(res, statusCodes.NOT_FOUND, 'Route not found');
    await route.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Route deleted successfully');
  } catch (error) {
    console.error('Error in deleteRouteService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAreaService = async (res, comp_id, data = {}) => {
  try {
    const { id, ...areaData } = data;
    if (comp_id) areaData.company_id = comp_id;
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

const getAllAreaDetailsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && { area_name: { [Op.like]: `%${search}%` } })
    };
    const areas = await Area.findAndCountAll({
      limit, offset, where,
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

const deleteAreaService = async (res, id, companyId) => {
  try {
    const area = await Area.findOne({ where: { id, company_id: companyId } });
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

      const schemeConfig = group.scheme_configuration_id
        ? await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id)
        : null;

      const pricesArray = schemeConfig && schemeConfig.prices
        ? (typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices)
        : [];

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

        const dueDayOfMonth = group.due_date_number_count;
        const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        
        const dateIterator = new Date(initialDateStr);
        
        if (mappedType === 1 || !mappedType) { // Monthly (default)
          dateIterator.setMonth(dateIterator.getMonth() + 1);
          if (dueDayOfMonth && dueDayOfMonth >= 1 && dueDayOfMonth <= 31) {
            dateIterator.setDate(Math.min(dueDayOfMonth, daysInMonth(dateIterator)));
          }
        } else if (mappedType === 2) { // Weekly
          dateIterator.setDate(dateIterator.getDate() + 7);
        } else if (mappedType === 3) { // Daily
          dateIterator.setDate(dateIterator.getDate() + 1);
        }

        const installmentsJsonArray = [];

        // Generate JSON data array directly
        for (let i = 1; i <= noOfInstallments; i++) {
          let currentPayableAmount = payableAmount; // fallback flat amount

          if (schemeConfig) {
            if (schemeConfig.scheme_type === 65 || schemeConfig.scheme_type === 64) {
              const row = pricesArray[i - 1];
              currentPayableAmount = parseFloat(row?.installment) || 0;
            } else if (schemeConfig.scheme_type === 62) {
              const row = pricesArray[i - 1];
              currentPayableAmount = parseFloat(row?.not_withdrawn) || 0;
            } else if (schemeConfig.scheme_type === 63) {
              currentPayableAmount = parseFloat(schemeConfig.installment) || 0;
            }
          }

          installmentsJsonArray.push({
            enrollment_id: data.id,
            group_id: chits_group_id,
            type: mappedType || 1, // Fallback to 1
            installment_no: i,
            due_date: new Date(dateIterator.getTime() - (dateIterator.getTimezoneOffset() * 60000)).toISOString().split('T')[0],
            over_due_days_count: 0,
            penalty_amount: 0.00,
            payable_amount: currentPayableAmount
          });

          // Move iterator forward to the next due date based on schedule type
          if (mappedType === 1 || !mappedType) {
            dateIterator.setMonth(dateIterator.getMonth() + 1); // 1 = Monthly
            if (dueDayOfMonth && dueDayOfMonth >= 1 && dueDayOfMonth <= 31) {
              dateIterator.setDate(Math.min(dueDayOfMonth, daysInMonth(dateIterator)));
            }
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
      if (chitsGroupData.chits_group_status !== undefined && Number(chitsGroupData.chits_group_status) === 1 && chitsGroup.chits_group_status !== 1) {
        const enrollmentsCount = await Enrollment.count({ where: { group_id: id, delete_status: 0 } });
        const totalTaken = enrollmentsCount;
        const requiredPositions = parseInt(chitsGroup.no_of_installments) || 0;

        if (totalTaken < requiredPositions) {
          return errorResponse(res, statusCodes.BAD_REQUEST, `Cannot start group. All positions must be filled (${totalTaken}/${requiredPositions} filled).`);
        }
      }

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

            const selfChit = await SelfChit.create({
              company_id: targetCompanyId,
              group_id: newChitsGroup.id,
              subscriber_id: companyMember.id,
              slot_id: chitsGroupData.company_chit_number,
              is_deleted_status: 0
            });
            console.log('SelfChit created:', selfChit.id);
          }
        }
        else {
          console.log('Skipping enrollment: targetCompanyId is missing');
        }
      }

      // Step case: Trigger createInstallaments on create
      await createInstallaments(newChitsGroup.id, newChitsGroup.chits_group_status);

      // Trigger FCM Notification for Marketing (New Group)
      try {
        const allMembers = await Member.findAll({ where: { company_id: newChitsGroup.company_id || chitsGroupData.company_id, is_deleted_status: 0, fcm_token: { [Op.ne]: null } } });
        if (allMembers.length > 0) {
          fcmService.sendPushToMulticast(allMembers, newChitsGroup.company_id || chitsGroupData.company_id, 'New Chit Group Launched!', `We have launched a new Chit Group: ${newChitsGroup.chit_group_name}. Enroll now!`, { type: 'MARKETING_NEW_GROUP', group_id: String(newChitsGroup.id) });
        }
      } catch (pushErr) {
        console.error('Error sending FCM push for new group marketing:', pushErr);
      }

      return successResponse(res, statusCodes.CREATED, 'Chits group created successfully', newChitsGroup);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateChitsGroupService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllChitsGroupDetailsService = async (res, company_id, min, max, search, enrollment_status) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const chitsGroups = await ChitsGroup.findAndCountAll({
      limit, offset, where: {
        is_deleted_status: 0,
        
        ...(enrollment_status === 1 ? { is_chit_full_status: 0 } : {}),
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

    const rowsWithCounts = await Promise.all(chitsGroups.rows.map(async (group) => {
      const groupData = group.toJSON();
      const enrollmentsCount = await Enrollment.count({ where: { group_id: groupData.id, delete_status: 0 } });
      groupData.slot_filled_count = enrollmentsCount;
      return groupData;
    }));

    return successResponse(res, statusCodes.OK, 'Chits groups retrieved successfully', {
      count: chitsGroups.count,
      rows: rowsWithCounts
    });
  } catch (error) {
    console.error('Error in getAllChitsGroupDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteChitsGroupService = async (res, id, companyId) => {
  try {
    const chitsGroup = await ChitsGroup.findOne({ where: { id, company_id: companyId } });
    if (!chitsGroup) return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');
    await chitsGroup.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Chits group deleted successfully');
  } catch (error) {
    console.error('Error in deleteChitsGroupService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const updateChitsGroupStatusService = async (res, id, chits_group_status) => {
  try {
    const chitsGroup = await ChitsGroup.findByPk(id);
    if (!chitsGroup) return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');

    const updateData = {};
    if (chits_group_status !== undefined && chits_group_status !== null) {
      if (Number(chits_group_status) === 1 && chitsGroup.chits_group_status !== 1) {
        const enrollmentsCount = await Enrollment.count({ where: { group_id: id, delete_status: 0 } });
        const selfChitsCount = await SelfChit.count({ where: { group_id: id, is_deleted_status: 0 } });
        const totalTaken = enrollmentsCount + selfChitsCount;
        const requiredPositions = parseInt(chitsGroup.no_of_installments) || 0;

        if (totalTaken < requiredPositions) {
          return errorResponse(res, statusCodes.BAD_REQUEST, `Cannot start group. All positions must be filled (${totalTaken}/${requiredPositions} filled).`);
        }
      }
      updateData.chits_group_status = chits_group_status;
    }

    await chitsGroup.update(updateData);

    if (updateData.chits_group_status !== undefined) {
      await createInstallaments(chitsGroup.id, updateData.chits_group_status);

      // Trigger FCM Notifications
      try {
        const enrollments = await Enrollment.findAll({
          where: { group_id: chitsGroup.id, delete_status: 0, company_id: chitsGroup.company_id },
          include: [{ model: Member, as: 'subscriber', where: { is_deleted_status: 0, fcm_token: { [Op.ne]: null } }, required: true }]
        });
        const members = enrollments.map(e => e.subscriber);

        if (members.length > 0) {
          if (Number(updateData.chits_group_status) === 1) {
            fcmService.sendPushToMulticast(members, chitsGroup.company_id, 'Chit Group Commenced!', `The Chit Group ${chitsGroup.chit_group_name} has officially commenced.`, { type: 'GROUP_STARTED', group_id: String(chitsGroup.id) });
          } else if (Number(updateData.chits_group_status) === 2) {
            fcmService.sendPushToMulticast(members, chitsGroup.company_id, 'Chit Group Completed', `Congratulations! The Chit Group ${chitsGroup.chit_group_name} has successfully completed its term.`, { type: 'GROUP_COMPLETED', group_id: String(chitsGroup.id) });
          }
        }
      } catch (pushErr) {
        console.error('Error sending FCM push for group status:', pushErr);
      }
    }

    return successResponse(res, statusCodes.OK, 'Chits group status updated successfully', chitsGroup);
  } catch (error) {
    console.error('Error in updateChitsGroupStatusService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const checkChitsGroupCapacityService = async (res, id) => {
  try {
    const chitsGroup = await ChitsGroup.findByPk(id, { attributes: ['id', 'no_of_installments', 'group_name', 'chits_group_status'] });
    if (!chitsGroup) return errorResponse(res, statusCodes.NOT_FOUND, 'Chits group not found');

    const enrollmentsCount = await Enrollment.count({ where: { group_id: id, delete_status: 0 } });
    const selfChitsCount = await SelfChit.count({ where: { group_id: id, is_deleted_status: 0 } });

    const totalTaken = enrollmentsCount + selfChitsCount;
    const requiredPositions = parseInt(chitsGroup.no_of_installments) || 0;
    const isFull = totalTaken >= requiredPositions;

    return successResponse(res, statusCodes.OK, 'Group capacity retrieved successfully', {
      group_id: chitsGroup.id,
      group_name: chitsGroup.group_name,
      status: chitsGroup.chits_group_status,
      total_taken: totalTaken,
      required_positions: requiredPositions,
      is_full: isFull,
      remaining_positions: Math.max(0, requiredPositions - totalTaken)
    });
  } catch (error) {
    console.error('Error in checkChitsGroupCapacityService:', error);
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

const storeOrUpdateDistrictService = async (res, comp_id, data = {}) => {
  try {
    const { id, ...districtData } = data;
    if (comp_id) districtData.company_id = comp_id;
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

const getAllDistrictDetailsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && { district_name: { [Op.like]: `%${search}%` } })
    };
    const districts = await District.findAndCountAll({ limit, offset, where, include: [{ model: Country, attributes: ['country_name'] }, { model: State, attributes: ['state_name'] }], order: [['createdAt', 'DESC']] });
    return successResponse(res, statusCodes.OK, 'Districts retrieved successfully', districts);
  } catch (error) {
    console.error('Error in getAllDistrictDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateCityService = async (res, comp_id, data = {}) => {
  try {
    const { id, ...cityData } = data;
    if (comp_id) cityData.company_id = comp_id;
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

const getAllCityDetailsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && { city_name: { [Op.like]: `%${search}%` } })
    };
    const cities = await City.findAndCountAll({ limit, offset, where, include: [{ model: Country, attributes: ['country_name'] }, { model: State, attributes: ['state_name'] }, { model: District, attributes: ['district_name'] }], order: [['createdAt', 'DESC']] });
    return successResponse(res, statusCodes.OK, 'Cities retrieved successfully', cities);
  } catch (error) {
    console.error('Error in getAllCityDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDistrictsListService = async (res, company_id, state_id, search) => {
  try {
    const where = {
      state_id,
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && { district_name: { [Op.like]: `%${search}%` } })
    };
    const districts = await District.findAll({ where, order: [['district_name', 'ASC']] });
    return successResponse(res, statusCodes.OK, 'Districts retrieved successfully', districts);
  } catch (error) {
    console.error('Error in getDistrictsListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteCityService = async (res, id, companyId) => {
  try {
    const city = await City.findOne({ where: { id, company_id: companyId } });
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
    const dropdowns = await StaticDropdownsList.findAll({ where: { type_id, status: 1, dropdown_name: { [Op.like]: `%${search || ''}%` } }, attributes: ['id', 'dropdown_name', 'type_id', 'is_default'], order: [['dropdown_name', 'ASC']] });
    return successResponse(res, statusCodes.OK, 'Dropdown values retrieved successfully', dropdowns);
  } catch (error) {
    console.error('Error in fetchStaticDropdownService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const checkAndUpdateChitFullStatus = async (group_id) => {
  try {
    const chitsGroup = await ChitsGroup.findByPk(group_id);
    if (!chitsGroup) return;

    const totalPositions = chitsGroup.no_of_installments || 20;

    const enrollments = await Enrollment.findAll({ where: { group_id, delete_status: 0 }, attributes: ['group_position_number'] });
    const takenFromEnrollments = enrollments.map(e => parseInt(e.group_position_number)).filter(n => !isNaN(n));

    const selfChits = await SelfChit.findAll({ where: { group_id, is_deleted_status: 0 }, attributes: ['slot_id'] });
    const takenFromSelfChits = selfChits.map(s => parseInt(s.slot_id)).filter(n => !isNaN(n));

    const takenPositions = [...new Set([...takenFromEnrollments, ...takenFromSelfChits])];

    let is_chit_full_status = 0;
    if (takenPositions.length >= totalPositions) {
      is_chit_full_status = 1;
    }
    await chitsGroup.update({ is_chit_full_status });
  } catch (error) {
    console.error('Error in checkAndUpdateChitFullStatus:', error);
  }
};

const storeOrUpdateEnrollmentService = async (res, data = {}) => {
  try {
    const { id, ...enrollmentData } = data;
    if (id) {
      const enrollment = await Enrollment.findByPk(id);
      if (!enrollment) return errorResponse(res, statusCodes.NOT_FOUND, 'Enrollment not found');
      await enrollment.update(enrollmentData);
      await checkAndUpdateChitFullStatus(enrollment.group_id);
      return successResponse(res, statusCodes.OK, 'Enrollment updated successfully', enrollment);
    } else {
      const subscriber = await Member.findByPk(enrollmentData.subscriber_id);
      if (!subscriber || !subscriber.is_verified) {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Subscriber must be verified before enrollment');
      }
      const newEnrollment = await Enrollment.create(enrollmentData);
      await checkAndUpdateChitFullStatus(newEnrollment.group_id);

      // Send push notification
      const chitGroup = await ChitsGroup.findByPk(newEnrollment.group_id);
      if (subscriber && chitGroup) {
        fcmService.sendPushToMember(subscriber, 'Enrolled Successfully', `You have been successfully enrolled in Chit Group: ${chitGroup.chit_group_name}`, { type: 'ENROLLMENT', group_id: String(newEnrollment.group_id) });
      }

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

const deleteEnrollmentService = async (res, id, companyId) => {
  try {
    const enrollment = await Enrollment.findOne({ where: { id, company_id: companyId } });
    if (!enrollment) return errorResponse(res, statusCodes.NOT_FOUND, 'Enrollment not found');
    await enrollment.update({ delete_status: 1 });
    await checkAndUpdateChitFullStatus(enrollment.group_id);
    return successResponse(res, statusCodes.OK, 'Enrollment deleted successfully');
  } catch (error) {
    console.error('Error in deleteEnrollmentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPositionNumbersService = async (res, group_id) => {
  try {
    const group = await ChitsGroup.findByPk(group_id, { attributes: ['no_of_installments'] });
    if (!group) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Group not found');
    }

    // Dynamically use the number of installments as the total available positions
    const totalPositions = group.no_of_installments ? parseInt(group.no_of_installments) : 20;

    const enrollments = await Enrollment.findAll({ where: { group_id, delete_status: 0 }, attributes: ['group_position_number'] });
    const takenFromEnrollments = enrollments.map(e => parseInt(e.group_position_number)).filter(n => !isNaN(n));

    const selfChits = await SelfChit.findAll({ where: { group_id, is_deleted_status: 0 }, attributes: ['slot_id'] });
    const takenFromSelfChits = selfChits.map(s => parseInt(s.slot_id)).filter(n => !isNaN(n));

    const takenPositions = [...new Set([...takenFromEnrollments, ...takenFromSelfChits])];

    const availablePositions = [];
    for (let i = 1; i <= totalPositions; i++) {
      if (!takenPositions.includes(i)) availablePositions.push(i);
    }

    return successResponse(res, statusCodes.OK, 'Available position numbers retrieved successfully', availablePositions);
  } catch (error) {
    console.error('Error in getPositionNumbersService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateUpcomingChitService = async (res, data = {}) => {
  try {
    const { id, ...upcomingChitData } = data;
    if (id) {
      const upcomingChit = await UpcomingChit.findByPk(id);
      if (!upcomingChit) return errorResponse(res, statusCodes.NOT_FOUND, 'Upcoming chit not found');
      await upcomingChit.update(upcomingChitData);
      return successResponse(res, statusCodes.OK, 'Upcoming chit updated successfully', upcomingChit);
    } else {
      const newUpcomingChit = await UpcomingChit.create(upcomingChitData);
      return successResponse(res, statusCodes.CREATED, 'Upcoming chit created successfully', newUpcomingChit);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateUpcomingChitService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllUpcomingChitsService = async (res, company_id, status, chit_date, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const where = {
      ...(company_id && company_id !== '' && { company_id }),
      ...(status !== undefined && status !== null && status !== '' && { status })
    };

    if (chit_date && chit_date !== '' && chit_date !== null) {
      where.chit_date = chit_date;
    }

    if (search && search.trim() !== '') {
      where[Op.or] = [
        { group_name: { [Op.like]: `%${search}%` } },
        { remarks: { [Op.like]: `%${search}%` } }
      ];
    }

    const upcomingChits = await UpcomingChit.findAndCountAll({
      where,
      limit,
      offset,
      order: [['chit_date', 'ASC']]
    });
    return successResponse(res, statusCodes.OK, 'Upcoming chits retrieved successfully', upcomingChits);
  } catch (error) {
    console.error('Error in getAllUpcomingChitsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteUpcomingChitService = async (res, id, companyId) => {
  try {
    const upcomingChit = await UpcomingChit.findOne({ where: { id, company_id: companyId } });
    if (!upcomingChit) return errorResponse(res, statusCodes.NOT_FOUND, 'Upcoming chit not found');
    await upcomingChit.destroy();
    return successResponse(res, statusCodes.OK, 'Upcoming chit deleted successfully');
  } catch (error) {
    console.error('Error in deleteUpcomingChitService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const updateFavoritesService = async (res, user_id, type, is_favorites_input) => {
  try {
    let user;
    const typeNum = Number(type);

    if (typeNum === 1) {
      user = await Company.findOne({ where: { id: user_id, is_deleted_status: 0 } });
    } else if (typeNum === 2) {
      if (!isNaN(user_id) && !user_id.toString().includes('-')) {
        user = await Member.findOne({ where: { id: parseInt(user_id, 10), is_deleted_status: 0 } });
      } else {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid ID format for Member type. Member IDs are Integers.');
      }
    }

    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');

    // Get current favorites and ensure it's an array
    let currentFavorites = user.is_favorites || [];
    if (typeof currentFavorites === 'string') {
      try {
        currentFavorites = JSON.parse(currentFavorites);
      } catch (e) {
        currentFavorites = [];
      }
    }
    if (!Array.isArray(currentFavorites)) currentFavorites = [];

    // Convert input to array if it's a string
    let incomingItems = Array.isArray(is_favorites_input) ? is_favorites_input : [is_favorites_input];

    // Toggle Logic: Remove if exists, Add if not exists
    let updatedFavorites = [...currentFavorites];
    incomingItems.forEach(item => {
      if (item && typeof item === 'string') {
        const index = updatedFavorites.indexOf(item);
        if (index > -1) {
          // Item exists, so remove it
          updatedFavorites.splice(index, 1);
        } else {
          // Item doesn't exist, so add it
          updatedFavorites.push(item);
        }
      }
    });

    await user.update({ is_favorites: updatedFavorites });
    return successResponse(res, statusCodes.OK, 'Favorites updated successfully', { is_favorites: updatedFavorites });
  } catch (error) {
    console.error('Error in updateFavoritesService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to update favorites');
  }
};

const getGroupMembersService = async (res, company_id, group_id, min, max, filter_unwon = false) => {
  try {
    const limit = parseInt(max, 10) || 200;
    const offset = parseInt(min, 10) || 0;

    const whereClause = { group_id, delete_status: 0 };
    if (company_id && company_id !== '') {
      whereClause.company_id = company_id;
    }

    const { count, rows: enrollments } = await Enrollment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Member,
          as: 'subscriber',
          attributes: ['id', 'name']
        }
      ],
      limit,
      offset,
      order: [['group_position_number', 'ASC']]
    });

    const auctions = await Auction.findAll({
      where: { group_id },
      attributes: ['bidder_id', 'auction_number']
    });

    let members = enrollments.map(e => {
      const memberId = e.subscriber ? e.subscriber.id : null;
      const winData = auctions.find(a => a.bidder_id === memberId);
      return {
        id: memberId,
        enrollment_id: e.id,
        name: e.subscriber ? e.subscriber.name : null,
        position: e.group_position_number,
        has_won: !!winData,
        won_month: winData ? parseInt(winData.auction_number, 10) : null
      };
    });

    if (filter_unwon) {
      members = members.filter(m => !m.has_won);
    }

    return successResponse(res, statusCodes.OK, 'Group members retrieved successfully', { count: filter_unwon ? members.length : count, rows: members });
  } catch (error) {
    console.error('Error in getGroupMembersService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to fetch group members');
  }
};

const getInstallmentsByGroupService = async (res, group_id, enrollment_id, member_id, min, max) => {
  try {
    const limit = parseInt(max, 10) || 100;
    const offset = parseInt(min, 10) || 0;

    let enrollmentWhere = { group_id, delete_status: 0 };
    if (enrollment_id) { enrollmentWhere.id = enrollment_id; }
    if (member_id) { enrollmentWhere.subscriber_id = member_id; }
    if (member_id) { enrollmentWhere.subscriber_id = member_id; }

    const enrollments = await Enrollment.findAll({
      where: enrollmentWhere,
      attributes: ['id']
    });

    const enrollmentIds = enrollments.map(e => e.id);

    if (enrollmentIds.length === 0) {
      return successResponse(res, statusCodes.OK, 'Installments retrieved successfully', { count: 0, rows: [] });
    }

    const { count, rows: installments } = await ChitsInstallment.findAndCountAll({
      where: { enrollment_id: { [Op.in]: enrollmentIds } },
      include: [
        {
          model: Enrollment,
          as: 'enrollment',
          include: [
            {
              model: Member,
              as: 'subscriber',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: CustomerPayment,
          as: 'payments',
          where: { payment_status: 1 },
          required: false // LEFT JOIN
        }
      ],
      limit,
      offset,
      order: [
        ['installment_no', 'ASC'],
        [{ model: Enrollment, as: 'enrollment' }, 'group_position_number', 'ASC']
      ]
    });

    const rows = installments.map(inst => {
      const paidSoFar = inst.payments ? inst.payments.reduce((sum, p) => sum + parseFloat(p.received_amount || 0), 0) : 0;
      const dueAmount = Math.max(0, parseFloat(inst.payable_amount || 0) - paidSoFar);
      return {
        id: inst.id,
        enrollment_id: inst.enrollment_id,
        subscriber: inst.enrollment && inst.enrollment.subscriber ? inst.enrollment.subscriber : null,
        group_position_number: inst.enrollment ? inst.enrollment.group_position_number : null,
        installment_no: inst.installment_no,
        due_date: inst.due_date,
        payable_amount: inst.payable_amount,
        penalty_amount: inst.penalty_amount,
        is_paid: dueAmount <= 0,
        paid_amount: paidSoFar.toFixed(2),
        due_amount: dueAmount.toFixed(2),
        payment_date: inst.payments && inst.payments.length > 0 ? inst.payments[inst.payments.length - 1].payment_date : null
      };
    });

    const groupInfo = await ChitsGroup.findByPk(group_id, {
      attributes: ['id', 'group_name', 'chit_amount', 'chits_group_status', 'chit_start_date', 'chit_end_date', 'no_of_installments']
    });
    let group_details = null;
    if (groupInfo) {
      const enrollmentsCount = await Enrollment.count({ where: { group_id, delete_status: 0 } });
      group_details = {
        ...groupInfo.toJSON(),
        slot_filled_count: enrollmentsCount
      };
    }
    return successResponse(res, statusCodes.OK, 'Installments retrieved successfully', { count, rows, group_details });
  } catch (error) {
    console.error('Error in getInstallmentsByGroupService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to fetch installments');
  }
};

const storeOrUpdateSuitFileInformationService = async (res, data = {}) => {
  try {
    const { id, ...suitData } = data;
    if (id) {
      const suitInfo = await SuitFileInformation.findByPk(id);
      if (!suitInfo) return errorResponse(res, statusCodes.NOT_FOUND, 'Suit File Information not found');
      await suitInfo.update(suitData);
      return successResponse(res, statusCodes.OK, 'Suit File Information updated successfully', suitInfo);
    } else {
      const newSuitInfo = await SuitFileInformation.create(suitData);
      return successResponse(res, statusCodes.CREATED, 'Suit File Information created successfully', newSuitInfo);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateSuitFileInformationService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllSuitFileInformationService = async (res, company_id, group_id, subscriber_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const where = {
      ...(company_id && company_id !== '' && { company_id }),
      ...(group_id && group_id !== '' && { group_id }),
      ...(subscriber_id && subscriber_id !== '' && { subscriber_id })
    };

    if (search && search.trim() !== '') {
      where[Op.or] = [
        { '$group.group_name$': { [Op.like]: `%${search}%` } },
        { '$subscriber.name$': { [Op.like]: `%${search}%` } },
        { '$subscriber.member_id$': { [Op.like]: `%${search}%` } },
        { advocate_name: { [Op.like]: `%${search}%` } },
        { court_name: { [Op.like]: `%${search}%` } },
        { suit_no: { [Op.like]: `%${search}%` } }
      ];
    }

    const suitInfos = await SuitFileInformation.findAndCountAll({
      limit,
      offset,
      where,
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['group_name'] },
        { model: Member, as: 'subscriber', attributes: ['name', 'member_id'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const formattedData = {
      total_count: suitInfos.count,
      rows: suitInfos.rows
    };

    return successResponse(res, statusCodes.OK, 'Suit File Information retrieved successfully', formattedData);
  } catch (error) {
    console.error('Error in getAllSuitFileInformationService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteSuitFileInformationService = async (res, id, companyId) => {
  try {
    const suitInfo = await SuitFileInformation.findOne({ where: { id, company_id: companyId } });
    if (!suitInfo) return errorResponse(res, statusCodes.NOT_FOUND, 'Suit File Information not found');
    await suitInfo.destroy();
    return successResponse(res, statusCodes.OK, 'Suit File Information deleted successfully');
  } catch (error) {
    console.error('Error in deleteSuitFileInformationService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAuctionService = async (res, data = {}, userToken) => {
  if (!userToken || userToken.role !== 'company') {
    return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can store or update auctions');
  }
  const safeCompanyId = userToken.id;
  const transaction = await sequelize.transaction();
  try {
    const { id, ...inputData } = data;
    
    // Strip client-supplied financial fields
    delete inputData.bid_loss;
    delete inputData.bid_payable;
    delete inputData.company_commission;
    delete inputData.gst_amount;
    delete inputData.dividend_payable;
    delete inputData.subscription_amount;
    delete inputData.dividend;
    delete inputData.net_payable;

    let auctionData = { ...inputData };
    let auctionResult = null;
    let isNew = false;
    
    const targetGroupId = auctionData.group_id || (id ? (await Auction.findByPk(id)).group_id : null);
    const groupForMath = targetGroupId ? await ChitsGroup.findOne({
      where: { id: targetGroupId, company_id: safeCompanyId },
      transaction
    }) : null;

    if (groupForMath && !groupForMath.scheme_configuration_id && auctionData.bid_amount) {
      const bid_amount = parseFloat(auctionData.bid_amount);
      const chitAmount = parseFloat(groupForMath.chit_amount) || 0;
      const installments = parseInt(groupForMath.no_of_installments, 10) || 1;
      const companyCommissionPct = parseFloat(groupForMath.company_commission) || 0;
      
      const totalEnrollments = await Enrollment.count({ where: { group_id: targetGroupId, delete_status: 0 }, transaction });
      const memberCount = totalEnrollments > 0 ? totalEnrollments : installments;

      const financials = calculateOpenAuctionFinancials({
        chitAmount,
        installments,
        bidAmount: bid_amount,
        commissionPct: companyCommissionPct,
        memberCount
      });

      auctionData.subscription_amount = financials.subscription;
      auctionData.company_commission = financials.commission;
      auctionData.gst_amount = financials.gst;
      auctionData.bid_loss = financials.bidDiscount;
      auctionData.dividend_payable = financials.totalDividend;
      auctionData.dividend = financials.totalDividend;
      auctionData.bid_payable = financials.winnerReceives;
      auctionData.net_payable = financials.netPayable;
    }

    if (id) {
      const auction = await Auction.findByPk(id, { transaction });
      if (!auction) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.NOT_FOUND, 'Auction not found');
      }
      await auction.update(auctionData, { transaction });
      auctionResult = auction;
    } else {
      if (auctionData.group_id) {

        // B7: Auto-assign auction_number
        const lastAuction = await Auction.findOne({
          where: { group_id: auctionData.group_id },
          order: [['auction_number', 'DESC']],
          transaction
        });
        const lastRecorded = lastAuction ? parseInt(lastAuction.auction_number, 10) : 0;
        auctionData.auction_number = lastRecorded + 1;

        // Duplicate-winner guard for new auctions
        if (auctionData.bidder_id) {
          const existingWin = await Auction.findOne({
            where: { group_id: auctionData.group_id, bidder_id: auctionData.bidder_id },
            transaction
          });
          if (existingWin) {
            await transaction.rollback();
            return errorResponse(res, statusCodes.BAD_REQUEST, `This member has already won auction #${existingWin.auction_number} in this group`);
          }
        }
      }

      auctionResult = await Auction.create(auctionData, { transaction });
      isNew = true;
    }

    // Automatically update the ChitsGroup's auction_date to the next_auction_date so the UI updates
    if (auctionData.next_auction_date && auctionData.group_id) {
      await ChitsGroup.update(
        { auction_date: auctionData.next_auction_date },
        { where: { id: auctionData.group_id }, transaction }
      );
    }

    if (isNew && auctionData.group_id && auctionData.bidder_id) {
      const group = await ChitsGroup.findOne({
        where: { id: auctionData.group_id, company_id: safeCompanyId },
        transaction
      });
      const schemeConfig = group?.scheme_configuration_id
        ? await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id, { transaction })
        : null;

      const winnerEnrollment = await Enrollment.findOne({
        where: { group_id: auctionData.group_id, subscriber_id: auctionData.bidder_id, delete_status: 0 },
        transaction
      });

      if (winnerEnrollment) {
        if (schemeConfig) {
          await applyWinnerSchemeAdjustments(auctionData, schemeConfig, winnerEnrollment.id, transaction);
        } else {
          await applyOpenAuctionAdjustments(auctionData, winnerEnrollment.id, auctionData.group_id, transaction);
        }
      }
    }

    await transaction.commit();
    return successResponse(res, isNew ? statusCodes.CREATED : statusCodes.OK, `Auction ${isNew ? 'created' : 'updated'} successfully`, auctionResult);
  } catch (error) {
    await transaction.rollback();

    // B6: Catch DB unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      const errItem = error.errors && error.errors[0];
      if (errItem && errItem.path === 'auctions_group_bidder_unique') {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'This member has already won an auction in this group');
      }
      if (errItem && errItem.path === 'auctions_group_auction_number_unique') {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'This auction number has already been recorded for this group');
      }
    }

    console.error('Error in storeOrUpdateAuctionService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const recordWinnerService = async (res, reqBody, userToken) => {
  if (!userToken || userToken.role !== 'company') {
    return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can record auction winners');
  }
  const safeCompanyId = userToken.id;
  const transaction = await sequelize.transaction();
  try {
    const { company_id, group_id, bidder_id, auction_date, pb_bo_proxy, gst_number_percentage, due_date, next_auction_date } = reqBody;

    const effectiveAuctionDate = auction_date || new Date().toISOString().split('T')[0];
    if (due_date && new Date(due_date) < new Date(effectiveAuctionDate)) {
      await transaction.rollback();
      return errorResponse(res, statusCodes.BAD_REQUEST, 'due_date cannot be before auction_date');
    }

    // 1. Group checks
    const group = await ChitsGroup.findOne({
      where: {
        id: group_id,
        is_deleted_status: 0,
        chits_group_status: 1,
        company_id: safeCompanyId // Secure scoping
      },
      transaction
    });

    if (!group) {
      await transaction.rollback();
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Group is not started, does not exist, or you have no access');
    }

    // Bid discount floor check
    if (reqBody.bid_amount && !group.scheme_configuration_id) {
      const maxDiscountPct = parseFloat(group.max_ceiling_in) || 0;
      const chitAmount = parseFloat(group.chit_amount) || 0;
      const minBid = chitAmount * (1 - maxDiscountPct / 100);
      if (parseFloat(reqBody.bid_amount) < minBid) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.BAD_REQUEST, `Bid amount cannot be lower than the maximum discount floor (₹${minBid})`);
      }
    }

    // 2. Bidder checks
    const winnerEnrollment = await Enrollment.findOne({
      where: { group_id, subscriber_id: bidder_id, delete_status: 0 },
      transaction
    });

    if (!winnerEnrollment) {
      await transaction.rollback();
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Bidder is not enrolled in this group');
    }

    // 3. Duplicate-winner guard
    const existingWin = await Auction.findOne({
      where: { group_id, bidder_id },
      transaction
    });

    if (existingWin) {
      await transaction.rollback();
      return errorResponse(res, statusCodes.BAD_REQUEST, `This member has already won auction #${existingWin.auction_number} in this group`);
    }

    // 4. Auction number
    const lastAuction = await Auction.findOne({
      where: { group_id },
      order: [['auction_number', 'DESC']],
      transaction
    });

    const lastRecorded = lastAuction ? parseInt(lastAuction.auction_number, 10) : 0;

    let schemeConfig = null;
    let companyMonths = 0;

    if (group.scheme_configuration_id) {
      schemeConfig = await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id, { transaction });
      if (schemeConfig) {
        if (schemeConfig.scheme_type === 63) {
          companyMonths = parseInt(schemeConfig.company_chit, 10) || 1;
        } else if (schemeConfig.scheme_type === 64) {
          companyMonths = 1;
        }
      }
    }

    const nextAuctionNumber = Math.max(lastRecorded, companyMonths) + 1;

    // Guard against exceeding schedule
    if (nextAuctionNumber > (group.no_of_installments || 0)) {
      await transaction.rollback();
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Auction schedule is already finished for this group');
    }

    // 5. Amount
    let auctionData = {
      company_id: safeCompanyId || group.company_id,
      group_id,
      bidder_id,
      auction_number: nextAuctionNumber,
      auction_date: auction_date || new Date().toISOString().split('T')[0],
      pb_bo_proxy: pb_bo_proxy || 'Prized Bidder',
      due_date,
      next_auction_date
    };

    if (schemeConfig) {
      const derivedWinningAmount = getSchemeWinningAmount(schemeConfig, nextAuctionNumber);
      if (derivedWinningAmount === null) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Cannot record winner for a company month');
      }
      auctionData.bid_amount = derivedWinningAmount;
    } else {
      const bid_amount = parseFloat(reqBody.bid_amount);
      if (isNaN(bid_amount) || bid_amount <= 0) {
        await transaction.rollback();
        return errorResponse(res, statusCodes.BAD_REQUEST, 'bid_amount is required for Open Auction groups');
      }
      auctionData.bid_amount = bid_amount;
      const chitAmount = parseFloat(group.chit_amount) || 0;
      const installments = parseInt(group.no_of_installments, 10) || 1;
      const companyCommissionPct = parseFloat(group.company_commission) || 0;

      const totalEnrollments = await Enrollment.count({ where: { group_id, delete_status: 0 }, transaction });
      const memberCount = totalEnrollments > 0 ? totalEnrollments : installments;

      const financials = calculateOpenAuctionFinancials({
        chitAmount,
        installments,
        bidAmount: bid_amount,
        commissionPct: companyCommissionPct,
        memberCount
      });

      auctionData.subscription_amount = financials.subscription;
      auctionData.company_commission = financials.commission;
      auctionData.gst_amount = financials.gst;
      auctionData.bid_loss = financials.bidDiscount;
      auctionData.dividend_payable = financials.totalDividend;
      auctionData.dividend = financials.totalDividend;
      auctionData.bid_payable = financials.winnerReceives;
      auctionData.net_payable = financials.netPayable;
    }

    // 6. Create auction row and apply adjustments
    const newAuction = await Auction.create(auctionData, { transaction });

    if (schemeConfig) {
      await applyWinnerSchemeAdjustments(auctionData, schemeConfig, winnerEnrollment.id, transaction);
    } else {
      await applyOpenAuctionAdjustments(auctionData, winnerEnrollment.id, auctionData.group_id, transaction);
    }

    // 7. Update ChitsGroup auction_date and status if complete
    const updates = {};
    if (next_auction_date) {
      updates.auction_date = next_auction_date;
    }
    if (parseInt(auctionData.auction_number, 10) >= parseInt(group.no_of_installments, 10)) {
      updates.chits_group_status = 2;
    }
    
    if (Object.keys(updates).length > 0) {
      await group.update(updates, { transaction });
    }

    await transaction.commit();

    // FCM Notification Trigger
    try {
      const winner = await Member.findByPk(bidder_id);
      if (winner && winner.fcm_token) {
        fcmService.sendPushToMember(winner, 'Auction Won', `Congratulations! You won the auction for Chit ${group.chit_group_name}`, { type: 'AUCTION_WIN', group_id: String(group_id) });
      }

      const allEnrollments = await Enrollment.findAll({
        where: { group_id, delete_status: 0, company_id: safeCompanyId || group.company_id },
        include: [{ model: Member, as: 'subscriber', where: { is_deleted_status: 0, fcm_token: { [Op.ne]: null } }, required: true }]
      });
      const groupMembers = allEnrollments.map(e => e.subscriber).filter(s => s.id !== bidder_id);
      
      let dividendText = '';
      if (schemeConfig && schemeConfig.scheme_type !== 63 && schemeConfig.scheme_type !== 64) {
        const dividend = auctionData.net_payable > 0 ? (group.chit_value - auctionData.net_payable) / group.no_of_members : 0;
        if (dividend > 0) dividendText = ` A dividend of Rs. ${dividend.toFixed(2)} has been applied.`;
      }
      fcmService.sendPushToMulticast(groupMembers, safeCompanyId || group.company_id, 'Auction Concluded', `The auction for Chit ${group.chit_group_name} has concluded.${dividendText}`, { type: 'AUCTION_CONCLUDED', group_id: String(group_id) });
    } catch (pushErr) {
      console.error('Error sending auction pushes:', pushErr);
    }

    return successResponse(res, statusCodes.CREATED, 'Auction recorded successfully', { ...newAuction.toJSON(), auction_number: nextAuctionNumber });
  } catch (error) {
    await transaction.rollback();

    // B6: Catch DB unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      const errItem = error.errors && error.errors[0];
      if (errItem && errItem.path === 'auctions_group_bidder_unique') {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'This member has already won an auction in this group');
      }
      if (errItem && errItem.path === 'auctions_group_auction_number_unique') {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'This auction number has already been recorded for this group');
      }
    }

    console.error('Error in recordWinnerService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAuctionsService = async (res, company_id, group_id, bidder_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const where = {
      ...(company_id && company_id !== '' && { company_id }),
      ...(group_id && group_id !== '' && { group_id }),
      ...(bidder_id && bidder_id !== '' && { bidder_id })
    };

    if (search && search.trim() !== '') {
      where[Op.or] = [
        { '$group.group_name$': { [Op.like]: `%${search}%` } },
        { '$bidder.name$': { [Op.like]: `%${search}%` } },
        { '$bidder.member_id$': { [Op.like]: `%${search}%` } }
      ];
    }

    const auctions = await Auction.findAndCountAll({
      limit,
      offset,
      where,
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['group_name'] },
        { model: Member, as: 'bidder', attributes: ['name', 'member_id'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const formattedData = {
      total_count: auctions.count,
      rows: auctions.rows
    };

    return successResponse(res, statusCodes.OK, 'Auctions retrieved successfully', formattedData);
  } catch (error) {
    console.error('Error in getAllAuctionsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteAuctionService = async (res, id, companyId) => {
  try {
    const auction = await Auction.findOne({ where: { id, company_id: companyId } });
    if (!auction) return errorResponse(res, statusCodes.NOT_FOUND, 'Auction not found');
    await auction.destroy();
    return successResponse(res, statusCodes.OK, 'Auction deleted successfully');
  } catch (error) {
    console.error('Error in deleteAuctionService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllSubcategoriesService = async (res, category_id) => {
  try {
    if (category_id === undefined || category_id === null) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'category_id is required');
    }
    const subcategories = await StaticDropdownSubcategoryList.findAll({
      where: {
        category_id,
        status: 1
      },
      order: [['is_default', 'DESC'], ['subcategory_name', 'ASC']]
    });

    return successResponse(res, statusCodes.OK, 'Subcategories retrieved successfully', subcategories);
  } catch (error) {
    console.error('Error in getAllSubcategoriesService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};


const getAgentByAgentTypeService = async (res, company_id, agent_type_id, min, max, search) => {
  try {
    if (agent_type_id !== 16 && agent_type_id !== 18) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid agent type ID. Must be 16 or 18.');
    }

    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { member_id: { [Op.like]: `%${search}%` } }
        ]
      })
    };

    const allMembers = await Member.findAll({ where });

    const agents = allMembers.filter(m => {
      if (!m.introduced_as) return false;
      let intro = m.introduced_as;
      if (typeof intro === 'string') {
        try {
          intro = JSON.parse(intro);
        } catch (e) {
          return intro.includes(String(agent_type_id)) || intro.includes(Number(agent_type_id));
        }
      }
      if (Array.isArray(intro)) {
        return intro.map(Number).includes(Number(agent_type_id)) || intro.map(String).includes(String(agent_type_id));
      }
      return false;
    });

    const total_count = agents.length;
    const paginatedAgents = agents.slice(offset, offset + limit);

    const now = new Date();
    const endOfCurrentMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString().split('T')[0];

    const result = [];

    for (const agent of paginatedAgents) {
      const whereClause = { delete_status: 0 };
      if (agent_type_id === 16) {
        whereClause.business_agent_id = agent.id;
      } else if (agent_type_id === 18) {
        whereClause.collection_agent_id = agent.id;
      }

      const enrollments = await Enrollment.findAll({
        where: whereClause
      });

      let total_target_amount = 0;
      let total_due_amount = 0;

      for (const e of enrollments) {
        const installments = await ChitsInstallment.findAll({
          where: {
            enrollment_id: e.id,
            due_date: { [Op.lte]: endOfCurrentMonthStr }
          },
          include: [
            { model: sequelize.models.CustomerPayment, as: 'payments', attributes: ['received_amount'] }
          ]
        });

        for (const inst of installments) {
          const instData = inst.toJSON();
          const payable = parseFloat(instData.payable_amount) || 0;
          const received = instData.payments ? instData.payments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0) : 0;

          total_target_amount += payable;
          total_due_amount += (payable - received);
        }
      }

      const storedEntry = await AgentTargetEntry.findOne({
        where: { agent_id: agent.id, agent_type_id }
      });

      result.push({
        agent_id: agent.id,
        agent_name: agent.name,
        agent_member_id: agent.member_id,
        company_id: agent.company_id,
        total_target_amount,
        total_due_amount,
        stored_target_amount: storedEntry ? parseFloat(storedEntry.target_amount) || 0 : null,
        stored_due_amount: storedEntry ? parseFloat(storedEntry.due_amount) || 0 : null
      });
    }

    return successResponse(res, statusCodes.OK, 'Agent target details retrieved successfully', {
      total_count,
      rows: result
    });

  } catch (error) {
    console.error('Error in getAgentByAgentTypeService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAgentEnrollmentsService = async (res, company_id, agent_type_id, agent_id, group_id, position, min, max, search) => {
  try {
    const type_id = parseInt(agent_type_id, 10);
    const ag_id = parseInt(agent_id, 10);

    if (type_id !== 16 && type_id !== 18) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid agent type ID. Must be 16 or 18.');
    }
    if (isNaN(ag_id)) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Agent ID is required and must be a number.');
    }

    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const whereClause = {
      delete_status: 0,
      ...(company_id && company_id !== '' && { company_id }),
      ...(type_id === 16 ? { business_agent_id: ag_id } : { collection_agent_id: ag_id }),
      ...(group_id && { group_id })
    };

    const enrollments = await Enrollment.findAll({
      where: whereClause,
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['group_name', 'chit_amount'] },
        { model: Member, as: 'subscriber', attributes: ['name', 'member_id'] }
      ]
    });

    let filteredEnrollments = enrollments;
    if (search) {
      filteredEnrollments = enrollments.filter(e => {
        const groupMatch = e.group && e.group.group_name && e.group.group_name.toLowerCase().includes(search.toLowerCase());
        const subMatch = e.subscriber && (
          (e.subscriber.name && e.subscriber.name.toLowerCase().includes(search.toLowerCase())) ||
          (e.subscriber.member_id && e.subscriber.member_id.toLowerCase().includes(search.toLowerCase()))
        );
        return groupMatch || subMatch;
      });
    }

    const now = new Date();
    const endOfCurrentMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString().split('T')[0];

    const allInstallments = [];

    for (const e of filteredEnrollments) {
      const isPrized = await Auction.findOne({
        where: {
          group_id: e.group_id,
          bidder_id: e.subscriber_id
        }
      });
      const pos = isPrized ? 'PS' : 'NPS';

      if (position && position !== pos) continue;

      const installments = await ChitsInstallment.findAll({
        where: {
          enrollment_id: e.id,
          due_date: { [Op.lte]: endOfCurrentMonthStr }
        },
        include: [
          { model: sequelize.models.CustomerPayment, as: 'payments', attributes: ['received_amount'] }
        ]
      });

      for (const inst of installments) {
        const instData = inst.toJSON();
        const payable = parseFloat(instData.payable_amount) || 0;
        const received = instData.payments ? instData.payments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0) : 0;

        allInstallments.push({
          id: instData.id,
          enrollment_id: e.id,
          group_id: e.group_id,
          group_name: e.group ? e.group.group_name : null,
          chit_amount: e.group ? (parseFloat(e.group.chit_amount) || 0) : null,
          subscriber_id: e.subscriber_id,
          subscriber_name: e.subscriber ? e.subscriber.name : null,
          subscriber_member_id: e.subscriber ? e.subscriber.member_id : null,
          position: pos,
          type: instData.type,
          installment_no: instData.installment_no,
          due_date: instData.due_date,
          over_due_days_count: instData.over_due_days_count,
          penalty_amount: instData.penalty_amount,
          payable_amount: payable,
          createdAt: instData.createdAt,
          updatedAt: instData.updatedAt,
          payments: instData.payments || [],
          received_amount: received,
          due_amount: Math.max(0, payable - received)
        });
      }
    }

    const total_count = allInstallments.length;
    const paginated = allInstallments.slice(offset, offset + limit);

    return successResponse(res, statusCodes.OK, 'Agent enrollments retrieved successfully', {
      total_count,
      rows: paginated
    });

  } catch (error) {
    console.error('Error in getAgentEnrollmentsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAgentTargetEntryService = async (res, data = {}) => {
  try {
    const { id, company_id, agent_type_id, agent_id, target_amount, from_date, to_date, due_amount } = data;

    if (!agent_type_id || !agent_id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'agent_type_id and agent_id are required.');
    }

    if (id) {
      const existing = await AgentTargetEntry.findByPk(id);
      if (!existing) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'AgentTargetEntry not found');
      }

      await existing.update({
        company_id,
        agent_type_id,
        agent_id,
        target_amount,
        from_date,
        to_date,
        due_amount
      });

      return successResponse(res, statusCodes.OK, 'Agent target entry updated successfully', existing);
    } else {
      const newEntry = await AgentTargetEntry.create({
        company_id,
        agent_type_id,
        agent_id,
        target_amount,
        from_date,
        to_date,
        due_amount
      });

      return successResponse(res, statusCodes.CREATED, 'Agent target entry created successfully', newEntry);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateAgentTargetEntryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFilteredMembersByGroupAndAgentService = async (res, company_id, agent_type_id, agent_id, group_id, min, max) => {
  try {
    const type_id = parseInt(agent_type_id, 10);
    const ag_id = parseInt(agent_id, 10);

    if (type_id !== 16 && type_id !== 18) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid agent type ID. Must be 16 or 18.');
    }

    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const whereClause = {
      delete_status: 0,
      ...(company_id && company_id !== '' && { company_id }),
      ...(group_id && group_id !== '' && { group_id }),
      ...(!isNaN(ag_id) && (type_id === 16 ? { business_agent_id: ag_id } : { collection_agent_id: ag_id }))
    };

    const enrollments = await Enrollment.findAll({
      where: whereClause,
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['group_name'] },
        { model: Member, as: 'subscriber', attributes: ['name', 'member_id'] },
        { model: Member, as: 'business_agent', attributes: ['name'] },
        { model: Member, as: 'collection_agent', attributes: ['name'] }
      ]
    });

    const result = [];
    for (const e of enrollments) {
      const isPrized = await Auction.findOne({
        where: {
          group_id: e.group_id,
          bidder_id: e.subscriber_id
        }
      });

      result.push({
        subscriber_id: e.subscriber_id,
        subscriber_name: e.subscriber ? e.subscriber.name : null,
        group_name: e.group ? e.group.group_name : null,
        group_position: e.group_position_number,
        position: isPrized ? 'PS' : 'NPS',
        agent_name: type_id === 16 ? (e.business_agent ? e.business_agent.name : null) : (e.collection_agent ? e.collection_agent.name : null),
        business_agent_name: e.business_agent ? e.business_agent.name : null,
        collection_agent_name: e.collection_agent ? e.collection_agent.name : null
      });
    }

    const total_count = result.length;
    const paginated = result.slice(offset, offset + limit);

    return successResponse(res, statusCodes.OK, 'Filtered members retrieved successfully', {
      total_count,
      rows: paginated
    });
  } catch (error) {
    console.error('Error in getFilteredMembersByGroupAndAgentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const transferAgentUpdateService = async (res, member_id, agent_type_id, new_agent_id) => {
  try {
    const type_id = parseInt(agent_type_id, 10);
    const new_ag_id = parseInt(new_agent_id, 10);

    if (type_id !== 16 && type_id !== 18) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid agent type ID. Must be 16 or 18.');
    }
    if (isNaN(new_ag_id)) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'New Agent ID is required and must be a number.');
    }

    const memberIds = Array.isArray(member_id) ? member_id : [parseInt(member_id, 10)].filter(Boolean);
    if (!memberIds.length) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Member ID is required.');
    }

    if (type_id === 16) {
      await Enrollment.update(
        { business_agent_id: new_ag_id },
        { where: { subscriber_id: { [Op.in]: memberIds }, delete_status: 0 } }
      );
    } else if (type_id === 18) {
      await Enrollment.update(
        { collection_agent_id: new_ag_id },
        { where: { subscriber_id: { [Op.in]: memberIds }, delete_status: 0 } }
      );
    }

    return successResponse(res, statusCodes.OK, 'Agent transferred successfully');
  } catch (error) {
    console.error('Error in transferAgentUpdateService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};
const getAllGroupUnderStaticListsService = async (res, comp_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const whereClause = {
      is_deleted_status: 0,
      ...(search && { name: { [Op.iLike]: `%${search}%` } })
    };

    if (comp_id) {
      whereClause[Op.or] = [
        { type: 1 },
        { company_id: comp_id }
      ];
    }

    const { count, rows } = await GroupUnderStaticList.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['account_order', 'ASC'], ['id', 'ASC']]
    });

    return successResponse(res, statusCodes.OK, 'Group under static list retrieved successfully', {
      total_count: count,
      rows
    });
  } catch (error) {
    console.error('Error in getAllGroupUnderStaticListsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateGroupUnderStaticListService = async (res, comp_id, data = {}) => {
  try {
    const { id, ...restData } = data;
    restData.type = 2;
    if (comp_id) {
      restData.company_id = comp_id;
    }
    if (id) {
      const existing = await GroupUnderStaticList.findByPk(id);
      if (!existing) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Group under static list not found');
      }
      await existing.update(restData);
      return successResponse(res, statusCodes.OK, 'Group under static list updated successfully', existing);
    } else {
      await sequelize.query(`SELECT setval(pg_get_serial_sequence('group_under_static_lists', 'id'), coalesce(max(id), 0) + 1, false) FROM "group_under_static_lists";`);
      const created = await GroupUnderStaticList.create(restData);
      return successResponse(res, statusCodes.CREATED, 'Group under static list created successfully', created);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateGroupUnderStaticListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBusinessListUnderMembersService = async (res, business_agent_id, min, max) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const commissions = await ConfigureBusinessAgentCommission.findAndCountAll({
      where: { business_agent_id },
      limit,
      offset,
      include: [
        {
          model: Member,
          as: 'member',
          attributes: ['id', 'name', 'other_info_user_code', 'mobile_number', 'upload_image', 'registration_date', 'createdAt'],
          include: [
            { model: StaticDropdownsList, as: 'gender_dropdown', attributes: ['id', 'dropdown_name'] }
          ]
        }
      ]
    });

    const rows = commissions.rows.map(row => {
      const rowData = row.toJSON();
      if (rowData.commission_amount) {
        rowData.commission_amount = parseFloat(rowData.commission_amount) || 0;
      }
      return rowData;
    });

    return successResponse(res, statusCodes.OK, 'Members under business agent retrieved successfully', { count: commissions.count, rows });
  } catch (error) {
    console.error('Error in getBusinessListUnderMembersService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteGroupUnderStaticListService = async (res, id, companyId) => {
  try {
    const existing = await GroupUnderStaticList.findOne({ where: { id, company_id: companyId } });
    if (!existing) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Group under static list not found');
    }
    await existing.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Group under static list deleted successfully');
  } catch (error) {
    console.error('Error in deleteGroupUnderStaticListService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getGroupUnderStaticListByIdService = async (res, id, companyId) => {
  try {
    const record = await GroupUnderStaticList.findOne({ where: { id, company_id: companyId, is_deleted_status: 0 } });
    if (!record) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Group under static list not found');
    }
    return successResponse(res, statusCodes.OK, 'Group under static list retrieved successfully', record);
  } catch (error) {
    console.error('Error in getGroupUnderStaticListByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateAccountCreationDetailService = async (res, comp_id, login_user_id, data = {}) => {
  try {
    const { id, ...restData } = data;
    if (comp_id) restData.company_id = comp_id;
    if (id) {
      if (login_user_id) restData.updated_by = String(login_user_id);
      const existing = await AccountCreationDetail.findOne({ where: { id, company_id: companyId } });
      if (!existing) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Account creation detail not found');
      }
      await existing.update(restData);
      return successResponse(res, statusCodes.OK, 'Account creation detail updated successfully', existing);
    } else {
      if (login_user_id) restData.created_by = String(login_user_id);
      const created = await AccountCreationDetail.create(restData);
      return successResponse(res, statusCodes.CREATED, 'Account creation detail created successfully', created);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateAccountCreationDetailService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAccountCreationDetailsService = async (res, comp_id, min, max, search, account_group_id) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const whereClause = {
      is_deleted_status: 0,
      ...(comp_id && { company_id: comp_id }),
      ...(account_group_id && { account_group_id }),
      ...(search && { account_name: { [Op.iLike]: `%${search}%` } })
    };

    const { count, rows } = await AccountCreationDetail.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      include: [{
        model: GroupUnderStaticList,
        as: 'account_group',
        attributes: ['id', 'name']
      }],
      order: [['id', 'DESC']]
    });

    const allRecords = await AccountCreationDetail.findAll({
      where: whereClause
    });

    let total_credit = 0;
    let total_debit = 0;
    let opening_balance_total = 0;

    allRecords.forEach(record => {
      const balance = parseFloat(record.opening_balance) || 0;
      opening_balance_total += balance;
      if (record.cr_dr_status === 1) {
        total_credit += balance;
      } else if (record.cr_dr_status === 2) {
        total_debit += balance;
      }
    });

    const difference_total = total_credit - total_debit;

    return successResponse(res, statusCodes.OK, 'Account creation details retrieved successfully', {
      total_count: count,
      total_credit,
      total_debit,
      opening_balance_total,
      difference_total,
      rows
    });
  } catch (error) {
    console.error('Error in getAllAccountCreationDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAccountTreeService = async (res, comp_id, group_under_id, search) => {
  try {
    const whereClause = {
      is_deleted_status: 0,
      ...(search && { name: { [Op.iLike]: `%${search}%` } }),
      ...(group_under_id ? { group_under_id } : { type: 1 }),
      ...(comp_id && {
        [Op.or]: [
          { type: 1 },
          { company_id: comp_id }
        ]
      })
    };

    const rows = await GroupUnderStaticList.findAll({
      where: whereClause,
      order: [['account_order', 'ASC'], ['id', 'ASC']]
    });

    let accounts = [];
    if (group_under_id) {
      const accountsWhereClause = {
        is_deleted_status: 0,
        account_group_id: group_under_id,
        ...(comp_id && { company_id: comp_id })
      };
      if (search) {
        accountsWhereClause.account_name = { [Op.iLike]: `%${search}%` };
      }
      accounts = await AccountCreationDetail.findAll({
        where: accountsWhereClause,
        order: [['id', 'DESC']]
      });
    }

    return successResponse(res, statusCodes.OK, 'Account tree retrieved successfully', {
      total_count: rows.length,
      rows,
      accounts_count: accounts.length,
      accounts
    });
  } catch (error) {
    console.error('Error in getAllAccountTreeService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAccountCreationDetailByIdService = async (res, id, companyId) => {
  try {
    const record = await AccountCreationDetail.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 },
      include: [{
        model: GroupUnderStaticList,
        as: 'account_group',
        attributes: ['id', 'name']
      }]
    });
    if (!record) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Account creation detail not found');
    }
    return successResponse(res, statusCodes.OK, 'Account creation detail retrieved successfully', record);
  } catch (error) {
    console.error('Error in getAccountCreationDetailByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteAccountCreationDetailService = async (res, id, companyId) => {
  try {
    const existing = await AccountCreationDetail.findOne({ where: { id, company_id: companyId } });
    if (!existing) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Account creation detail not found');
    }
    await existing.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Account creation detail deleted successfully');
  } catch (error) {
    console.error('Error in deleteAccountCreationDetailService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const bulkEditAccountCreationDetailsService = async (res, comp_id, login_user_id, accounts = []) => {
  try {
    if (!Array.isArray(accounts)) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'accounts must be an array');
    }
    const results = [];
    for (const data of accounts) {
      const { id, ...restData } = data;
      if (!id) continue;
      if (comp_id) restData.company_id = comp_id;
      if (login_user_id) restData.updated_by = String(login_user_id);
      const existing = await AccountCreationDetail.findOne({ where: { id, company_id: companyId } });
      if (existing) {
        await existing.update(restData);
        results.push(existing);
      }
    }
    return successResponse(res, statusCodes.OK, 'Account creation details edited successfully', results);
  } catch (error) {
    console.error('Error in bulkEditAccountCreationDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateSelfChitService = async (res, data = {}) => {
  try {
    const { id, ...selfChitData } = data;
    if (id) {
      const selfChit = await SelfChit.findByPk(id);
      if (!selfChit) return errorResponse(res, statusCodes.NOT_FOUND, 'Self chit not found');
      await selfChit.update(selfChitData);
      await checkAndUpdateChitFullStatus(selfChit.group_id);
      return successResponse(res, statusCodes.OK, 'Self chit updated successfully', selfChit);
    } else {
      const newSelfChit = await SelfChit.create(selfChitData);
      await checkAndUpdateChitFullStatus(newSelfChit.group_id);
      return successResponse(res, statusCodes.CREATED, 'Self chit created successfully', newSelfChit);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateSelfChitService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllSelfChitDetailsService = async (res, company_id, min, max) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id })
    };
    const selfChits = await SelfChit.findAndCountAll({
      limit, offset, where,
      include: [
        { model: Company, as: 'company', attributes: ['company_name'] },
        { model: ChitsGroup, as: 'group', attributes: ['group_name'] },
        { model: Member, as: 'subscriber', attributes: ['name', 'member_id'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'Self chits retrieved successfully', selfChits);
  } catch (error) {
    console.error('Error in getAllSelfChitDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getSelfChitByIdService = async (res, id, companyId) => {
  try {
    const selfChit = await SelfChit.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 },
      include: [
        { model: Company, as: 'company', attributes: ['company_name'] },
        { model: ChitsGroup, as: 'group', attributes: ['group_name'] },
        { model: Member, as: 'subscriber', attributes: ['name', 'member_id'] }
      ]
    });
    if (!selfChit) return errorResponse(res, statusCodes.NOT_FOUND, 'Self chit not found');
    return successResponse(res, statusCodes.OK, 'Self chit retrieved successfully', selfChit);
  } catch (error) {
    console.error('Error in getSelfChitByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteSelfChitService = async (res, id, companyId) => {
  try {
    const selfChit = await SelfChit.findOne({ where: { id, company_id: companyId } });
    if (!selfChit) return errorResponse(res, statusCodes.NOT_FOUND, 'Self chit not found');
    await selfChit.update({ is_deleted_status: 1 });
    await checkAndUpdateChitFullStatus(selfChit.group_id);
    return successResponse(res, statusCodes.OK, 'Self chit deleted successfully');
  } catch (error) {
    console.error('Error in deleteSelfChitService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateConfigureBusinessAgentCommissionService = async (res, data = {}) => {
  try {
    const { id, ...configData } = data;
    if (id) {
      const config = await ConfigureBusinessAgentCommission.findOne({ where: { id, company_id: companyId } });
      if (!config) return errorResponse(res, statusCodes.NOT_FOUND, 'Configuration not found');

      const existing = await ConfigureBusinessAgentCommission.findOne({
        where: {
          group_id: configData.group_id || config.group_id,
          business_agent_id: configData.business_agent_id || config.business_agent_id,
          member_id: configData.member_id || config.member_id,
          is_deleted_status: 0,
          id: { [Op.ne]: id }
        }
      });
      if (existing) return errorResponse(res, statusCodes.BAD_REQUEST, 'Configuration already exists for this group, business agent, and member');

      await config.update(configData);
      return successResponse(res, statusCodes.OK, 'Configuration updated successfully', config);
    } else {
      const existing = await ConfigureBusinessAgentCommission.findOne({
        where: {
          group_id: configData.group_id,
          business_agent_id: configData.business_agent_id,
          member_id: configData.member_id,
          is_deleted_status: 0
        }
      });
      if (existing) return errorResponse(res, statusCodes.BAD_REQUEST, 'Configuration already exists for this group, business agent, and member');

      const newConfig = await ConfigureBusinessAgentCommission.create(configData);
      return successResponse(res, statusCodes.CREATED, 'Configuration created successfully', newConfig);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateConfigureBusinessAgentCommissionService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllConfigureBusinessAgentCommissionsService = async (res, filters = {}, min, max) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = { is_deleted_status: 0 };
    if (filters.group_id) where.group_id = filters.group_id;
    if (filters.business_agent_id) where.business_agent_id = filters.business_agent_id;

    const records = await ConfigureBusinessAgentCommission.findAndCountAll({
      where,
      limit,
      offset,
      include: [
        { model: Company, as: 'company', attributes: ['company_name'] },
        { model: ChitsGroup, as: 'group', attributes: ['group_name', 'chit_amount', 'chits_group_status'] },
        { model: Member, as: 'business_agent', attributes: ['name', 'member_id'] },
        { model: Member, as: 'member', attributes: ['name', 'member_id'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const configIds = records.rows.map(r => r.id);
    let totalMap = {};
    if (configIds.length > 0) {
      const totals = await HistoryBusinessAgent.findAll({
        where: { configure_business_agent_id: { [Op.in]: configIds }, is_deleted_status: 0 },
        attributes: ['configure_business_agent_id', [sequelize.fn('sum', sequelize.col('paid_amount')), 'total_paid']],
        group: ['configure_business_agent_id'],
        raw: true
      });
      totals.forEach(t => { totalMap[t.configure_business_agent_id] = parseFloat(t.total_paid) || 0; });
    }

    const configurations = records.rows.map(r => {
      const total_paid = totalMap[r.id] || 0;
      const commission_amount = parseFloat(r.commission_amount) || 0;
      return {
        ...r.toJSON(),
        total_paid,
        total_pending: commission_amount - total_paid
      };
    });

    return successResponse(res, statusCodes.OK, 'Configurations retrieved successfully', { count: records.count, configurations });
  } catch (error) {
    console.error('Error in getAllConfigureBusinessAgentCommissionsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getConfigureBusinessAgentCommissionByIdService = async (res, id, companyId) => {
  try {
    const config = await ConfigureBusinessAgentCommission.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 },
      include: [
        { model: Company, as: 'company', attributes: ['company_name'] },
        { model: ChitsGroup, as: 'group', attributes: ['group_name', 'chit_amount', 'chits_group_status'] },
        { model: Member, as: 'business_agent', attributes: ['name', 'member_id'] },
        { model: Member, as: 'member', attributes: ['name', 'member_id'] }
      ]
    });
    if (!config) return errorResponse(res, statusCodes.NOT_FOUND, 'Configuration not found');

    const total_paid_str = await HistoryBusinessAgent.sum('paid_amount', {
      where: { configure_business_agent_id: id, is_deleted_status: 0 }
    });
    const total_paid = parseFloat(total_paid_str) || 0;
    const commission_amount = parseFloat(config.commission_amount) || 0;

    const data = {
      ...config.toJSON(),
      total_paid,
      total_pending: commission_amount - total_paid
    };

    return successResponse(res, statusCodes.OK, 'Configuration retrieved successfully', data);
  } catch (error) {
    console.error('Error in getConfigureBusinessAgentCommissionByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteConfigureBusinessAgentCommissionService = async (res, id, companyId) => {
  try {
    const config = await ConfigureBusinessAgentCommission.findOne({ where: { id, company_id: companyId } });
    if (!config) return errorResponse(res, statusCodes.NOT_FOUND, 'Configuration not found');
    await config.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Configuration deleted successfully');
  } catch (error) {
    console.error('Error in deleteConfigureBusinessAgentCommissionService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateHistoryBusinessAgentService = async (res, data = {}) => {
  try {
    const { id, ...historyData } = data;

    const configId = historyData.configure_business_agent_id || (id ? (await HistoryBusinessAgent.findOne({ where: { id, company_id: companyId } }))?.configure_business_agent_id : null);
    if (!configId) return errorResponse(res, statusCodes.BAD_REQUEST, 'Configuration ID is required');

    const config = await ConfigureBusinessAgentCommission.findByPk(configId);
    if (!config) return errorResponse(res, statusCodes.NOT_FOUND, 'Configuration not found');

    const totalCommission = parseFloat(config.commission_amount) || 0;

    let previousTotal = await HistoryBusinessAgent.sum('paid_amount', {
      where: { configure_business_agent_id: configId, is_deleted_status: 0 }
    }) || 0;
    previousTotal = parseFloat(previousTotal);

    if (id) {
      const history = await HistoryBusinessAgent.findByPk(id);
      if (!history) return errorResponse(res, statusCodes.NOT_FOUND, 'History record not found');

      const oldAmount = parseFloat(history.paid_amount) || 0;
      const newAmount = parseFloat(historyData.paid_amount) || oldAmount;
      const newTotal = previousTotal - oldAmount + newAmount;

      if (newTotal > totalCommission) {
        return errorResponse(res, statusCodes.BAD_REQUEST, `Paid amount exceeds the total commission limit of ${totalCommission}`);
      }

      await history.update(historyData);

      const newStatus = newTotal >= totalCommission ? 3 : (newTotal > 0 ? 2 : 1);
      await config.update({ status: newStatus });

      return successResponse(res, statusCodes.OK, 'History record updated successfully', history);
    } else {
      const newAmount = parseFloat(historyData.paid_amount) || 0;
      const newTotal = previousTotal + newAmount;

      if (newTotal > totalCommission) {
        return errorResponse(res, statusCodes.BAD_REQUEST, `Paid amount exceeds the total commission limit of ${totalCommission}`);
      }

      const newHistory = await HistoryBusinessAgent.create(historyData);

      const newStatus = newTotal >= totalCommission ? 3 : (newTotal > 0 ? 2 : 1);
      await config.update({ status: newStatus });

      return successResponse(res, statusCodes.CREATED, 'History record created successfully', newHistory);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateHistoryBusinessAgentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllHistoryBusinessAgentsService = async (res, configure_business_agent_id, min, max) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = { is_deleted_status: 0 };
    if (configure_business_agent_id) where.configure_business_agent_id = configure_business_agent_id;

    const records = await HistoryBusinessAgent.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'History records retrieved successfully', records);
  } catch (error) {
    console.error('Error in getAllHistoryBusinessAgentsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getHistoryBusinessAgentByIdService = async (res, id, companyId) => {
  try {
    const history = await HistoryBusinessAgent.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 }
    });
    if (!history) return errorResponse(res, statusCodes.NOT_FOUND, 'History record not found');
    return successResponse(res, statusCodes.OK, 'History record retrieved successfully', history);
  } catch (error) {
    console.error('Error in getHistoryBusinessAgentByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteHistoryBusinessAgentService = async (res, id, companyId) => {
  try {
    const history = await HistoryBusinessAgent.findOne({ where: { id, company_id: companyId } });
    if (!history) return errorResponse(res, statusCodes.NOT_FOUND, 'History record not found');
    await history.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'History record deleted successfully');
  } catch (error) {
    console.error('Error in deleteHistoryBusinessAgentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBusinessAgentCommissionSummaryService = async (res, business_agent_id, min, max) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const totalCommissionStr = await ConfigureBusinessAgentCommission.sum('commission_amount', {
      where: { business_agent_id, is_deleted_status: 0 }
    });
    const total_commission_amount = parseFloat(totalCommissionStr) || 0;

    const configRecords = await ConfigureBusinessAgentCommission.findAll({
      where: { business_agent_id, is_deleted_status: 0 },
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['group_name', 'chit_amount', 'chits_group_status'] },
        { 
          model: Member, 
          as: 'member', 
          attributes: ['id', 'name', 'member_id', 'gender', 'other_info_user_code', 'createdAt'],
          include: [
            { model: StaticDropdownsList, as: 'gender_dropdown', attributes: ['id', 'dropdown_name'] }
          ]
        }
      ]
    });

    const configIds = configRecords.map(r => r.id);
    let allHistories = [];
    if (configIds.length > 0) {
      allHistories = await HistoryBusinessAgent.findAll({
        where: { configure_business_agent_id: { [Op.in]: configIds }, is_deleted_status: 0 },
        order: [['createdAt', 'DESC']],
        raw: true
      });
    }

    let paid_commission = 0;
    const members = configRecords.map(config => {
      const histories = allHistories.filter(h => h.configure_business_agent_id === config.id);

      let total_paid = 0;
      histories.forEach(h => {
        total_paid += parseFloat(h.paid_amount) || 0;
      });

      paid_commission += total_paid;

      const commission_amount = parseFloat(config.commission_amount) || 0;
      const total_pending = commission_amount - total_paid;
      const group = config.group || {};
      const member = config.member || {};

      const latestHistoryWithDoc = histories.find(h => h.upload_document);
      const upload_document = latestHistoryWithDoc ? latestHistoryWithDoc.upload_document : null;

      return {
        id: config.id,
        group_name: group.group_name || null,
        chit_amount: parseFloat(group.chit_amount) || 0,
        group_status: group.chits_group_status !== undefined ? group.chits_group_status : null,
        commission_amount,
        total_paid,
        total_pending,
        upload_document,
        member_id: member.id || null,
        member_name: member.name || null,
        gender_dropdown: member.gender_dropdown || null,
        other_info_user_code: member.other_info_user_code ? `MEM-${member.other_info_user_code}` : null,
        registered_date: member.createdAt || null,
        status: config.status
      };
    });

    const pending_commission_amount = total_commission_amount - paid_commission;

    const uniqueMembers = new Set(configRecords.map(c => c.member_id));
    const member_joined = uniqueMembers.size;

    const historyRecords = await HistoryBusinessAgent.findAndCountAll({
      where: { is_deleted_status: 0 },
      include: [{
        model: ConfigureBusinessAgentCommission,
        as: 'configure_business_agent',
        where: { business_agent_id, is_deleted_status: 0 },
        include: [{
          model: ChitsGroup,
          as: 'group',
          attributes: ['group_name', 'chit_amount']
        },
        {
          model: Member,
          as: 'member',
          attributes: ['id', 'name', 'member_id']
        }]
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const history = historyRecords.rows.map(h => {
      const config = h.configure_business_agent || {};
      const group = config.group || {};
      const member = config.member || {};
      return {
        id: h.id,
        group_id: config.group_id,
        group_name: group.group_name,
        chit_amount: parseFloat(group.chit_amount) || 0,
        member_name: member.name || null,
        member_id: member.id || null,
        commission_amount: parseFloat(config.commission_amount) || 0,
        received_date: h.createdAt ? new Date(h.createdAt).toISOString().split('T')[0] : null,
        status: config.status,
        paid_amount: parseFloat(h.paid_amount) || 0
      };
    });

    return successResponse(res, statusCodes.OK, 'Summary retrieved successfully', {
      total_commission_amount,
      paid_commission,
      pending_commission_amount,
      member_joined,
      members,
      history_count: historyRecords.count,
      history
    });

  } catch (error) {
    console.error('Error in getBusinessAgentCommissionSummaryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getHistoryByGroupIdService = async (res, group_id, min, max, business_agent_id = null) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const whereClause = { group_id, is_deleted_status: 0 };
    if (business_agent_id) {
      whereClause.business_agent_id = business_agent_id;
    }

    const records = await ConfigureBusinessAgentCommission.findAndCountAll({
      where: whereClause,
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['group_name', 'chit_amount', 'chits_group_status', 'createdAt'] },
        { model: Member, as: 'member', attributes: ['id', 'name', 'member_id'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const configIds = records.rows.map(r => r.id);

    let historyRecords = [];
    if (configIds.length > 0) {
      historyRecords = await HistoryBusinessAgent.findAll({
        where: { configure_business_agent_id: { [Op.in]: configIds }, is_deleted_status: 0 },
        order: [['createdAt', 'DESC']],
        raw: true
      });
    }

    const configurations = records.rows.map(config => {
      const histories = historyRecords.filter(h => h.configure_business_agent_id === config.id);

      let total_paid = 0;
      histories.forEach(h => {
        total_paid += parseFloat(h.paid_amount) || 0;
      });

      const commission_amount = parseFloat(config.commission_amount) || 0;
      const group = config.group || {};
      const member = config.member || {};

      const latestHistoryWithDoc = histories.find(h => h.upload_document);
      const upload_document = latestHistoryWithDoc ? latestHistoryWithDoc.upload_document : null;

      return {
        id: config.id,
        group_name: group.group_name || null,
        chit_amount: parseFloat(group.chit_amount) || 0,
        group_status: group.chits_group_status !== undefined ? group.chits_group_status : null,
        group_created_date: group.createdAt ? new Date(group.createdAt).toISOString().split('T')[0] : null,
        commission_amount: commission_amount,
        total_paid: total_paid,
        total_pending: commission_amount - total_paid,
        upload_document: upload_document,
        member_id: config.member_id,
        member_name: member.name || null,
        status: config.status
      };
    });

    return successResponse(res, statusCodes.OK, 'Records retrieved successfully', {
      count: records.count,
      records: configurations
    });

  } catch (error) {
    console.error('Error in getHistoryByGroupIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const updateCollectionSubmissionStatusService = async (res, id, status, userToken) => {
  try {
    const companyId = await resolveCompanyIdForAuth(userToken);
    const submission = await CollectionAgentAmount.findOne({ 
      where: { id },
      include: [{ model: Member, as: 'member', where: { company_id: companyId } }]
    });
    if (!submission) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Submission not found');
    }

    let verified_by_id = null;
    let verified_by_role = null;
    let verified_by_name = null;

    if (status === 2 && userToken) {
      verified_by_id = userToken.role === 'company' ? userToken.id : String(userToken.id);
      verified_by_role = userToken.role;
      verified_by_name = 'Unknown';
      if (userToken.role === 'company') {
        const company = await Company.findByPk(userToken.id);
        if (company) verified_by_name = company.company_name;
      } else {
        const staff = await StaffUser.findByPk(userToken.id);
        if (staff) verified_by_name = staff.name;
      }
    }

    // update status (0 - pending, 1 - pending, 2 - verified, 3 - rejected)
    await submission.update({
      status,
      confirm_date: status === 2 ? new Date() : null,
      ...(status === 2 && {
        verified_by_id,
        verified_by_role,
        verified_by_name
      })
    });

    if (status === 2) {
      // Verified - Generate receipt numbers and update pending CustomerPayments
      const pendingPayments = await CustomerPayment.findAll({
        where: { collection_agent_amount_id: id, payment_status: 0 }
      });

      const companyId = submission.member ? submission.member.company_id : null;
      
      for (const payment of pendingPayments) {
        let newReceiptNumber = null;
        if (companyId) {
          newReceiptNumber = await require('../utils/receiptGenerator').generateReceiptNumber(companyId);
        }
        
        await payment.update({ 
          payment_status: 1,
          receipt_number: newReceiptNumber
        });
      }

      // FCM Notification logic follows (which we've already done elsewhere or below this block)
    } else if (status === 3) {
      // Rejected - Delete the pending CustomerPayments to revert clearance
      await CustomerPayment.destroy({
        where: { collection_agent_amount_id: id, payment_status: 0 }
      });
    }

    return successResponse(res, statusCodes.OK, 'Submission status updated successfully', submission);
  } catch (error) {
    console.error('Error in updateCollectionSubmissionStatusService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeDirectPaymentService = async (res, user, data) => {
  try {
    const { chits_installment_id, received_amount, penalty_paid, payment_date, payment_mode, transaction_reference } = data;
    
    if (!chits_installment_id || received_amount === undefined) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Missing required payment fields');
    }

    const companyId = user.role === 'company' ? user.id : user.company_id;
    if (!companyId) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Admin company ID is required');
    }

    // Verify installment belongs to the caller's company
    const installmentInfo = await ChitsInstallment.findByPk(chits_installment_id, {
      include: [{
        model: Enrollment,
        as: 'enrollment',
        include: [{
          model: ChitsGroup,
          as: 'group',
          attributes: ['company_id']
        }]
      }]
    });

    if (!installmentInfo || !installmentInfo.enrollment || !installmentInfo.enrollment.group) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Installment not found');
    }

    if (installmentInfo.enrollment.group.company_id !== companyId) {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Unauthorized access to this installment');
    }

    const { getInstallmentBalance } = require('./installmentBalanceHelper');
    const paidSoFar = await getInstallmentBalance(chits_installment_id);
    const dueAmount = Math.max(0, parseFloat(installmentInfo.payable_amount || 0) - paidSoFar);
    
    const receivedAmountFloat = parseFloat(received_amount) || 0;
    const penaltyPaidFloat = parseFloat(penalty_paid) || 0;
    
    if (receivedAmountFloat > dueAmount + penaltyPaidFloat) {
      return errorResponse(res, statusCodes.BAD_REQUEST, `Payment exceeds the due amount. Maximum allowed is ${dueAmount + penaltyPaidFloat}`);
    }

    // Generate gapless receipt number
    const newReceiptNumber = await require('../utils/receiptGenerator').generateReceiptNumber(companyId);

    let recorded_by_name = 'Unknown';
    if (user.role === 'company') {
      const company = await Company.findByPk(user.id);
      if (company) recorded_by_name = company.company_name;
    } else {
      const staff = await StaffUser.findByPk(user.id);
      if (staff) recorded_by_name = staff.name;
    }

    const newPayment = await CustomerPayment.create({
      chits_installment_id,
      received_amount: parseFloat(received_amount) || 0.00,
      penalty_paid: parseFloat(penalty_paid) || 0.00,
      payment_status: 1, // Auto-verified for admin direct payments
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      payment_mode: parseInt(payment_mode) || 1,
      transaction_reference: transaction_reference || null,
      receipt_number: newReceiptNumber,
      recorded_by_id: user.role === 'company' ? user.id : String(user.id),
      recorded_by_role: user.role,
      recorded_by_name
    });

    return successResponse(res, statusCodes.CREATED, 'Direct payment recorded successfully', newPayment);
  } catch (error) {
    console.error('Error in storeDirectPaymentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};


const getCompanyByIdService = async (res, id, companyId) => {
  try {
    const company = await Company.findByPk(id);
    if (!company) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
    }
    const data = company.toJSON();
    if (data.country_id) data.country = await Country.findByPk(data.country_id);
    if (data.state_id) data.state = await State.findByPk(data.state_id);
    if (data.district_id) data.district = await District.findByPk(data.district_id);
    if (data.city_id) data.city = await City.findByPk(data.city_id);

    return successResponse(res, statusCodes.OK, 'Company retrieved successfully', data);
  } catch (error) {
    console.error('Error in getCompanyByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMemberByIdService = async (res, id, companyId) => {
  try {
    const member = await Member.findOne({ where: { id, company_id: companyId },
      attributes: { exclude: ['verification_otp', 'verification_otp_expires_at', 'verification_otp_attempts', 'other_info_user_password'] },
      include: [
        { model: StaticDropdownsList, as: 'title' },
        { model: StaticDropdownSubcategoryList, as: 'parental_title' },
        { model: StaticDropdownsList, as: 'gender_dropdown' },
        { model: StaticDropdownsList, as: 'occupation' },
        { model: StaticDropdownsList, as: 'emp_type' },
        { model: StaticDropdownSubcategoryList, as: 'business_type_details' }
      ]
    });
    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    }

    const memberData = member.toJSON();

    if (memberData.address_info_permanent_country_id) memberData.permanent_country = await Country.findByPk(memberData.address_info_permanent_country_id);
    if (memberData.address_info_permanent_state_id) memberData.permanent_state = await State.findByPk(memberData.address_info_permanent_state_id);
    if (memberData.address_info_permanent_district_id) memberData.permanent_district = await District.findByPk(memberData.address_info_permanent_district_id);
    if (memberData.address_info_permanent_city_id) memberData.permanent_city = await City.findByPk(memberData.address_info_permanent_city_id);

    if (memberData.address_info_office_country_id) memberData.office_country = await Country.findByPk(memberData.address_info_office_country_id);
    if (memberData.address_info_office_state_id) memberData.office_state = await State.findByPk(memberData.address_info_office_state_id);
    if (memberData.address_info_office_district_id) memberData.office_district = await District.findByPk(memberData.address_info_office_district_id);
    if (memberData.address_info_office_city_id) memberData.office_city = await City.findByPk(memberData.address_info_office_city_id);

    if (Array.isArray(memberData.introduced_as)) {
      const intIds = memberData.introduced_as.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (intIds.length > 0) {
        memberData.introduced_as_dropdown = await StaticDropdownsList.findAll({ where: { id: { [Op.in]: intIds } } });
      } else {
        memberData.introduced_as_dropdown = [];
      }
    }

    if (Array.isArray(memberData.other_info_kyc_details)) {
      const intIds = memberData.other_info_kyc_details.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (intIds.length > 0) {
        memberData.kyc_details_dropdown = await StaticDropdownsList.findAll({ where: { id: { [Op.in]: intIds } } });
      } else {
        memberData.kyc_details_dropdown = [];
      }
    }

    return successResponse(res, statusCodes.OK, 'Member retrieved successfully', memberData);
  } catch (error) {
    console.error('Error in getMemberByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getRouteByIdService = async (res, id, companyId) => {
  try {
    const route = await Route.findOne({ where: { id, company_id: companyId } });
    if (!route) return errorResponse(res, statusCodes.NOT_FOUND, 'Route not found');
    return successResponse(res, statusCodes.OK, 'Route retrieved successfully', route);
  } catch (error) {
    console.error('Error in getRouteByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAreaByIdService = async (res, id, companyId) => {
  try {
    const area = await Area.findOne({ where: { id, company_id: companyId },
      include: [{ model: Route, as: 'route' }]
    });
    if (!area) return errorResponse(res, statusCodes.NOT_FOUND, 'Area not found');
    return successResponse(res, statusCodes.OK, 'Area retrieved successfully', area);
  } catch (error) {
    console.error('Error in getAreaByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getChitsGroupByIdService = async (res, id, companyId) => {
  try {
    const group = await ChitsGroup.findOne({ where: { id, company_id: companyId } });
    if (!group) return errorResponse(res, statusCodes.NOT_FOUND, 'ChitsGroup not found');
    return successResponse(res, statusCodes.OK, 'ChitsGroup retrieved successfully', group);
  } catch (error) {
    console.error('Error in getChitsGroupByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCountryByIdService = async (res, id, companyId) => {
  try {
    const country = await Country.findByPk(id);
    if (!country) return errorResponse(res, statusCodes.NOT_FOUND, 'Country not found');
    return successResponse(res, statusCodes.OK, 'Country retrieved successfully', country);
  } catch (error) {
    console.error('Error in getCountryByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getStateByIdService = async (res, id, companyId) => {
  try {
    const state = await State.findOne({ where: { id },
      include: [{ model: Country }]
    });
    if (!state) return errorResponse(res, statusCodes.NOT_FOUND, 'State not found');
    return successResponse(res, statusCodes.OK, 'State retrieved successfully', state);
  } catch (error) {
    console.error('Error in getStateByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDistrictByIdService = async (res, id, companyId) => {
  try {
    const district = await District.findOne({ where: { id, company_id: companyId },
      include: [{ model: State }]
    });
    if (!district) return errorResponse(res, statusCodes.NOT_FOUND, 'District not found');
    return successResponse(res, statusCodes.OK, 'District retrieved successfully', district);
  } catch (error) {
    console.error('Error in getDistrictByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCityByIdService = async (res, id, companyId) => {
  try {
    const city = await City.findOne({ where: { id, company_id: companyId },
      include: [{ model: District }]
    });
    if (!city) return errorResponse(res, statusCodes.NOT_FOUND, 'City not found');
    return successResponse(res, statusCodes.OK, 'City retrieved successfully', city);
  } catch (error) {
    console.error('Error in getCityByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getEnrollmentByIdService = async (res, id, companyId) => {
  try {
    const enrollment = await Enrollment.findOne({ where: { id, company_id: companyId },
      include: [
        { model: ChitsGroup, as: 'group' },
        { model: Member, as: 'subscriber' },
        { model: Member, as: 'business_agent' },
        { model: Member, as: 'collection_agent' }
      ]
    });
    if (!enrollment) return errorResponse(res, statusCodes.NOT_FOUND, 'Enrollment not found');
    return successResponse(res, statusCodes.OK, 'Enrollment retrieved successfully', enrollment);
  } catch (error) {
    console.error('Error in getEnrollmentByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getUpcomingChitByIdService = async (res, id, companyId) => {
  try {
    const upcomingChit = await UpcomingChit.findOne({ where: { id, company_id: companyId } });
    if (!upcomingChit) return errorResponse(res, statusCodes.NOT_FOUND, 'UpcomingChit not found');
    return successResponse(res, statusCodes.OK, 'UpcomingChit retrieved successfully', upcomingChit);
  } catch (error) {
    console.error('Error in getUpcomingChitByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getSuitFileInformationByIdService = async (res, id, companyId) => {
  try {
    const info = await SuitFileInformation.findOne({ where: { id, company_id: companyId },
      include: [
        { model: Member, as: 'subscriber' },
        { model: ChitsGroup, as: 'group' }
      ]
    });
    if (!info) return errorResponse(res, statusCodes.NOT_FOUND, 'SuitFileInformation not found');
    return successResponse(res, statusCodes.OK, 'SuitFileInformation retrieved successfully', info);
  } catch (error) {
    console.error('Error in getSuitFileInformationByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAuctionByIdService = async (res, id, companyId) => {
  try {
    const auction = await Auction.findOne({ where: { id, company_id: companyId },
      include: [
        { model: ChitsGroup, as: 'group' },
        { model: Member, as: 'bidder' }
      ]
    });
    if (!auction) return errorResponse(res, statusCodes.NOT_FOUND, 'Auction not found');
    return successResponse(res, statusCodes.OK, 'Auction retrieved successfully', auction);
  } catch (error) {
    console.error('Error in getAuctionByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const changePasswordService = async (res, userPayload, old_password, new_password) => {
  try {
    const { id, role } = userPayload;
    let user;

    if (role === 'company') {
      user = await Company.findOne({ where: { id, is_deleted_status: 0 } });
      if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
      if (!(await bcrypt.compare(old_password, user.company_password))) {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Incorrect old password');
      }
      const hashedPassword = await bcrypt.hash(new_password, 10);
      await user.update({ company_password: hashedPassword });
    } else if (role === 'member') {
      user = await Member.findOne({ where: { id, is_deleted_status: 0 } });
      if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
      if (!(await bcrypt.compare(old_password, user.other_info_user_password))) {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Incorrect old password');
      }
      const hashedPassword = await bcrypt.hash(new_password, 10);
      await user.update({ other_info_user_password: hashedPassword });
    } else {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Unsupported user role');
    }

    return successResponse(res, statusCodes.OK, 'Password updated successfully');
  } catch (error) {
    console.error('Error in changePasswordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to change password');
  }
};

const storeOrUpdateContactUsService = async (res, data = {}) => {
  try {
    const { id, ...contactData } = data;
    if (!contactData.company_id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Company ID is required');
    }
    if (id) {
      const contact = await ContactUs.findOne({ where: { id, is_deleted_status: 0 } });
      if (!contact) return errorResponse(res, statusCodes.NOT_FOUND, 'Contact record not found');
      await contact.update(contactData);
      return successResponse(res, statusCodes.OK, 'Contact record updated successfully', contact);
    } else {
      const newContact = await ContactUs.create(contactData);
      return successResponse(res, statusCodes.CREATED, 'Contact record created successfully', newContact);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateContactUsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllContactUsService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && {
        [Op.or]: [
          { address: { [Op.like]: `%${search}%` } },
          { website_link: { [Op.like]: `%${search}%` } }
        ]
      })
    };

    const contacts = await ContactUs.findAndCountAll({
      limit,
      offset,
      where,
      include: [{ model: Company, as: 'company', attributes: ['company_name'] }],
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Contact records retrieved successfully', contacts);
  } catch (error) {
    console.error('Error in getAllContactUsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getContactUsByIdService = async (res, id, companyId) => {
  try {
    const contact = await ContactUs.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 },
      include: [{ model: Company, as: 'company', attributes: ['company_name'] }]
    });
    if (!contact) return errorResponse(res, statusCodes.NOT_FOUND, 'Contact record not found');
    return successResponse(res, statusCodes.OK, 'Contact record retrieved successfully', contact);
  } catch (error) {
    console.error('Error in getContactUsByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteContactUsService = async (res, id, companyId) => {
  try {
    const contact = await ContactUs.findOne({ where: { id, company_id: companyId, is_deleted_status: 0 } });
    if (!contact) return errorResponse(res, statusCodes.NOT_FOUND, 'Contact record not found');
    await contact.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Contact record deleted successfully');
  } catch (error) {
    console.error('Error in deleteContactUsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateFAQService = async (res, data = {}) => {
  try {
    const { id, ...faqData } = data;
    if (!faqData.company_id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Company ID is required');
    }
    if (id) {
      const faq = await FAQ.findOne({ where: { id, is_deleted_status: 0 } });
      if (!faq) return errorResponse(res, statusCodes.NOT_FOUND, 'FAQ not found');
      await faq.update(faqData);
      return successResponse(res, statusCodes.OK, 'FAQ updated successfully', faq);
    } else {
      const newFaq = await FAQ.create(faqData);
      return successResponse(res, statusCodes.CREATED, 'FAQ created successfully', newFaq);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateFAQService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllFAQService = async (res, company_id, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = {
      is_deleted_status: 0,
        
        ...(company_id && company_id !== '' && { company_id }),
      ...(search && {
        [Op.or]: [
          { question: { [Op.like]: `%${search}%` } },
          { answer: { [Op.like]: `%${search}%` } }
        ]
      })
    };
    const faqs = await FAQ.findAndCountAll({
      limit,
      offset,
      where,
      include: [{ model: Company, as: 'company', attributes: ['company_name'] }],
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'FAQs retrieved successfully', faqs);
  } catch (error) {
    console.error('Error in getAllFAQService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getFAQByIdService = async (res, id, companyId) => {
  try {
    const faq = await FAQ.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 },
      include: [{ model: Company, as: 'company', attributes: ['company_name'] }]
    });
    if (!faq) return errorResponse(res, statusCodes.NOT_FOUND, 'FAQ not found');
    return successResponse(res, statusCodes.OK, 'FAQ retrieved successfully', faq);
  } catch (error) {
    console.error('Error in getFAQByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteFAQService = async (res, id, companyId) => {
  try {
    const faq = await FAQ.findOne({ where: { id, company_id: companyId, is_deleted_status: 0 } });
    if (!faq) return errorResponse(res, statusCodes.NOT_FOUND, 'FAQ not found');
    await faq.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'FAQ deleted successfully');
  } catch (error) {
    console.error('Error in deleteFAQService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateTermsPrivacyService = async (res, company_id, type, content) => {
  try {
    if (!company_id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Company ID is required');
    }
    const existing = await TermsPrivacy.findOne({
      where: { company_id, type, is_deleted_status: 0 }
    });

    if (existing) {
      await existing.update({ content });
      return successResponse(res, statusCodes.OK, 'Terms/Privacy record updated successfully', existing);
    } else {
      const newRecord = await TermsPrivacy.create({ company_id, type, content });
      return successResponse(res, statusCodes.CREATED, 'Terms/Privacy record created successfully', newRecord);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateTermsPrivacyService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getTermsPrivacyService = async (res, company_id, type) => {
  try {
    if (!company_id) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Company ID is required');
    }
    const record = await TermsPrivacy.findOne({
      where: { company_id, type, is_deleted_status: 0 },
      include: [{ model: Company, as: 'company', attributes: ['company_name'] }]
    });
    if (!record) {
      const label = type === 1 ? 'Terms & Conditions' : 'Privacy Policy';
      return successResponse(res, statusCodes.OK, `${label} record not found for this company`, null);
    }
    return successResponse(res, statusCodes.OK, 'Terms/Privacy record retrieved successfully', record);
  } catch (error) {
    console.error('Error in getTermsPrivacyService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const logoutService = async (req, res, userPayload) => {
  try {
    const { id, role } = userPayload;
    const companyId = await resolveCompanyIdForAuth(userPayload);
    
    if (role === 'company') {
      const user = await Company.findOne({ where: { id } });
      if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'Company not found');
      await user.update({ device_id: null, device_unique_id: null });
    } else if (role === 'member') {
      const user = await Member.findOne({ where: { id, company_id: companyId } });
      if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
      await user.update({ device_id: null, device_unique_id: null, fcm_token: null });
    } else if (role === 'staff' || role === 'collection_agent' || role === 'business_agent') {
      const user = await StaffUser.findOne({ where: { id, company_id: companyId } });
      if (user) await user.update({ fcm_token: null });
    } else {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid user role for logout');
    }

    // Revoke the token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token);
      let expires_at = new Date();
      if (decoded && decoded.exp) {
        expires_at = new Date(decoded.exp * 1000);
      } else {
        expires_at.setDate(expires_at.getDate() + 1); // fallback 1 day
      }

      const { RevokedToken } = require('../models');
      await RevokedToken.create({ token, expires_at });
    }

    return successResponse(res, statusCodes.OK, 'Logged out successfully');
  } catch (error) {
    console.error('Error in logoutService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to log out');
  }
};

const getAllCollectionSubmissionsService = async (res, collection_agent_id, type, min, max, companyId) => {
  try {
    const whereClause = {};
    if (collection_agent_id) {
      whereClause.collection_agent_id = collection_agent_id;
    }
    // 1 - all, 2 - pending, 3 - verified, 4 - rejected
    if (type === 2) whereClause.status = { [Op.in]: [0, 1] }; // pending
    if (type === 3) whereClause.status = 2; // verified
    if (type === 4) whereClause.status = 3; // rejected

    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const submissionsData = await CollectionAgentAmount.findAndCountAll({
      where: whereClause,
      include: [
        { model: Member, as: 'member' },
        { 
          model: Member, 
          as: 'collection_agent',
          where: companyId ? { company_id: companyId } : undefined,
          required: !!companyId
        }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const submissions = submissionsData.rows;
    const count = submissionsData.count;

    // Get group names for each member
    const memberIds = submissions.map(s => s.member_id).filter(id => id);
    const enrollments = await Enrollment.findAll({
      where: { subscriber_id: { [Op.in]: memberIds }, delete_status: 0 },
      include: [{ model: ChitsGroup, as: 'group' }]
    });

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };

    const getPaymentMethod = (type) => {
      switch (type) {
        case 1: return 'Cash';
        case 2: return 'UPI';
        case 3: return 'Cheque';
        case 4: return 'Bank';
        default: return 'Others';
      }
    };

    const getStatusStr = (status) => {
      switch (status) {
        case 0: return 'Pending';
        case 1: return 'Pending';
        case 2: return 'Verified';
        case 3: return 'Rejected';
        default: return 'Unknown';
      }
    };

    const formatted = submissions.map(sub => {
      let amount = 0;
      if (sub.cash && sub.cash.amount) {
        amount = sub.cash.amount;
      } else if (sub.bank_details && sub.bank_details.amount) {
        amount = sub.bank_details.amount;
      }

      const memberEnrollments = enrollments.filter(e => e.subscriber_id === sub.member_id);
      const groupNames = memberEnrollments.map(e => e.group ? e.group.group_name : '').join(', ');

      const statusStr = getStatusStr(sub.status);
      let status_note = `Submitted on ${formatDate(sub.createdAt)}`;
      if (sub.status === 2 && sub.confirm_date) {
        status_note = `Verified on ${formatDate(sub.confirm_date)}`;
      } else if (sub.status === 3 && sub.confirm_date) {
        status_note = `Rejected on ${formatDate(sub.confirm_date)}`;
      }

      let collection_id_value = 'Unknown';
      if (sub.collection_agent && sub.collection_agent.other_info_user_code) {
        collection_id_value = sub.collection_agent.other_info_user_code.toString();
      } else if (sub.collection_agent_id) {
        collection_id_value = sub.collection_agent_id.toString();
      }

      return {
        id: sub.id,
        member_name: sub.member ? sub.member.name : 'Unknown',
        gender: sub.member ? sub.member.gender : null,
        profile_image: sub.member ? sub.member.upload_image : '',
        group_name: groupNames || 'No Group',
        amount,
        method: getPaymentMethod(sub.payment_type),
        date: formatDate(sub.createdAt),
        collection_id: collection_id_value,
        status: statusStr,
        status_note,
        denominations: sub.cash?.denominations || null,
        transaction_ref: sub.transaction_id || sub.cheque_number || null
      };
    });

    return successResponse(res, statusCodes.OK, 'Submissions retrieved successfully', { count, rows: formatted });
  } catch (error) {
    console.error('Error in getAllCollectionSubmissionsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateGalleryService = async (res, reqBody, userPayload) => {
  try {
    const { id, gallery_image, status } = reqBody;
    const company_id = await resolveCompanyIdForAuth(userPayload);

    if (id) {
      // Update
      const gallery = await Gallery.findOne({ where: { id, company_id: companyId } });
      if (!gallery) return errorResponse(res, statusCodes.NOT_FOUND, 'Gallery record not found');

      await gallery.update({ gallery_image, status });
      return successResponse(res, statusCodes.OK, 'Gallery updated successfully', gallery);
    } else {
      // Store
      const gallery = await Gallery.create({
        company_id,
        gallery_image,
        status: status || 0
      });
      return successResponse(res, statusCodes.CREATED, 'Gallery added successfully', gallery);
    }
  } catch (error) {
    console.error('Error in storeOrUpdateGalleryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllGalleryService = async (res, reqBody) => {
  try {
    const { company_id, min = 0, max = 10, status } = reqBody;
    const limit = parseInt(max, 10);
    const offset = parseInt(min, 10);

    const whereClause = {};
    if (company_id) whereClause.company_id = company_id;
    if (status !== undefined) whereClause.status = status;

    const galleries = await Gallery.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Galleries retrieved successfully', galleries);
  } catch (error) {
    console.error('Error in getAllGalleryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getGalleryByIdService = async (res, id, companyId) => {
  try {
    const gallery = await Gallery.findOne({ where: { id, company_id: companyId } });
    if (!gallery) return errorResponse(res, statusCodes.NOT_FOUND, 'Gallery record not found');
    return successResponse(res, statusCodes.OK, 'Gallery retrieved successfully', gallery);
  } catch (error) {
    console.error('Error in getGalleryByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteGalleryService = async (res, id, companyId) => {
  try {
    const gallery = await Gallery.findOne({ where: { id, company_id: companyId } });
    if (!gallery) return errorResponse(res, statusCodes.NOT_FOUND, 'Gallery record not found');

    await gallery.destroy();
    return successResponse(res, statusCodes.OK, 'Gallery deleted successfully');
  } catch (error) {
    console.error('Error in deleteGalleryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const sendMemberVerificationOtpService = async (res, member_id) => {
  try {
    const member = await Member.findOne({ where: { id: member_id, is_deleted_status: 0 } });
    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    }

    const now = new Date();
    if (member.verification_otp_expires_at) {
      const expiresAt = new Date(member.verification_otp_expires_at);
      const diffMs = expiresAt - now;
      if (diffMs > 4 * 60 * 1000) { // If remaining time is > 4 mins, it was sent < 1 min ago
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Please wait before requesting another OTP');
      }
    }

    const otp = '123456';
    const expiry = new Date(now.getTime() + 5 * 60 * 1000);

    await member.update({
      verification_otp: otp,
      verification_otp_expires_at: expiry,
      verification_otp_attempts: 0
    });

    console.log(`[SMS MOCK] Member ID: ${member_id}, Mobile: ${member.mobile_number}, OTP: ${otp}`);

    const maskedMobile = member.mobile_number ? member.mobile_number.replace(/.(?=.{2})/g, 'x') : null;
    return successResponse(res, statusCodes.OK, 'OTP sent successfully', { member_id, mobile_number_masked: maskedMobile });
  } catch (error) {
    console.error('Error in sendMemberVerificationOtpService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const verifyMemberOtpService = async (res, member_id, otp) => {
  try {
    const member = await Member.findOne({ where: { id: member_id, is_deleted_status: 0 } });
    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    }

    if (!member.verification_otp) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'No OTP has been sent for this member');
    }

    if (member.verification_otp_attempts >= 3) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Too many failed attempts. Please request a new OTP after 15 minutes.');
    }

    const now = new Date();
    if (now > new Date(member.verification_otp_expires_at)) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'OTP has expired, please resend');
    }

    if (member.verification_otp !== otp) {
      const attempts = member.verification_otp_attempts + 1;
      let updateData = { verification_otp_attempts: attempts };
      if (attempts >= 3) {
        updateData.verification_otp_expires_at = new Date(now.getTime() + 15 * 60 * 1000); // 15 min lockout
      }
      await member.update(updateData);
      const remaining = 3 - attempts;
      return errorResponse(res, statusCodes.BAD_REQUEST, `Invalid OTP. ${remaining} attempts remaining.`);
    }

    await member.update({
      is_verified: true,
      verification_otp: null,
      verification_otp_expires_at: null,
      verification_otp_attempts: 0
    });

    return successResponse(res, statusCodes.OK, 'Member verified successfully', { member_id, is_verified: true });
  } catch (error) {
    console.error('Error in verifyMemberOtpService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const generateUniqueStaffUserCode = async () => {
  let userCode;
  let exists = true;
  while (exists) {
    userCode = Math.floor(100000 + Math.random() * 900000);
    const count = await StaffUser.count({ where: { user_code: userCode } });
    if (count === 0) exists = false;
  }
  return userCode;
};

const storeOrUpdateStaffService = async (res, data = {}, userToken) => {
  try {
    if (!userToken || userToken.role !== 'company') {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can manage staff users');
    }
    const { id, password, ...staffData } = data;
    const companyId = userToken.id;

    if (id) {
      const staff = await StaffUser.findOne({ where: { id, company_id: companyId } });
      if (!staff) return errorResponse(res, statusCodes.NOT_FOUND, 'Staff user not found');
      await staff.update(staffData);
      return successResponse(res, statusCodes.OK, 'Staff user updated successfully', staff);
    }

    const user_code = await generateUniqueStaffUserCode();
    const newStaff = await StaffUser.create({ ...staffData, password, user_code, company_id: companyId });
    return successResponse(res, statusCodes.CREATED, 'Staff user created successfully', newStaff);
  } catch (error) {
    console.error('Error in storeOrUpdateStaffService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllStaffService = async (res, companyId, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = { company_id: companyId, is_deleted_status: 0 };
    if (search) {
      where[Op.or] = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        sequelize.where(sequelize.cast(sequelize.col('user_code'), 'varchar'), { [Op.like]: `%${search}%` }),
      ];
    }
    const staffUsers = await StaffUser.findAndCountAll({
      where,
      limit,
      offset,
      attributes: { exclude: ['password', 'otp'] },
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'Staff users retrieved successfully', staffUsers);
  } catch (error) {
    console.error('Error in getAllStaffService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getStaffByIdService = async (res, id, companyId) => {
  try {
    const staff = await StaffUser.findOne({
      where: { id, company_id: companyId, is_deleted_status: 0 },
      attributes: { exclude: ['password', 'otp'] },
      include: [{ model: Role, as: 'role' }]
    });
    if (!staff) return errorResponse(res, statusCodes.NOT_FOUND, 'Staff user not found');
    return successResponse(res, statusCodes.OK, 'Staff user retrieved successfully', staff);
  } catch (error) {
    console.error('Error in getStaffByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteStaffService = async (res, id, companyId, userToken) => {
  try {
    if (!userToken || userToken.role !== 'company') {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can delete staff users');
    }
    const staff = await StaffUser.findOne({ where: { id, company_id: companyId } });
    if (!staff) return errorResponse(res, statusCodes.NOT_FOUND, 'Staff user not found');
    await staff.update({ is_deleted_status: 1 });
    return successResponse(res, statusCodes.OK, 'Staff user deleted successfully');
  } catch (error) {
    console.error('Error in deleteStaffService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const staffChangePasswordService = async (res, userToken, member_id, new_password) => {
  try {
    if (!userToken || userToken.role !== 'company') {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can reset staff passwords');
    }
    const staff = await StaffUser.findOne({ where: { id: member_id, company_id: userToken.id } });
    if (!staff) return errorResponse(res, statusCodes.NOT_FOUND, 'Staff user not found');
    await staff.update({ password: new_password });
    return successResponse(res, statusCodes.OK, 'Password updated successfully');
  } catch (error) {
    console.error('Error in staffChangePasswordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateRoleService = async (res, data = {}, userToken) => {
  try {
    if (!userToken || userToken.role !== 'company') {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can manage roles');
    }
    const { id, ...roleData } = data;
    const companyId = userToken.id;

    if (id) {
      const role = await Role.findOne({ where: { id, company_id: companyId } });
      if (!role) return errorResponse(res, statusCodes.NOT_FOUND, 'Role not found');
      await role.update(roleData);
      return successResponse(res, statusCodes.OK, 'Role updated successfully', role);
    }

    const newRole = await Role.create({ ...roleData, company_id: companyId });
    return successResponse(res, statusCodes.CREATED, 'Role created successfully', newRole);
  } catch (error) {
    console.error('Error in storeOrUpdateRoleService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllRoleService = async (res, companyId, min, max, search) => {
  try {
    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;
    const where = { company_id: companyId, status: 1 };
    if (search) {
      where.name = { [Op.like]: `%${search}%` };
    }
    const roles = await Role.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, statusCodes.OK, 'Roles retrieved successfully', roles);
  } catch (error) {
    console.error('Error in getAllRoleService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getRoleByIdService = async (res, id, companyId) => {
  try {
    const role = await Role.findOne({ where: { id, company_id: companyId, status: 1 } });
    if (!role) return errorResponse(res, statusCodes.NOT_FOUND, 'Role not found');
    return successResponse(res, statusCodes.OK, 'Role retrieved successfully', role);
  } catch (error) {
    console.error('Error in getRoleByIdService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteRoleService = async (res, id, companyId, userToken) => {
  try {
    if (!userToken || userToken.role !== 'company') {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can delete roles');
    }
    const role = await Role.findOne({ where: { id, company_id: companyId } });
    if (!role) return errorResponse(res, statusCodes.NOT_FOUND, 'Role not found');
    
    const assignedStaffCount = await StaffUser.count({ where: { role_id: id, is_deleted_status: 0 } });
    if (assignedStaffCount > 0) {
      return errorResponse(res, statusCodes.BAD_REQUEST, `Cannot delete this role — ${assignedStaffCount} staff user(s) are still assigned to it`);
    }

    await role.update({ status: 0 });
    return successResponse(res, statusCodes.OK, 'Role deleted successfully');
  } catch (error) {
    console.error('Error in deleteRoleService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getDashboardSummaryService = async (res, companyId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    // 1. collection_today & collection_month
    // NOTE: Falling back to createdAt because payment_date migration has not shipped yet.
    const collectionToday = await CustomerPayment.sum('received_amount', {
      where: {
        payment_status: 1,
        createdAt: { [Op.gte]: today }
      },
      include: [{
        model: ChitsInstallment, as: 'installment', required: true, attributes: [],
        include: [{ model: Enrollment, as: 'enrollment', where: { company_id: companyId }, required: true, attributes: [] }]
      }]
    });

    const collectionMonth = await CustomerPayment.sum('received_amount', {
      where: {
        payment_status: 1,
        createdAt: { [Op.gte]: firstDayOfMonth }
      },
      include: [{
        model: ChitsInstallment, as: 'installment', required: true, attributes: [],
        include: [{ model: Enrollment, as: 'enrollment', where: { company_id: companyId }, required: true, attributes: [] }]
      }]
    });

    // 2. outstanding_dues & defaulters_count
    const pendingInstallments = await ChitsInstallment.findAll({
      where: {
        id: {
          [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
        }
      },
      include: [{
        model: Enrollment,
        as: 'enrollment',
        where: { company_id: companyId, delete_status: 0 },
        required: true,
        include: [{
          model: ChitsGroup,
          as: 'group',
          where: { chits_group_status: 1, is_deleted_status: 0 }, // Only started groups
          required: true
        }]
      }]
    });

    let outstandingDues = 0;
    const defaulterMembers = new Set();
    
    pendingInstallments.forEach(inst => {
      outstandingDues += (parseFloat(inst.payable_amount) || 0);
      if (inst.due_date) {
        const dueDate = new Date(inst.due_date);
        dueDate.setHours(0,0,0,0);
        if (dueDate < today) {
          defaulterMembers.add(inst.enrollment.subscriber_id);
        }
      }
    });

    // 3. commission_earned & dividend_distributed
    const commissionEarned = await Auction.sum('company_commission', { where: { company_id: companyId } });
    const dividendDistributed = await Auction.sum('dividend_payable', { where: { company_id: companyId } });

    // 4. Statistics
    const activeMembersCount = await Member.count({ where: { company_id: companyId, is_deleted_status: 0 } });
    const activeGroupsCount = await ChitsGroup.count({ where: { company_id: companyId, chits_group_status: 1, is_deleted_status: 0 } });
    const newEnrollmentsCount = await Enrollment.count({
      where: { company_id: companyId, delete_status: 0, createdAt: { [Op.gte]: firstDayOfMonth } }
    });

    // 5. Alerts
    const upcomingAuctions = await ChitsGroup.findAll({
      where: { company_id: companyId, auction_date: { [Op.between]: [today.toISOString().split('T')[0], nextWeek.toISOString().split('T')[0]] }, is_deleted_status: 0 },
      attributes: ['group_name', 'auction_date'],
      limit: 10,
      order: [['auction_date', 'ASC']]
    });

    const installmentsDueThisWeek = await ChitsInstallment.count({
      where: {
        due_date: { [Op.between]: [today.toISOString().split('T')[0], nextWeek.toISOString().split('T')[0]] },
        id: {
          [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
        }
      },
      include: [{ model: Enrollment, as: 'enrollment', where: { company_id: companyId, delete_status: 0 }, required: true }]
    });

    // 6. Leaderboards
    const topCollectionAgents = await CustomerPayment.findAll({
      attributes: [
        [sequelize.col('collection_submission.collection_agent_id'), 'collection_agent_id'],
        [sequelize.fn('sum', sequelize.col('CustomerPayment.received_amount')), 'collected_amount'],
        [sequelize.col('collection_submission->collection_agent.id'), 'agent_id'],
        [sequelize.col('collection_submission->collection_agent.name'), 'agent_name']
      ],
      where: {
        payment_status: 1,
        createdAt: { [Op.gte]: firstDayOfMonth }
      },
      include: [{
        model: CollectionAgentAmount,
        as: 'collection_submission',
        required: true,
        attributes: [],
        include: [{
          model: Member,
          as: 'collection_agent',
          where: { company_id: companyId },
          required: true,
          attributes: []
        }]
      }],
      group: [
        'collection_submission.collection_agent_id',
        'collection_submission->collection_agent.id',
        'collection_submission->collection_agent.name'
      ],
      order: [[sequelize.literal('collected_amount'), 'DESC']],
      limit: 5,
      raw: true
    });

    const topAgents = topCollectionAgents.map(a => ({
      collection_agent_id: a.collection_agent_id || a.agent_id,
      agent_name: a.agent_name || 'Unknown',
      collected_amount: parseFloat(a.collected_amount || 0)
    }));

    // 7. Charts
    const monthlyCollections = await CustomerPayment.findAll({
      attributes: [
        [sequelize.literal('EXTRACT(MONTH FROM "CustomerPayment"."createdAt")'), 'month'],
        [sequelize.literal('EXTRACT(YEAR FROM "CustomerPayment"."createdAt")'), 'year'],
        [sequelize.fn('sum', sequelize.literal('received_amount + penalty_paid')), 'amount']
      ],
      where: { payment_status: 1 },
      include: [{
        model: ChitsInstallment, as: 'installment', attributes: [], required: true,
        include: [{ model: Enrollment, as: 'enrollment', attributes: [], where: { company_id: companyId }, required: true }]
      }],
      group: ['year', 'month'],
      order: [['year', 'DESC'], ['month', 'DESC']],
      limit: 6
    });

    const groupStatusCounts = await ChitsGroup.findAll({
      attributes: [
        'chits_group_status',
        [sequelize.fn('count', sequelize.col('id')), 'count']
      ],
      where: { company_id: companyId, is_deleted_status: 0 },
      group: ['chits_group_status']
    });

    let not_started = 0, running = 0, completed = 0;
    groupStatusCounts.forEach(g => {
      if (g.chits_group_status === 0) not_started = parseInt(g.get('count'), 10);
      else if (g.chits_group_status === 1) running = parseInt(g.get('count'), 10);
      else if (g.chits_group_status === 2) completed = parseInt(g.get('count'), 10);
    });

    return successResponse(res, statusCodes.OK, 'Dashboard data retrieved successfully', {
      financials: {
        collection_today: collectionToday || 0,
        collection_month: collectionMonth || 0,
        outstanding_dues: outstandingDues, 
        commission_earned: commissionEarned || 0,
        dividend_distributed: dividendDistributed || 0
      },
      statistics: {
        total_active_members: activeMembersCount || 0,
        active_chit_groups: activeGroupsCount || 0,
        new_enrollments_this_month: newEnrollmentsCount || 0,
        available_group_capacity: 0 // Will implement with slot_filled_count logic later if needed
      },
      alerts: {
        upcoming_auctions: upcomingAuctions.map(g => ({ group_name: g.group_name, auction_date: g.auction_date })),
        installments_due_this_week: installmentsDueThisWeek || 0,
        defaulters_count: defaulterMembers.size
      },
      leaderboards: {
        top_collection_agents: topAgents || [],
        top_business_agents: [] 
      },
      charts: {
        monthly_collections: monthlyCollections.map(m => ({ month: m.get('month'), year: m.get('year'), amount: parseFloat(m.get('amount') || 0) })),
        group_status: {
          not_started,
          running,
          completed
        }
      }
    });
  } catch (error) {
    console.error('Error in getDashboardSummaryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const fcmService = require('./fcmService');

const registerAdminTokenService = async (res, userPayload, fcm_token) => {
  try {
    if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
    await StaffUser.update({ fcm_token }, { where: { id: userPayload.id } });
    return successResponse(res, statusCodes.OK, 'Admin device token registered successfully');
  } catch (error) {
    console.error('Error in registerAdminTokenService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const sendManualNotificationService = async (res, userPayload, data) => {
  try {
    if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
    
    const { target_type, target_id, title, body, data_payload } = data;
    const companyId = userPayload.company_id;

    if (target_type === 'ALL') {
      const allMembers = await Member.findAll({ where: { company_id: companyId, is_deleted_status: 0, fcm_token: { [Op.ne]: null } } });
      fcmService.sendPushToMulticast(allMembers, companyId, title, body, data_payload);
    } else if (target_type === 'SPECIFIC_MEMBER') {
      const member = await Member.findOne({ where: { id: target_id, company_id: companyId, is_deleted_status: 0 } });
      if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
      fcmService.sendPushToMember(member, title, body, data_payload);
    } else if (target_type === 'GROUP') {
      const enrollments = await Enrollment.findAll({
        where: { group_id: target_id, company_id: companyId, delete_status: 0 },
        include: [{ model: Member, as: 'subscriber', where: { is_deleted_status: 0, fcm_token: { [Op.ne]: null } }, required: true }]
      });
      const members = enrollments.map(e => e.subscriber);
      fcmService.sendPushToMulticast(members, companyId, title, body, data_payload);
    }

    return successResponse(res, statusCodes.OK, 'Notification sending triggered successfully');
  } catch (error) {
    console.error('Error in sendManualNotificationService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMemberDocumentsAdminService = async (res, group_id, member_id) => {
  try {
    const docRecord = await MemberDocument.findOne({
      where: { group_id, member_id }
    });

    let documents = docRecord && docRecord.documents ? docRecord.documents : {};

    const types = ['aadhar', 'bank_id', 'upi_details', 'certificates'];
    const result = types.map(type => {
      const doc = documents[type] || { url: null, status: null };
      return {
        document_type: type,
        document_url: doc.url,
        status: doc.status
      };
    });

    return successResponse(res, statusCodes.OK, 'Member documents retrieved', { documents: result });
  } catch (error) {
    console.error('Error in getMemberDocumentsAdminService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const verifyMemberDocumentService = async (res, payload) => {
  try {
    const { group_id, member_id, document_type, status } = payload;

    const docRecord = await MemberDocument.findOne({
      where: { group_id, member_id }
    });

    if (!docRecord || !docRecord.documents) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Documents not found for this member and group');
    }

    let documents = { ...docRecord.documents };

    if (!documents[document_type]) {
      return errorResponse(res, statusCodes.NOT_FOUND, `Document of type ${document_type} not found`);
    }

    documents[document_type].status = status;

    await docRecord.update({ documents });

    return successResponse(res, statusCodes.OK, 'Document status updated successfully', { documents: docRecord.documents });
  } catch (error) {
    console.error('Error in verifyMemberDocumentService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllAuditLogsService = async (res, user_id, action_type, min, max, search, company_id) => {
  try {
    const whereCondition = {};
    if (user_id) whereCondition.user_id = user_id;
    if (action_type) whereCondition.action_type = action_type;
    if (company_id) whereCondition.company_id = company_id;

    if (search) {
      whereCondition[Op.or] = [
        { module_or_route: { [Op.iLike]: `%${search}%` } },
        { action_type: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Set pagination limits
    const limit = max ? parseInt(max) : 10;
    const offset = min ? parseInt(min) : 0;

    const { count, rows } = await AuditLog.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return successResponse(res, statusCodes.OK, 'Audit logs retrieved successfully', {
      total: count,
      auditLogs: rows
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllReceiptsService = async (res, companyId, filters = {}) => {
  try {
    const { min = 0, max = 20, source, group_id, member_id, payment_mode, date_from, date_to, search } = filters;

    const where = { payment_status: 1 };
    if (payment_mode) where.payment_mode = payment_mode;
    if (date_from || date_to) {
      where.payment_date = {};
      if (date_from) where.payment_date[Op.gte] = date_from;
      if (date_to) where.payment_date[Op.lte] = date_to;
    }
    if (source === 'direct') where.collection_agent_amount_id = null;
    if (source === 'collection_agent') where.collection_agent_amount_id = { [Op.ne]: null };

    if (search) {
      where[Op.or] = [
        { receipt_number: { [Op.like]: `%${search}%` } },
        { transaction_reference: { [Op.like]: `%${search}%` } },
        // To support searching by member/group name gracefully without breaking counts:
        sequelize.where(sequelize.col('installment.enrollment.subscriber.name'), { [Op.like]: `%${search}%` }),
        sequelize.where(sequelize.col('installment.enrollment.group.group_name'), { [Op.like]: `%${search}%` }),
      ];
    }

    const { count, rows } = await CustomerPayment.findAndCountAll({
      where,
      include: [
        {
          model: ChitsInstallment,
          as: 'installment',
          required: true,
          include: [{
            model: Enrollment,
            as: 'enrollment',
            required: true,
            where: { company_id: companyId, ...(member_id && { subscriber_id: member_id }) },
            include: [
              { model: Member, as: 'subscriber', attributes: ['id', 'name'] },
              { 
                model: ChitsGroup, 
                as: 'group', 
                attributes: ['id', 'group_name'], 
                ...(group_id && { where: { id: group_id } }) 
              }
            ]
          }]
        },
        {
          model: CollectionAgentAmount,
          as: 'collection_submission',
          required: false,
          include: [{ model: Member, as: 'collection_agent', attributes: ['id', 'name'] }]
        }
      ],
      limit: parseInt(max, 10) || 20,
      offset: parseInt(min, 10) || 0,
      order: [['payment_date', 'DESC'], ['createdAt', 'DESC']],
      subQuery: false
    });

    const formatted = rows.map(p => {
      const isDirect = !p.collection_agent_amount_id;
      return {
        id: p.id,
        receipt_number: p.receipt_number,
        payment_date: p.payment_date,
        payment_mode: p.payment_mode,
        transaction_reference: p.transaction_reference,
        received_amount: p.received_amount,
        penalty_paid: p.penalty_paid,
        total_paid: (parseFloat(p.received_amount || 0) + parseFloat(p.penalty_paid || 0)).toFixed(2),
        member_name: p.installment?.enrollment?.subscriber?.name || null,
        group_name: p.installment?.enrollment?.group?.group_name || null,
        installment_no: p.installment?.installment_no || null,
        source: isDirect ? 'direct' : 'collection_agent',
        recorded_by: isDirect
          ? { name: p.recorded_by_name, role: p.recorded_by_role }
          : { name: p.collection_submission?.verified_by_name, role: p.collection_submission?.verified_by_role },
        collected_by: isDirect ? null : { name: p.collection_submission?.collection_agent?.name || null },
      };
    });

    return successResponse(res, statusCodes.OK, 'Receipts retrieved successfully', { count, rows: formatted });
  } catch (error) {
    console.error('Error in getAllReceiptsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdateFAQService,
  getAllFAQService,
  getFAQByIdService,
  deleteFAQService,
  storeOrUpdateTermsPrivacyService,
  getTermsPrivacyService,
  logoutService,
  storeOrUpdateContactUsService,
  getAllContactUsService,
  getContactUsByIdService,
  deleteContactUsService,
  changePasswordService,
  loginAdminService,
  loginCompanyService,
  forgotPasswordService,
  verifyOtpService,
  resetPasswordService,
  refreshTokenService,
  generateUniqueUserCode,
  storeOrUpdateCompanyService,
  getAllCompanyDetailsService,
  deleteCompanyService,
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
  updateChitsGroupStatusService,
  checkChitsGroupCapacityService,
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
  getPositionNumbersService,
  storeOrUpdateUpcomingChitService,
  getAllUpcomingChitsService,
  deleteUpcomingChitService,
  updateFavoritesService,
  getGroupMembersService,
  getInstallmentsByGroupService,
  storeOrUpdateSuitFileInformationService,
  getAllSuitFileInformationService,
  deleteSuitFileInformationService,
  storeOrUpdateAuctionService,
  recordWinnerService,
  getAllAuctionsService,
  deleteAuctionService,
  getAllSubcategoriesService,
  getAgentByAgentTypeService,
  getAgentEnrollmentsService,
  storeOrUpdateAgentTargetEntryService,
  getFilteredMembersByGroupAndAgentService,
  transferAgentUpdateService,
  getBusinessListUnderMembersService,
  getAllGroupUnderStaticListsService,
  getCompanyByIdService,
  getMemberByIdService,
  getRouteByIdService,
  getAreaByIdService,
  getChitsGroupByIdService,
  getCountryByIdService,
  getStateByIdService,
  getDistrictByIdService,
  getCityByIdService,
  getEnrollmentByIdService,
  getUpcomingChitByIdService,
  getSuitFileInformationByIdService,
  getAuctionByIdService,
  resolveCompanyIdForAssociation,
  resolveCompanyIdForAuth,
  storeOrUpdateGroupUnderStaticListService,
  deleteGroupUnderStaticListService,
  getGroupUnderStaticListByIdService,
  storeOrUpdateAccountCreationDetailService,
  getAllAccountCreationDetailsService,
  getAllAccountTreeService,
  getAccountCreationDetailByIdService,
  deleteAccountCreationDetailService,
  bulkEditAccountCreationDetailsService,
  storeOrUpdateSelfChitService,
  getAllSelfChitDetailsService,
  getSelfChitByIdService,
  deleteSelfChitService,
  storeOrUpdateConfigureBusinessAgentCommissionService,
  getAllConfigureBusinessAgentCommissionsService,
  getConfigureBusinessAgentCommissionByIdService,
  deleteConfigureBusinessAgentCommissionService,
  storeOrUpdateHistoryBusinessAgentService,
  getAllHistoryBusinessAgentsService,
  getHistoryBusinessAgentByIdService,
  deleteHistoryBusinessAgentService,
  getBusinessAgentCommissionSummaryService,
  getHistoryByGroupIdService,
  updateCollectionSubmissionStatusService,
  getAllCollectionSubmissionsService,
  storeDirectPaymentService,
  storeOrUpdateGalleryService,
  getAllGalleryService,
  getGalleryByIdService,
  deleteGalleryService,
  recordWinnerService,
  sendMemberVerificationOtpService,
  verifyMemberOtpService,
  storeOrUpdateStaffService,
  getAllStaffService,
  getStaffByIdService,
  deleteStaffService,
  staffChangePasswordService,
  storeOrUpdateRoleService,
  getAllRoleService,
  getRoleByIdService,
  deleteRoleService,
  getDashboardSummaryService,
  registerAdminTokenService,
  sendManualNotificationService,
  getAllAuditLogsService,
  getMemberDocumentsAdminService,
  verifyMemberDocumentService,
  getAllReceiptsService
};
