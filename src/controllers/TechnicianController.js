'use strict';

const TechnicianService = require('../services/TechnicianService');
const User = require('../models/User');
const { success, paginated, buildPagination, parsePagination } = require('../utils/response');

/**
 * Resolve the linkedTechnicianId for the authenticated user.
 * Only relevant when role=Technician — used for contact-info access control.
 */
async function getLinkedTechnicianId(userId) {
  const user = await User.findById(userId).select('linkedTechnicianId').lean();
  return user ? user.linkedTechnicianId : null;
}

async function list(req, res, next) {
  try {
    const { page, pageSize, skip } = parsePagination(req.query);
    const { status } = req.query;
    const linkedId = await getLinkedTechnicianId(req.user.id);

    const { items, totalCount } = await TechnicianService.list(
      req.user.tenantId,
      req.user,
      linkedId,
      { status, page, pageSize, skip }
    );
    return paginated(res, items, buildPagination(page, pageSize, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const linkedId = await getLinkedTechnicianId(req.user.id);
    const technician = await TechnicianService.getById(
      req.user.tenantId,
      req.params.id,
      req.user,
      linkedId
    );
    return success(res, technician);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById };
