'use strict';

const DemoService = require('../services/DemoService');
const AppError = require('../utils/AppError');
const { success } = require('../utils/response');

async function listDemoEquipment(req, res, next) {
  try {
    const enabled = process.env.ENABLE_DEMO_DIRECTORY !== 'false';
    if (!enabled) {
      throw new AppError('Demo equipment directory is not enabled', 404, 'NOT_FOUND');
    }

    // Parse query parameters for pagination and filtering
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 12;
    const category = req.query.category || 'all';

    const result = await DemoService.list({ page, pageSize, category });
    return success(res, result, 200);
  } catch (error) {
    next(error);
  }
}

module.exports = { listDemoEquipment };
