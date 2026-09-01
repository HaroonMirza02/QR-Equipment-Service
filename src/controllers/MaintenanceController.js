'use strict';

const MaintenanceService = require('../services/MaintenanceService');
const { success, paginated, buildPagination, parsePagination } = require('../utils/response');

async function list(req, res, next) {
  try {
    const { page, pageSize, skip } = parsePagination(req.query);
    const { type } = req.query;
    const { items, totalCount } = await MaintenanceService.list(
      req.user.tenantId,
      req.params.id,
      { type, page, pageSize, skip }
    );
    return paginated(res, items, buildPagination(page, pageSize, totalCount));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const event = await MaintenanceService.create(
      req.user.tenantId,
      req.params.id,
      req.user.id,
      req.body
    );
    return success(res, event, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create };
