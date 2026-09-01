'use strict';

/**
 * Role Guard Middleware Factory
 *
 * Usage: roleGuard('Admin')  or  roleGuard('Admin', 'Technician')
 *
 * Returns 403 INSUFFICIENT_ROLE without revealing which role is required
 * (ARCHITECTURE.md §6.3). Applied at router mount level so it cannot be
 * accidentally omitted from individual routes.
 */

const AppError = require('../utils/AppError');

function roleGuard(...allowedRoles) {
  return function (req, _res, next) {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'INSUFFICIENT_ROLE'));
    }
    next();
  };
}

module.exports = { roleGuard };
