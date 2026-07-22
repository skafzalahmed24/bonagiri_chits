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
    'any.required': 'User Code is required',
    'string.empty': 'User Code cannot be empty'
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

const sendMemberOtpSchema = Joi.object({
  member_id: Joi.number().integer().required()
});

const verifyMemberOtpSchema = Joi.object({
  member_id: Joi.number().integer().required(),
  otp: Joi.string().length(6).required()
});


const resetPasswordSchema = Joi.object({
  user_code: Joi.string().required(),
  type: Joi.number().integer().valid(1, 2).required(),
  password: Joi.string().required(),
  reset_token: Joi.string().required()
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
  name_prefix: Joi.number().integer().allow(null).optional(),
  rep_by_first_name: Joi.string().allow('', null).optional(),
  sur_name: Joi.string().allow('', null).optional(),
  name: Joi.string().required().messages({
    'any.required': 'Name is required',
    'string.empty': 'Name cannot be empty'
  }),
  date_of_birth: Joi.date().iso().allow('', null).optional(),
  age: Joi.number().integer().allow('', null).optional(),
  registration_date: Joi.date().iso().allow('', null).optional(),
  parental_prefix: Joi.number().integer().allow(null).optional(),
  parental_name: Joi.string().allow('', null).optional(),
  guardian_name: Joi.string().allow('', null).optional(),
  relation: Joi.string().allow('', null).optional(),
  gender: Joi.number().integer().allow(null).optional(),
  mobile_number: Joi.string().allow('', null).optional(),
  email: Joi.string().email().allow('', null).optional(),
  gst_number: Joi.string().allow('', null).optional(),
  marital_status: Joi.number().integer().allow('', null).optional(),
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
  employee_occupation: Joi.number().integer().allow(null).optional(),
  employee_type: Joi.number().integer().allow(null).optional(),
  employee_organisation: Joi.string().allow('', null).optional(),
  employee_designation: Joi.string().allow('', null).optional(),
  employee_department: Joi.string().allow('', null).optional(),
  employee_id: Joi.string().allow('', null).optional(),
  employee_date_of_joining: Joi.date().iso().allow('', null).optional(),
  employee_retirement_date: Joi.date().iso().allow('', null).optional(),
  employee_net_salary: Joi.number().allow('', null).optional(),
  business_type: Joi.number().integer().allow(null).optional(),
  business_firm_name: Joi.string().allow('', null).optional(),
  business_capital: Joi.number().allow('', null).optional(),
  business_income: Joi.number().allow('', null).optional(),
  annual_income: Joi.number().allow('', null).optional(),
  description: Joi.string().allow('', null).optional(),
  farmer_land_acres: Joi.number().allow('', null).optional(),
  address_info_door_no: Joi.string().allow('', null).optional(),
  address_info_street_name: Joi.string().allow('', null).optional(),
  address_info_address: Joi.string().allow('', null).optional(),
  address_info_city_id: Joi.string().uuid().allow('', null).optional(),
  address_info_phone: Joi.string().allow('', null).optional(),
  address_info_same_as_residential_status: Joi.boolean().allow('', null).optional(),
  address_info_office_door_no: Joi.string().allow('', null).optional(),
  address_info_office_street_name: Joi.string().allow('', null).optional(),
  address_info_office_address: Joi.string().allow('', null).optional(),
  address_info_office_city_id: Joi.string().uuid().allow('', null).optional(),
  address_info_office_phone: Joi.string().allow('', null).optional(),
  address_info_corresponding_address_status: Joi.number().integer().default(0),
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
  introduced_as: Joi.alternatives().try(Joi.string(), Joi.number()).allow('', null).optional(),
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
  chit_category_id: Joi.number().integer().allow(null).optional(),
  scheme_configuration_id: Joi.string().uuid().allow(null).optional(),
  chit_series_term: Joi.number().integer().required().messages({
    'any.required': 'Chit series term is required'
  }),
  auction_type: Joi.number().integer().required().messages({
    'any.required': 'Auction type is required'
  }),
  chit_amount: Joi.number().precision(2).allow(null).optional().messages({
    'any.required': 'Chit amount is required'
  }),
  no_of_installments: Joi.number().integer().allow(null).optional().messages({
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
  dividend: Joi.number().integer().optional(),
  send_sms_to_all_customers: Joi.number().integer().valid(0, 1).optional(),
  fdr_number: Joi.string().allow('', null).optional(),
  fdr_type: Joi.number().integer().optional(),
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
  running_status: Joi.number().integer().allow(null).optional(),
  chits_group_status: Joi.number().integer().allow(null).optional(),
  chit_start_date: Joi.date().iso().allow('', null).optional(),
  chit_end_date: Joi.date().iso().allow('', null).optional(),
  due_date_number_count: Joi.number().integer().allow(null).optional()
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

const changePasswordSchema = Joi.object({
  old_password: Joi.string().required().messages({
    'any.required': 'Old password is required',
    'string.empty': 'Old password cannot be empty'
  }),
  new_password: Joi.string().required().messages({
    'any.required': 'New password is required',
    'string.empty': 'New password cannot be empty'
  })
});

const storeOrUpdateContactUsSchema = Joi.object({
  id: Joi.number().integer().optional(),
  company_id: Joi.string().uuid().allow('', null).optional().messages({
    'string.uuid': 'Invalid Company ID format'
  }),
  address: Joi.string().allow('', null).optional(),
  phone_numbers: Joi.array().items(Joi.string()).allow(null).optional(),
  emails: Joi.array().items(Joi.string().email().messages({
    'string.email': 'Each email must be a valid email address'
  })).allow(null).optional(),
  website_link: Joi.string().allow('', null).optional(),
  social_media_links: Joi.object().allow(null).optional()
});

const getAllContactUsSchema = Joi.object({
  company_id: Joi.string().uuid().allow('', null).optional(),
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  }),
  search: Joi.string().allow('', null).optional()
});

const deleteContactUsSchema = Joi.object({
  id: Joi.number().integer().required().messages({
    'any.required': 'Contact ID is required'
  })
});

const storeOrUpdateFAQSchema = Joi.object({
  id: Joi.number().integer().optional(),
  company_id: Joi.string().uuid().allow('', null).optional().messages({
    'string.uuid': 'Invalid Company ID format'
  }),
  question: Joi.string().required().messages({
    'any.required': 'Question is required',
    'string.empty': 'Question cannot be empty'
  }),
  answer: Joi.string().required().messages({
    'any.required': 'Answer is required',
    'string.empty': 'Answer cannot be empty'
  })
});

const getAllFAQSchema = Joi.object({
  company_id: Joi.string().uuid().allow('', null).optional(),
  min: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Min must be greater than or equal to 0'
  }),
  max: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Max must be greater than or equal to 1'
  }),
  search: Joi.string().allow('', null).optional()
});

