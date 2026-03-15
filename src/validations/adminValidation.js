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

module.exports = {
  loginAdminSchema,
  companyValidator,
  getAllCompanySchema,
  deleteCompanySchema,
  companyLoginSchema,
  refreshTokenSchema
};
