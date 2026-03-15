const Joi = require('joi');

const loginAdminSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'any.required': 'Email is required',
    'string.empty': 'Email cannot be empty'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
    'string.empty': 'Password cannot be empty'
  })
});

const companyValidator = Joi.object({
  id: Joi.string().uuid().optional().messages({
    'string.uuid': 'Invalid Company ID format'
  }),
  company_name: Joi.string().required().messages({
    'any.required': 'Company name is required',
    'string.empty': 'Company name cannot be empty'
  }),
  company_address: Joi.string().allow('', null).optional(),
  bank_name: Joi.string().allow('', null).optional(),
  gst_percentage: Joi.number().precision(2).optional(),
  cheque_return_charges: Joi.number().precision(2).optional(),
  enrollement_charges: Joi.number().precision(2).optional(),
  notice_charges: Joi.number().precision(2).optional(),
  tranaction_lock_days: Joi.number().integer().optional(),
  latitude: Joi.string().allow('', null).optional(),
  longitude: Joi.string().allow('', null).optional(),
  location: Joi.string().allow('', null).optional(),
  gst_number: Joi.string().allow('', null).optional(),
  pan_number: Joi.string().allow('', null).optional(),
  sac_code: Joi.string().allow('', null).optional(),
  rect_print_format: Joi.number().integer().optional(),
  company_email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'any.required': 'Email is required',
    'string.empty': 'Email cannot be empty'
  }),
  company_password: Joi.string().required().messages({
    'any.required': 'Password is required',
    'string.empty': 'Password cannot be empty'
  }),
  company_id: Joi.string().allow('', null).optional(),
  gst_type: Joi.number().integer().valid(1, 2).optional().messages({
    'any.only': 'GST type must be 1 (General) or 2 (Divided)'
  })
});

const getAllCompanySchema = Joi.object({
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  })
});

const deleteCompanySchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    'any.required': 'Company ID is required',
    'string.empty': 'Company ID cannot be empty',
    'string.uuid': 'Invalid Company ID format'
  })
});

const companyLoginSchema = Joi.object({
  company_id: Joi.string().required().messages({
    'any.required': 'Company ID is required',
    'string.empty': 'Company ID cannot be empty'
  }),
  company_email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'any.required': 'Email is required',
    'string.empty': 'Email cannot be empty'
  }),
  company_password: Joi.string().required().messages({
    'any.required': 'Password is required',
    'string.empty': 'Password cannot be empty'
  })
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'any.required': 'Refresh token is required',
    'string.empty': 'Refresh token cannot be empty'
  })
});

const memberValidator = Joi.object({
  id: Joi.number().integer().optional().messages({
    'number.base': 'Invalid Member ID format'
  }),
  name_prefix: Joi.string().allow('', null).optional(),
  name: Joi.string().required().messages({
    'any.required': 'Name is required',
    'string.empty': 'Name cannot be empty'
  }),
  date_of_birth: Joi.date().iso().allow('', null).optional(),
  age: Joi.number().integer().allow('', null).optional(),
  registration_date: Joi.date().iso().allow('', null).optional(),
  parental_prefix: Joi.string().allow('', null).optional(),
  parental_name: Joi.string().allow('', null).optional(),
  gender: Joi.string().allow('', null).optional(),
  mobile_number: Joi.string().allow('', null).optional(),
  email: Joi.string().email().allow('', null).optional(),
  gst_number: Joi.string().allow('', null).optional(),
  marital_status: Joi.string().allow('', null).optional(),
  married_date: Joi.date().iso().allow('', null).optional(),
  introduced_as: Joi.any().optional(),
  account_number: Joi.string().allow('', null).optional(),
  account_holder_name: Joi.string().allow('', null).optional(),
  bank_branch: Joi.string().allow('', null).optional(),
  bank_name: Joi.string().allow('', null).optional(),
  ifsc_code: Joi.string().allow('', null).optional(),
  upload_image: Joi.string().allow('', null).optional(),
  upload_signature: Joi.string().allow('', null).optional(),
  passbook_details: Joi.string().allow('', null).optional(),
  employee_occupation: Joi.string().allow('', null).optional(),
  employee_type: Joi.string().allow('', null).optional(),
  employee_organisation: Joi.string().allow('', null).optional(),
  employee_designation: Joi.string().allow('', null).optional(),
  employee_department: Joi.string().allow('', null).optional(),
  employee_id: Joi.string().allow('', null).optional(),
  employee_date_of_joining: Joi.date().iso().allow('', null).optional(),
  employee_retirement_date: Joi.date().iso().allow('', null).optional(),
  employee_net_salary: Joi.number().allow('', null).optional(),
  business_type: Joi.string().allow('', null).optional(),
  business_firm_name: Joi.string().allow('', null).optional(),
  business_capital: Joi.number().allow('', null).optional(),
  business_income: Joi.number().allow('', null).optional(),
  annual_income: Joi.number().allow('', null).optional(),
  description: Joi.string().allow('', null).optional(),
  farmer_land_acres: Joi.number().allow('', null).optional(),
  address_info_door_no: Joi.string().allow('', null).optional(),
  address_info_street_name: Joi.string().allow('', null).optional(),
  address_info_address: Joi.string().allow('', null).optional(),
  address_info_city_id: Joi.number().integer().allow('', null).optional(),
  address_info_phone: Joi.string().allow('', null).optional(),
  address_info_same_as_residential_status: Joi.boolean().allow('', null).optional(),
  address_info_office_door_no: Joi.string().allow('', null).optional(),
  address_info_office_street_name: Joi.string().allow('', null).optional(),
  address_info_office_address: Joi.string().allow('', null).optional(),
  address_info_office_city_id: Joi.number().integer().allow('', null).optional(),
  address_info_office_phone: Joi.string().allow('', null).optional(),
  address_info_corresponding_address_status: Joi.boolean().allow('', null).optional(),
  other_info_kyc_details: Joi.any().optional(),
  other_info_reference: Joi.string().allow('', null).optional(),
  other_info_remarks: Joi.string().allow('', null).optional(),
  other_info_mobile_access: Joi.boolean().allow('', null).optional(),
  other_info_web_access: Joi.boolean().allow('', null).optional(),
  other_info_user_code: Joi.string().allow('', null).optional(),
  other_info_user_password: Joi.string().allow('', null).optional()
});

const getAllMemberSchema = Joi.object({
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  }),
  search: Joi.string().allow('', null).optional()
});

const deleteMemberSchema = Joi.object({
  id: Joi.number().integer().required().messages({
    'any.required': 'Member ID is required',
    'number.base': 'Invalid Member ID format'
  })
});

module.exports = {
  loginAdminSchema,
  companyValidator,
  getAllCompanySchema,
  deleteCompanySchema,
  companyLoginSchema,
  refreshTokenSchema,
  memberValidator,
  getAllMemberSchema,
  deleteMemberSchema
};
