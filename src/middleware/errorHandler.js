'use strict';

/**
 * Central error handler.
 * Expects errors to have optional fields: statusCode, code, details.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  if (process.env.NODE_ENV === 'development' && statusCode === 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = { errorHandler };
