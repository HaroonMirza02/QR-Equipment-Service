'use strict';

const ScanService = require('../services/ScanService');
const AppError = require('../utils/AppError');
const { success } = require('../utils/response');

// qrToken must be exactly 64 lowercase hex characters
const QR_TOKEN_RE = /^[0-9a-f]{64}$/;

async function scan(req, res, next) {
  try {
    const { qrToken } = req.params;

    if (!QR_TOKEN_RE.test(qrToken)) {
      throw new AppError('Invalid QR token format', 422, 'VALIDATION_ERROR');
    }

    const result = await ScanService.resolve(qrToken);

    switch (result.type) {
      case 'not_found':
        throw new AppError('This QR code is not recognized', 404, 'QR_NOT_FOUND');

      case 'active':
      case 'retired':
      case 'replaced':
      case 'restricted':
        return success(res, result.data, 200);

      default:
        throw new AppError('Unexpected scan result', 500, 'INTERNAL_ERROR');
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { scan };
