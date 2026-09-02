'use strict';

const DemoService = require('../services/DemoService');
const AppError = require('../utils/AppError');
const { success } = require('../utils/response');

async function listDemoEquipment(_req, res, next) {
  try {
    const enabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_DIRECTORY === 'true';
    if (!enabled) {
      throw new AppError('Demo equipment directory is not enabled', 404, 'NOT_FOUND');
    }
    return success(res, await DemoService.list(), 200);
  } catch (error) {
    next(error);
  }
}

module.exports = { listDemoEquipment };
