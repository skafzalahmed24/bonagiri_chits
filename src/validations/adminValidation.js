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
  user_code: Joi.string().required().messages({
    'any.required': 'User ID is required',
    'string.empty': 'User ID cannot be empty'
  }),
  company_password: Joi.string().required().messages({
    'any.required': 'Password is required',
    'string.empty': 'Password cannot be empty'
  }),
  type: Joi.number().integer().valid(1, 2).required().messages({
    'any.required': 'Login type is required',
    'any.only': 'Invalid login type'
  }),
  device_id: Joi.string().allow('', null).optional(),
  device_unique_id: Joi.string().allow('', null).optional(),
  platform_type: Joi.string().allow('', null).optional(),
  device_details: Joi.string().allow('', null).optional()
});

const forgotPasswordSchema = Joi.object({
  user_code: Joi.alternatives().try(Joi.string(), Joi.number()).required().messages({
    'any.required': 'User code is required',
    'string.empty': 'User code cannot be empty'
  }),
  type: Joi.number().integer().valid(1, 2).required().messages({
    'any.required': 'Type is required',
    'any.only': 'Invalid type'
  })
});

const verifyOtpSchema = Joi.object({
  user_code: Joi.string().required(),
  type: Joi.number().integer().valid(1, 2).required(),
  otp: Joi.string().length(6).required()
});

const resetPasswordSchema = Joi.object({
  user_code: Joi.string().required(),
  type: Joi.number().integer().valid(1, 2).required(),
  password: Joi.string().required()
});

const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string().required().messages({
    'any.required': 'Refresh token is required',
    'string.empty': 'Refresh token cannot be empty'
  })
});

const memberValidator = Joi.object({
  id: Joi.number().integer().optional().messages({
    'number.base': 'Invalid Member ID format'
  }),
  member_id: Joi.string().allow('', null).optional(),
  name_prefix: Joi.string().allow('', null).optional(),
  rep_by_first_name: Joi.string().allow('', null).optional(),
  sur_name: Joi.string().allow('', null).optional(),
  name: Joi.string().required().messages({
    'any.required': 'Name is required',
    'string.empty': 'Name cannot be empty'
  }),
  date_of_birth: Joi.date().iso().allow('', null).optional(),
  age: Joi.number().integer().allow('', null).optional(),
  registration_date: Joi.date().iso().allow('', null).optional(),
  parental_prefix: Joi.string().allow('', null).optional(),
  parental_name: Joi.string().allow('', null).optional(),
  guardian_name: Joi.string().allow('', null).optional(),
  relation: Joi.string().allow('', null).optional(),
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
  other_info_user_code: Joi.number().integer().min(100000).allow('', null).optional(),
  other_info_user_password: Joi.string().allow('', null).optional(),
  company_id: Joi.string().uuid().allow('', null).optional(),
  group_status: Joi.number().integer().valid(0, 1).default(0).optional()
});

const getAllMemberSchema = Joi.object({
  company_id: Joi.string().uuid().allow('', null).optional(),
  introduced_as: Joi.string().uuid().allow('', null).optional(),
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

const uploadDocumentSchema = Joi.object({
  type: Joi.number().integer().valid(1, 2).required().messages({
    'any.required': 'Upload type is required',
    'any.only': 'Upload type must be 1 (single) or 2 (multiple)'
  })
});

const routeValidator = Joi.object({
  id: Joi.number().integer().optional().messages({
    'number.base': 'Invalid Route ID format'
  }),
  route_name: Joi.string().required().messages({
    'any.required': 'Route name is required',
    'string.empty': 'Route name cannot be empty'
  })
});

const getAllRouteSchema = Joi.object({
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  }),
  search: Joi.string().allow('', null).optional()
});

const deleteRouteSchema = Joi.object({
  id: Joi.number().integer().required().messages({
    'any.required': 'Route ID is required',
    'number.base': 'Invalid Route ID format'
  })
});

const areaValidator = Joi.object({
  id: Joi.number().integer().optional().messages({
    'number.base': 'Invalid Area ID format'
  }),
  route_id: Joi.number().integer().required().messages({
    'any.required': 'Route ID is required',
    'number.base': 'Invalid Route ID format'
  }),
  area_name: Joi.string().required().messages({
    'any.required': 'Area name is required',
    'string.empty': 'Area name cannot be empty'
  })
});

