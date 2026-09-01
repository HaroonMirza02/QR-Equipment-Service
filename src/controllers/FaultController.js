'use strict';

const FaultService = require('../services/FaultService');
const { success, paginated, buildPagination, parsePagination } = require('../utils/response');

async function list(req, res, next) {
  try {
    const { page, pageSize, skip } = parsePagination(req.query);
    const { status, severity } = req.query;
    const { items, totalCount } = await FaultService.list(
      req.user.tenantId,
      req.params.id,
      { status, severity, page, pageSize, skip }
    );
    return paginated(res, items, buildPagination(page, pageSize, totalCount));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const fault = await FaultService.create(
      req.user.tenantId,
      req.params.id,
      req.user.id,
      req.body
    );
    return success(res, fault, 201);
  } catch (err) {
    next(err);
  }
}

async function resolve(req, res, next) {
  try {
    const fault = await FaultService.resolve(
      req.user.tenantId,
      req.params.id,
      req.user.id,
      req.body
    );
    return success(res, fault);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, resolve };
