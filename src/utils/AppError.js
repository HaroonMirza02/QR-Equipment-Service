'use strict';

/**
 * Structured application error.
 * @param {string} message  - Human-readable description
 * @param {number} statusCode
 * @param {string} code     - Machine-readable error code (e.g. 'EQUIPMENT_NOT_FOUND')
 * @param {*}      details  - Optional validation detail array
 */
class AppError extends Error {
  constructor(message, statusCode, code, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