const getAllAreaSchema = Joi.object({
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  }),
  search: Joi.string().allow('', null).optional()
});

const deleteAreaSchema = Joi.object({
  id: Joi.number().integer().required().messages({
    'any.required': 'Area ID is required',
    'number.base': 'Invalid Area ID format'
  })
});

const chitsGroupValidator = Joi.object({
  id: Joi.string().uuid().optional().messages({
    'string.uuid': 'Invalid Chits Group ID format'
  }),
  group_name: Joi.string().allow('', null).optional(),
  chit_series_term: Joi.number().integer().valid(1, 2, 3).required().messages({
    'any.only': 'Chit series term must be 1 (short term), 2 (mid term), or 3 (long term)',
    'any.required': 'Chit series term is required'
  }),
  auction_type: Joi.number().integer().valid(1, 2, 3, 4).required().messages({
    'any.only': 'Auction type must be 1 (monthly), 2 (bi-monthly), 3 (weekly), or 4 (daily)',
    'any.required': 'Auction type is required'
  }),
  chit_amount: Joi.number().precision(2).required().messages({
    'any.required': 'Chit amount is required'
  }),
  no_of_installments: Joi.number().integer().required().messages({
    'any.required': 'Number of installments is required'
  }),
  chit_agreement_number: Joi.string().allow('', null).optional(),
  pso_date: Joi.date().iso().allow('', null).optional(),
  pso_number: Joi.string().allow('', null).optional(),
  ca_date: Joi.date().iso().allow('', null).optional(),
  commencement_date: Joi.date().iso().allow('', null).optional(),
  term_date: Joi.date().iso().allow('', null).optional(),
  enrollment_fee: Joi.number().precision(2).allow(null).optional(),
  company_chit_number: Joi.number().integer().allow(null).optional(),
  no_auction_installment: Joi.number().integer().allow(null).optional(),
  company_commission: Joi.number().precision(2).allow(null).optional(),
  max_ceiling_in: Joi.number().precision(2).allow(null).optional(),
  penality_for_nps: Joi.number().precision(2).allow(null).optional(),
  penality_for_ps: Joi.number().precision(2).allow(null).optional(),
  auctions_per_month: Joi.number().integer().allow(null).optional(),
  installment_amount: Joi.number().precision(2).allow(null).optional(),
  auction_date: Joi.date().iso().allow('', null).optional(),
  days: Joi.number().integer().allow(null).optional(),
  bi_monthly_extra_input: Joi.string().allow('', null).optional(),
  auction_from: Joi.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).allow('', null).optional(),
  auction_to: Joi.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).allow('', null).optional(),
  dividend: Joi.number().integer().valid(1, 2).allow(null).optional(),
  send_sms_to_all_customers: Joi.number().integer().valid(0, 1).optional(),
  fdr_number: Joi.string().allow('', null).optional(),
  fdr_type: Joi.number().integer().valid(1, 2).allow(null).optional(),
  fdr_amount: Joi.number().precision(2).allow(null).optional(),
  fdr_date: Joi.date().iso().allow('', null).optional(),
  no_of_months: Joi.number().integer().allow(null).optional(),
  maturity_date: Joi.date().iso().allow('', null).optional(),
  roi_per_year: Joi.number().precision(2).allow(null).optional(),
  fdr_mat_amt: Joi.number().precision(2).allow(null).optional(),
  bank_name: Joi.string().allow('', null).optional(),
  bank_branch: Joi.string().allow('', null).optional(),
  asset_description: Joi.string().allow('', null).optional(),
  asset_value: Joi.number().precision(2).allow(null).optional(),
  company_id: Joi.string().uuid().allow('', null).optional(),
  running_status: Joi.number().integer().valid(1, 2, 3).optional()
});

const getAllChitsGroupSchema = Joi.object({
  company_id: Joi.string().uuid().allow('', null).optional(),
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  }),
  search: Joi.string().allow('', null).optional()
});

const deleteChitsGroupSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    'any.required': 'Chits Group ID is required',
    'string.uuid': 'Invalid Chits Group ID format'
  })
});

