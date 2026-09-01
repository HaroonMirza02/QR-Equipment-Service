'use strict';

/**
 * JWT Authentication Middleware
 *
 * Verifies the Bearer token, loads minimal user context from the JWT payload,
 * and attaches req.user = { id, role, tenantId }.
 *
 * For write operations (non-GET), also performs a lightweight DB check:
 *   - user.isActive must be true
 *   - token must have been issued after the last password change
 * This satisfies ARCHITECTURE.md §6.5 without blacklisting every token.
 */

const AuthService = require('../services/AuthService');
const User = require('../models/User');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.slice(7);
    const payload = AuthService.verifyToken(token);

    // Attach user context from JWT payload (no DB hit on reads)
    req.user = {
      id: payload.sub,
      role: payload.role,
      tenantId: payload.tenantId,
      iat: payload.iat,
    };

    // On write operations, validate that the account is still active and that
    // the token wasn't issued before a password change.
    if (req.method !== 'GET') {
      const user = await User.findById(payload.sub).select('isActive passwordChangedAt').lean();

      if (!user) {
        throw new AppError('User not found', 401, 'UNAUTHORIZED');
      }
      if (!user.isActive) {
        throw new AppError('Account is disabled', 403, 'ACCOUNT_DISABLED');
      }
      if (user.passwordChangedAt) {
        const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat < changedAtSec) {
          throw new AppError(
            'Token issued before password change. Please log in again.',
            401,
            'TOKEN_INVALIDATED'
          );
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
