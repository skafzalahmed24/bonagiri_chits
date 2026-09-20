'use strict';

const bannerService = require('../services/bannerService');
const statusCodes = require('../utils/statusCodes');
const { errorResponse } = require('../utils/responseHelper');

const storeOrUpdateBanner = async (req, res) => {
  try {
    return await bannerService.storeOrUpdateBannerService(res, req.user, req.body, req.file);
  } catch (error) {
    console.error('Error in storeOrUpdateBanner controller:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllBanners = async (req, res) => {
  try {
    return await bannerService.getAllBannersService(res, req.user, req.body);
  } catch (error) {
    console.error('Error in getAllBanners controller:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBannerById = async (req, res) => {
  try {
    const { id } = req.body;
    return await bannerService.getBannerByIdService(res, req.user, id);
  } catch (error) {
    console.error('Error in getBannerById controller:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.body;
    return await bannerService.deleteBannerService(res, req.user, id);
  } catch (error) {
    console.error('Error in deleteBanner controller:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const changeBannerStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    return await bannerService.changeBannerStatusService(res, req.user, id, status);
  } catch (error) {
    console.error('Error in changeBannerStatus controller:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getUserValidOffers = async (req, res) => {
  try {
    return await bannerService.getUserValidOffersService(res, req.user);
  } catch (error) {
    console.error('Error in getUserValidOffers controller:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdateBanner,
  getAllBanners,
  getBannerById,
  deleteBanner,
  changeBannerStatus,
  getUserValidOffers
};
