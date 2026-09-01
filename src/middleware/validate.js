'use strict';

const AppError = require('../utils/AppError');

/**
 * Zod validation middleware factory.
 * Validates req.body against a Zod schema.
 * On failure, returns 422 VALIDATION_ERROR with a details array.
 *
 * Usage: validate(schema)  — coerces and replaces req.body with parsed result
 */
function validate(schema) {
  return function (req, _res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(
        new AppError('Validation failed', 422, 'VALIDATION_ERROR', details)
      );
    }
    // Replace body with the parsed (coerced + stripped) result
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