const deleteFAQSchema = Joi.object({
  id: Joi.number().integer().required().messages({
    'any.required': 'FAQ ID is required'
  })
});

const storeOrUpdateTermsPrivacySchema = Joi.object({
  company_id: Joi.string().uuid().allow('', null).optional().messages({
    'string.uuid': 'Invalid Company ID format'
  }),
  type: Joi.number().integer().valid(1, 2).required().messages({
    'any.required': 'Type is required (1 - Terms and Conditions, 2 - Privacy Policy)',
    'any.only': 'Invalid type. Must be 1 or 2.'
  }),
  content: Joi.string().required().messages({
    'any.required': 'Content is required',
    'string.empty': 'Content cannot be empty'
  })
});

const getTermsPrivacySchema = Joi.object({
  company_id: Joi.string().uuid().allow('', null).optional().messages({
    'string.uuid': 'Invalid Company ID format'
  }),
  type: Joi.number().integer().valid(1, 2).required().messages({
    'any.required': 'Type is required (1 - Terms and Conditions, 2 - Privacy Policy)',
    'any.only': 'Invalid type. Must be 1 or 2.'
  })
});

module.exports = {
  storeOrUpdateFAQSchema,
  getAllFAQSchema,
  deleteFAQSchema,
  storeOrUpdateTermsPrivacySchema,
  getTermsPrivacySchema,
  storeOrUpdateContactUsSchema,
  getAllContactUsSchema,
  deleteContactUsSchema,
  changePasswordSchema,
  loginAdminSchema,
  companyValidator,
  getAllCompanySchema,
  deleteCompanySchema,
  companyLoginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  sendMemberOtpSchema,
  verifyMemberOtpSchema,
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
    company_id: Joi.string().uuid().allow('', null).optional(),
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
    payment_mode_id: Joi.number().integer().required(),
    business_agent_id: Joi.number().integer().allow(null).optional(),
    intimation_card_id: Joi.number().integer().required(),
    address_type: Joi.number().integer().allow(null).optional(),
    collection_agent_id: Joi.number().integer().allow(null).optional(),
    business_type_id: Joi.number().integer().required(),
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
  }),
  upcomingChitValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    company_id: Joi.string().uuid().required().messages({
      'any.required': 'Company ID is required',
      'string.uuid': 'Invalid Company ID format'
    }),
    group_name: Joi.string().allow('', null).optional(),
    chit_date: Joi.date().iso().allow('', null).optional(),
    status: Joi.number().integer().allow(null).optional(),
    chit_amount: Joi.number().allow('', null).optional(),
    no_of_installments: Joi.number().integer().allow('', null).optional(),
    remarks: Joi.string().allow('', null).optional()
  }).unknown(true),
  getAllUpcomingChitSchema: Joi.object({
    company_id: Joi.string().uuid().allow('', null).optional(),
    status: Joi.number().integer().allow(null).optional(),
    chit_date: Joi.date().iso().allow('', null).optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  deleteUpcomingChitSchema: Joi.object({
    id: Joi.string().uuid().required().messages({
      'any.required': 'Upcoming Chit ID is required',
      'string.uuid': 'Invalid Upcoming Chit ID format'
    })
  }),
  updateFavoritesSchema: Joi.object({
    user_id: Joi.string().required(),
    type: Joi.number().integer().valid(1, 2).required(),
    is_favorites: Joi.alternatives().try(
      Joi.array().items(Joi.alternatives().try(Joi.number(), Joi.string())),
      Joi.number(),
      Joi.string()
    ).required()
  }),
  getGroupMembersSchema: Joi.object({
    group_id: Joi.string().uuid().required().messages({
      'any.required': 'Group ID is required',
      'string.uuid': 'Invalid Group ID format'
    }),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  suitFileInformationValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    company_id: Joi.string().uuid().required(),
    group_id: Joi.string().uuid().required(),
    ticket_number: Joi.number().integer().allow(null).optional(),
    subscriber_id: Joi.number().integer().required(),
    court_name: Joi.string().allow('', null).optional(),
    advocate_name: Joi.string().allow('', null).optional(),
    suit_cause: Joi.string().allow('', null).optional(),
    suit_no: Joi.string().allow('', null).optional(),
    suit_file_date: Joi.date().iso().allow('', null).optional(),
    principle_amount: Joi.number().precision(2).allow(null).optional(),
    cost_of_legal_amount: Joi.number().precision(2).allow(null).optional(),
    inc_charges: Joi.number().precision(2).allow(null).optional(),
    interest_amount: Joi.number().precision(2).allow(null).optional(),
    claim_amount: Joi.number().precision(2).allow(null).optional(),
    legal_notice_date: Joi.date().iso().allow('', null).optional()
  }),
  getAllSuitFileInformationSchema: Joi.object({
    company_id: Joi.string().uuid().required(),
    group_id: Joi.string().uuid().allow('', null).optional(),
    subscriber_id: Joi.number().integer().allow(null).optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  deleteSuitFileInformationSchema: Joi.object({
    id: Joi.string().uuid().required(),
    company_id: Joi.string().uuid().allow('', null).optional()
  }),
  auctionValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    company_id: Joi.string().uuid().required(),
    group_id: Joi.string().uuid().required(),
    ticket_number: Joi.number().integer().allow(null).optional(),
    bidder_id: Joi.number().integer().required(),
    auction_number: Joi.number().integer().allow(null).optional(),
    auction_date: Joi.date().iso().allow('', null).optional(),
    due_date: Joi.date().iso().allow('', null).optional(),
    next_auction_date: Joi.date().iso().allow('', null).optional(),
    bid_amount: Joi.number().precision(2).allow(null).optional(),
    gst_number_percentage: Joi.number().precision(2).allow(null).optional(),
    pb_bo_proxy: Joi.string().allow('', null).optional(),
    minutes_filing_date: Joi.date().iso().allow('', null).optional(),
    installments: Joi.number().integer().allow(null).optional(),
    chit_amount: Joi.number().precision(2).allow(null).optional(),
    bid_loss: Joi.number().precision(2).allow(null).optional(),
    bid_payable: Joi.number().precision(2).allow(null).optional(),
    company_commission: Joi.number().precision(2).allow(null).optional(),
    gst_amount: Joi.number().precision(2).allow(null).optional(),
    dividend_payable: Joi.number().precision(2).allow(null).optional(),
    subscription_amount: Joi.number().precision(2).allow(null).optional(),
    dividend: Joi.number().precision(2).allow(null).optional(),
    net_payable: Joi.number().precision(2).allow(null).optional()
  }),
  getAllAuctionsSchema: Joi.object({
    company_id: Joi.string().uuid().required(),
    group_id: Joi.string().uuid().allow('', null).optional(),
    bidder_id: Joi.number().integer().allow(null).optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),

  deleteAuctionSchema: Joi.object({
    id: Joi.string().uuid().required(),
    company_id: Joi.string().uuid().allow('', null).optional()
  }),
  getAgentTargetSchema: Joi.object({
    agent_type_id: Joi.number().integer().valid(16, 18).required().messages({
      'any.required': 'Type ID is required (16 - Business Agent, 18 - Collection Agent)',
      'any.only': 'Invalid agent type ID. Must be 16 or 18.'
    }),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  getAgentEnrollmentsSchema: Joi.object({
    agent_type_id: Joi.number().integer().valid(16, 18).required(),
    agent_id: Joi.number().integer().required(),
    group_id: Joi.string().uuid().allow('', null).optional(),
    position: Joi.string().valid('PS', 'NPS').allow('', null).optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  storeOrUpdateAgentTargetEntrySchema: Joi.object({
    id: Joi.string().uuid().optional(),
    company_id: Joi.string().uuid().allow('', null).optional(),
    agent_type_id: Joi.number().integer().valid(16, 18).required(),
    agent_id: Joi.number().integer().required(),
    target_amount: Joi.number().precision(2).required(),
    from_date: Joi.date().iso().allow('', null).optional(),
    to_date: Joi.date().iso().allow('', null).optional(),
    due_amount: Joi.number().precision(2).allow('', null).optional()
  }),
  getFilteredMembersByGroupAndAgentSchema: Joi.object({
    company_id: Joi.string().uuid().allow('', null).optional(),
    agent_type_id: Joi.number().integer().valid(16, 18).required(),
    agent_id: Joi.number().integer().allow('', null).optional(),
    group_id: Joi.string().uuid().allow('', null).optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  transferAgentUpdateSchema: Joi.object({
    member_id: Joi.any().required(),
    agent_type_id: Joi.number().integer().valid(16, 18).required(),
    new_agent_id: Joi.number().integer().required()
  }),
  getAllGroupUnderStaticListsSchema: Joi.object({
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional(),
    account_group_id: Joi.number().integer().allow(null).optional()
  }),
  getAllAccountTreeSchema: Joi.object({
    group_under_id: Joi.number().integer().allow(null).optional(),
    search: Joi.string().allow('', null).optional(),
    company_id: Joi.string().uuid().allow('', null).optional()
  }),
  getByIdSchema: Joi.object({
    id: Joi.any().required()
  }),
  groupUnderStaticListValidator: Joi.object({
    id: Joi.number().integer().optional(),
    name: Joi.string().required(),
    group_under_id: Joi.number().integer().allow(null).optional(),
    account_order: Joi.number().integer().allow(null).optional(),
    type: Joi.number().integer().optional()
  }),
  deleteGroupUnderStaticListSchema: Joi.object({
    id: Joi.number().integer().required()
  }),
  storeOrUpdateAccountCreationDetailSchema: Joi.object({
    id: Joi.number().integer().optional(),
    company_id: Joi.string().uuid().allow('', null).optional(),
    account_name: Joi.string().required(),
    account_group_id: Joi.number().integer().allow(null).optional(),
    person_name: Joi.string().allow('', null).optional(),
    address_line_one: Joi.string().allow('', null).optional(),
    address_line_two: Joi.string().allow('', null).optional(),
    address_line_three: Joi.string().allow('', null).optional(),
    pin_code: Joi.string().allow('', null).optional(),
    mobile: Joi.string().allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    hsn_code: Joi.string().allow('', null).optional(),
    tin_number: Joi.string().allow('', null).optional(),
    mfl_number: Joi.string().allow('', null).optional(),
    gst_number: Joi.string().allow('', null).optional(),
    pan_number: Joi.string().allow('', null).optional(),
    igst_percentage: Joi.number().precision(2).allow(null).optional(),
    cgst_percentage: Joi.number().precision(2).allow(null).optional(),
    sgst_percentage: Joi.number().precision(2).allow(null).optional(),
    opening_balance: Joi.number().precision(2).allow(null).optional(),
    cr_dr_status: Joi.number().integer().allow(null).optional(),
    action_status: Joi.number().integer().allow(null).optional(),
    created_by: Joi.string().allow('', null).optional(),
    updated_by: Joi.string().allow('', null).optional()
  }),
  deleteAccountCreationDetailSchema: Joi.object({
    id: Joi.number().integer().required()
  }),
  bulkEditAccountCreationDetailsSchema: Joi.object({
    accounts: Joi.array().items(Joi.object({
      id: Joi.number().integer().required(),
      company_id: Joi.string().uuid().allow('', null).optional(),
      account_name: Joi.string().allow('', null).optional(),
      account_group_id: Joi.number().integer().allow(null).optional(),
      person_name: Joi.string().allow('', null).optional(),
      address_line_one: Joi.string().allow('', null).optional(),
      address_line_two: Joi.string().allow('', null).optional(),
      address_line_three: Joi.string().allow('', null).optional(),
      pin_code: Joi.string().allow('', null).optional(),
      mobile: Joi.string().allow('', null).optional(),
      email: Joi.string().email().allow('', null).optional(),
      hsn_code: Joi.string().allow('', null).optional(),
      tin_number: Joi.string().allow('', null).optional(),
      mfl_number: Joi.string().allow('', null).optional(),
      gst_number: Joi.string().allow('', null).optional(),
      pan_number: Joi.string().allow('', null).optional(),
      igst_percentage: Joi.number().precision(2).allow(null).optional(),
      cgst_percentage: Joi.number().precision(2).allow(null).optional(),
      sgst_percentage: Joi.number().precision(2).allow(null).optional(),
      opening_balance: Joi.number().precision(2).allow(null).optional(),
      cr_dr_status: Joi.number().integer().allow(null).optional(),
      action_status: Joi.number().integer().allow(null).optional(),
      created_by: Joi.string().allow('', null).optional(),
      updated_by: Joi.string().allow('', null).optional()
    })).required()
  }),
  selfChitValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    group_id: Joi.string().uuid().required(),
    slot_id: Joi.number().integer().required()
  }),
  getAllSelfChitSchema: Joi.object({
    company_id: Joi.string().uuid().allow('', null).optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  deleteSelfChitSchema: Joi.object({
    id: Joi.string().uuid().required()
  }),
  configureBusinessAgentCommissionValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    group_id: Joi.string().uuid().required(),
    business_agent_id: Joi.number().integer().required(),
    member_id: Joi.number().integer().required(),
    commission_amount: Joi.number().precision(2).required(),
    status: Joi.number().integer().valid(1, 2, 3).optional()
  }),
  getAllConfigureBusinessAgentCommissionSchema: Joi.object({
    group_id: Joi.string().uuid().optional(),
    business_agent_id: Joi.number().integer().optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  deleteConfigureBusinessAgentCommissionSchema: Joi.object({
    id: Joi.string().uuid().required()
  }),
  historyBusinessAgentValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    configure_business_agent_id: Joi.string().uuid().required(),
    description: Joi.string().allow('', null).optional(),
    upload_document: Joi.string().allow('', null).optional(),
    paid_amount: Joi.number().precision(2).required()
  }),
  getAllHistoryBusinessAgentSchema: Joi.object({
    configure_business_agent_id: Joi.string().uuid().required(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  deleteHistoryBusinessAgentSchema: Joi.object({
    id: Joi.string().uuid().required()
  }),
  getBusinessAgentCommissionSummarySchema: Joi.object({
    company_id: Joi.string().uuid().allow('', null).optional(),
    business_agent_id: Joi.number().integer().required(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  getHistoryByGroupIdSchema: Joi.object({
    company_id: Joi.string().uuid().allow('', null).optional(),
    group_id: Joi.string().uuid().required(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  updateCollectionSubmissionStatusSchema: Joi.object({
    id: Joi.string().uuid().required(),
    status: Joi.number().integer().valid(0, 1, 2, 3).required()
  }),
  getAllCollectionSubmissionsSchema: Joi.object({
    collection_agent_id: Joi.number().integer().optional(),
    type: Joi.number().integer().valid(1, 2, 3, 4).required(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  galleryValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    gallery_image: Joi.string().required(),
    status: Joi.number().integer().valid(0, 1).optional()
  }),
  getAllGallerySchema: Joi.object({
    company_id: Joi.string().uuid().optional(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    status: Joi.number().integer().valid(0, 1).optional()
  }),
  deleteGallerySchema: Joi.object({
    id: Joi.string().uuid().required()
  }),
  storeOrUpdateFixedSchemeSchema: Joi.object({
    id: Joi.string().uuid().optional(),
    title: Joi.string().required(),
    scheme_type: Joi.number().valid(62, 63, 64, 65).required(),
    months_count: Joi.number().required(),
    members_count: Joi.number().required(),
    description: Joi.string().allow('', null).optional(),
    status: Joi.number().integer().valid(0, 1).optional(),
    company_profit: Joi.alternatives().try(Joi.number(), Joi.string()).allow('', null).optional(),
    
    chit_value: Joi.when('scheme_type', { is: 63, then: Joi.alternatives().try(Joi.number(), Joi.string()).required(), otherwise: Joi.any().optional() }),
    adding_percentage: Joi.when('scheme_type', { is: 63, then: Joi.alternatives().try(Joi.number(), Joi.string()).required(), otherwise: Joi.any().optional() }),
    company_percentage: Joi.when('scheme_type', { is: 63, then: Joi.alternatives().try(Joi.number(), Joi.string()).required(), otherwise: Joi.any().optional() }),
    installment: Joi.any().optional(),
    company_chit: Joi.any().optional(),

    prices: Joi.when('scheme_type', {
      is: Joi.valid(62, 64, 65),
      then: Joi.array().items(Joi.object({
          month: Joi.number().required(),
          withdrawn: Joi.any().optional(),
          not_withdrawn: Joi.any().optional(),
          chit_amount: Joi.any().optional(),
          installment: Joi.any().optional(),
          monthly_subscription: Joi.any().optional(),
          net_received: Joi.any().optional()
      })).length(Joi.ref('months_count')).required(),
      otherwise: Joi.any().optional()
    })
  }),
  updateChitsGroupStatusSchema: Joi.object({
    id: Joi.string().uuid().required().messages({
      'any.required': 'Chits Group ID is required',
      'string.uuid': 'Invalid Chits Group ID format'
    }),
    chits_group_status: Joi.number().integer().valid(0, 1, 2).optional()
  }),
  getBusinessListUnderMembersSchema: Joi.object({
    business_agent_id: Joi.number().integer().required(),
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional()
  }),
  
  // RBAC & Staff Validations
  roleValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    name: Joi.string().required().messages({
      'any.required': 'Role name is required',
      'string.empty': 'Role name cannot be empty'
    }),
    description: Joi.string().allow('', null).optional(),
    permissions: Joi.object().optional()
  }),
  getAllRoleSchema: Joi.object({
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  deleteRoleSchema: Joi.object({
    id: Joi.string().uuid().required()
  }),
  
  staffValidator: Joi.object({
    id: Joi.string().uuid().optional(),
    name_prefix: Joi.number().integer().allow(null).optional(),
    first_name: Joi.string().required().messages({
      'any.required': 'First name is required',
      'string.empty': 'First name cannot be empty'
    }),
    last_name: Joi.string().allow('', null).optional(),
    mobile_number: Joi.string().allow('', null).optional(),
    role_id: Joi.string().uuid().required().messages({
      'any.required': 'Role is required'
    }),
    password: Joi.string().min(6).when('id', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required().messages({ 'any.required': 'Password is required' })
    }),
    is_active: Joi.boolean().optional(),
  }),
  getAllStaffSchema: Joi.object({
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(1).optional(),
    search: Joi.string().allow('', null).optional()
  }),
  deleteStaffSchema: Joi.object({
    id: Joi.string().uuid().required()
  }),
  staffChangePasswordSchema: Joi.object({
    member_id: Joi.string().uuid().required(),
    new_password: Joi.string().min(6).required()
  }),
  registerTokenSchema: Joi.object({
    fcm_token: Joi.string().required(),
  }),
  sendManualNotificationSchema: Joi.object({
    target_type: Joi.string().valid('ALL', 'GROUP', 'SPECIFIC_MEMBER').required(),
    target_id: Joi.string().allow(null, '').optional(),
    title: Joi.string().required(),
    body: Joi.string().required(),
    data_payload: Joi.object().optional(),
  }),
  storeDirectPaymentSchema: Joi.object({
    chits_installment_id: Joi.string().uuid().required(),
    received_amount: Joi.number().min(0).required(),
    penalty_paid: Joi.number().min(0).optional(),
    payment_date: Joi.date().iso().optional(),
    payment_mode: Joi.number().integer().optional(),
    transaction_reference: Joi.string().allow('', null).optional()
  })
};
