'use strict';

function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function paginated(res, data, pagination) {
  return res.status(200).json({ success: true, data, pagination });
}

function buildPagination(page, pageSize, totalCount) {
  return {
    page,
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

module.exports = { success, paginated, buildPagination, parsePagination };
