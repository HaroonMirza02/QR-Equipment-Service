'use strict';

const EquipmentService = require('../services/EquipmentService');
const { success, paginated, buildPagination, parsePagination } = require('../utils/response');

async function list(req, res, next) {
  try {
    const { page, pageSize, skip } = parsePagination(req.query);
    const { status, category, assignedTechnicianId } = req.query;

    // Technician role may only filter by their own assignedTechnicianId
    let techFilter = assignedTechnicianId;
    if (req.user.role === 'Technician' && techFilter && techFilter !== req.user.id) {
      techFilter = req.user.id; // silently scope to own
    }

    const { items, totalCount } = await EquipmentService.list(req.user.tenantId, {
      status,
      category,
      assignedTechnicianId: techFilter,
      page,
      pageSize,
      skip,
    });

    return paginated(res, items, buildPagination(page, pageSize, totalCount));
  } catch (err) {
    next(err);
  }
}

async function listOverdue(req, res, next) {
  try {
    const { page, pageSize, skip } = parsePagination(req.query);
    const { items, totalCount } = await EquipmentService.listOverdue(req.user.tenantId, {
      page,
      pageSize,
      skip,
    });
    return paginated(res, items, buildPagination(page, pageSize, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const equipment = await EquipmentService.getById(req.user.tenantId, req.params.id);
    return success(res, equipment);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const equipment = await EquipmentService.create(req.user.tenantId, req.body);
    return success(res, equipment, 201);
  } catch (err) {
    next(err);
  }
}

async function patch(req, res, next) {
  try {
    const equipment = await EquipmentService.patch(req.user.tenantId, req.params.id, req.body);
    return success(res, equipment);
  } catch (err) {
    next(err);
  }
}

async function retire(req, res, next) {
  try {
    const equipment = await EquipmentService.retire(
      req.user.tenantId,
      req.params.id,
      req.user.id,
      req.body.reason
    );
    return success(res, equipment);
  } catch (err) {
    next(err);
  }
}

async function replace(req, res, next) {
  try {
    const result = await EquipmentService.replace(
      req.user.tenantId,
      req.params.id,
      req.user.id,
      req.body
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
}

async function regenerateQR(req, res, next) {
  try {
    const result = await EquipmentService.regenerateQR(
      req.user.tenantId,
      req.params.id,
      req.user.id,
      req.body.reason
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, listOverdue, getById, create, patch, retire, replace, regenerateQR };