module.exports = {
  loginAdminSchema,
  companyValidator,
  getAllCompanySchema,
  deleteCompanySchema,
  companyLoginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  memberValidator,
  getAllMemberSchema,
  deleteMemberSchema,
  uploadDocumentSchema,
  routeValidator,
  getAllRouteSchema,
  deleteRouteSchema,
  areaValidator,
  getAllAreaSchema,
  deleteAreaSchema,
  chitsGroupValidator,
  getAllChitsGroupSchema,
  deleteChitsGroupSchema,
  getCountriesSchema: Joi.object({
    search: Joi.string().allow('', null).optional()
  }),
  getStatesSchema: Joi.object({
    country_id: Joi.number().integer().required().messages({
      'any.required': 'Country ID is required'
    }),
    search: Joi.string().allow('', null).optional()
  }),
  districtValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    district_name: Joi.string().required().messages({
      'any.required': 'District name is required'
    }),
    country_id: Joi.number().integer().required().messages({
      'any.required': 'Country ID is required'
    }),
    state_id: Joi.number().integer().required().messages({
      'any.required': 'State ID is required'
    }),
    status: Joi.number().integer().optional()
  }),
  getAllDistrictSchema: Joi.object({
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  cityValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    city_name: Joi.string().required().messages({
      'any.required': 'City name is required'
    }),
    pin_code: Joi.string().allow('', null).optional(),
    country_id: Joi.number().integer().required().messages({
      'any.required': 'Country ID is required'
    }),
    state_id: Joi.number().integer().required().messages({
      'any.required': 'State ID is required'
    }),
    district_id: Joi.string().uuid().required().messages({
      'any.required': 'District ID is required'
    }),
    status: Joi.number().integer().optional()
  }),
  getAllCitySchema: Joi.object({
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  getDistrictsSchema: Joi.object({
    state_id: Joi.number().integer().required().messages({
      'any.required': 'State ID is required'
    }),
    search: Joi.string().allow('', null).optional()
  }),
  deleteCitySchema: Joi.object({
    id: Joi.string().uuid().required().messages({
      'any.required': 'City ID is required',
      'string.uuid': 'Invalid City ID format'
    })
  }),
  fetchStaticDropdownSchema: Joi.object({
    type_id: Joi.number().integer().required().messages({
      'any.required': 'Type ID is required',
      'number.base': 'Type ID must be a number'
    }),
    search: Joi.string().allow('', null).optional()
  }),
  enrollmentValidator: Joi.object({
    id: Joi.number().integer().optional(),
    company_id: Joi.string().uuid().required(),
    group_id: Joi.string().uuid().required(),
    group_position_number: Joi.number().integer().required(),
    enrollment_date: Joi.date().iso().required(),
    subscriber_id: Joi.number().integer().required(),
    payment_mode_id: Joi.string().uuid().required(),
    business_agent_id: Joi.number().integer().allow(null).optional(),
    intimation_card_id: Joi.string().uuid().required(),
    address_type: Joi.number().integer().valid(1, 2).required(),
    collection_agent_id: Joi.number().integer().allow(null).optional(),
    business_type_id: Joi.number().integer().valid(1, 2).required(),
    area_id: Joi.number().integer().required(),
    nominee_name: Joi.string().allow('', null).optional(),
    nominee_age: Joi.number().integer().allow(null).optional(),
    nominee_relation: Joi.string().allow('', null).optional(),
    nominee_door_number: Joi.string().allow('', null).optional(),
    nominee_city_id: Joi.string().uuid().allow(null).optional(),
    nominee_street_name: Joi.string().allow('', null).optional(),
    nominee_address: Joi.string().allow('', null).optional(),
    nominee_mobile_number: Joi.string().allow('', null).optional(),
    nominee_pincode: Joi.string().allow('', null).optional(),
    fill_subscriber_address_status: Joi.number().integer().valid(0, 1).optional()
  }),
  getEnrollmentSchema: Joi.object({
    company_id: Joi.string().uuid().allow('', null).optional(),
    min: Joi.number().integer().optional(),
    max: Joi.number().integer().optional(),
    search: Joi.string().allow('', null).optional()
  }),
  deleteEnrollmentSchema: Joi.object({
    id: Joi.number().integer().required().messages({
      'any.required': 'Enrollment ID is required'
    })
  }),
  getPositionNumbersSchema: Joi.object({
    group_id: Joi.string().uuid().required()
  })
};
