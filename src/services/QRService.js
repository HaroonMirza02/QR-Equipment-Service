'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const Equipment = require('../models/Equipment');
const AppError = require('../utils/AppError');

const MAX_TOKEN_RETRIES = 3;

function getQrStorageDir() {
  const rel = process.env.QR_STORAGE_PATH || 'public/qr';
  return path.join(__dirname, '..', '..', rel);
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Ensure the QR storage directory exists.
 */
function ensureStorageDir() {
  const dir = getQrStorageDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

class QRService {
  /**
   * Generate a cryptographically random 64-hex-char token.
   * Retries up to MAX_TOKEN_RETRIES times to guarantee uniqueness.
   * Collision probability is negligible (~1 in 2^256) but we handle it
   * correctly rather than assuming it away.
   */
  async generateToken() {
    for (let attempt = 0; attempt < MAX_TOKEN_RETRIES; attempt++) {
      const token = crypto.randomBytes(32).toString('hex');
      const existing = await Equipment.findOne({ qrToken: token }).lean();
      if (!existing) return token;
    }
    throw new AppError('Failed to generate unique QR token after retries', 500, 'QR_TOKEN_GENERATION_FAILED');
  }

  /**
   * Generate a QR code PNG for the given token and save it to local storage.
   * Returns the public URL path (relative to BASE_URL).
   *
   * Per Assumption A7: the frontend must prepend BASE_URL when rendering.
   */
  async generateQRImage(token) {
    const dir = ensureStorageDir();
    const filename = `${token}.png`;
    const filepath = path.join(dir, filename);

    const scanUrl = `${getBaseUrl()}/api/public/scan/${token}`;

    await QRCode.toFile(filepath, scanUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
    });

    // Return the static-file URL path
    return `${getBaseUrl()}/static/qr/${filename}`;
  }

  /**
   * Full token + image generation in one call.
   * Returns { token, qrCodeUrl }.
   */
  async issueNew() {
    const token = await this.generateToken();
    const qrCodeUrl = await this.generateQRImage(token);
    return { token, qrCodeUrl };
  }

  /**
   * Rotate the token on an equipment document.
   * Pushes the old token to qrTokenHistory, generates a new token + image.
   * Does NOT save the document — caller is responsible for saving.
   *
   * @param {Document} equipment  - Mongoose equipment document (not lean)
   * @param {string}   userId     - ObjectId string of the user performing the action
   * @param {string}   reason     - Audit reason string
   * @returns {string} new qrCodeUrl
   */
  async rotateToken(equipment, userId, reason = '') {
    if (equipment.qrToken) {
      equipment.qrTokenHistory.push({
        token: equipment.qrToken,
        revokedAt: new Date(),
        revokedBy: userId,
        reason,
      });
    }

    const { token, qrCodeUrl } = await this.issueNew();
    equipment.qrToken = token;
    equipment.qrStatus = 'active';
    return qrCodeUrl;
  }

  /**
   * Revoke the token on retirement (no replacement).
   * Pushes to history, sets qrToken to a per-document unique sentinel,
   * sets qrStatus to 'revoked'.
   * Does NOT save the document — caller saves.
   *
   * Note: MongoDB 8.0 indexes null values even in sparse unique indexes,
   * so we cannot use null for retired records. Instead we use a sentinel
   * of the form "REVOKED:<_id>" which is unique per document and never
   * matches the 64-hex format validation on the scan endpoint.
   */
  revokeToken(equipment, userId, reason = 'retired') {
    if (equipment.qrToken && !equipment.qrToken.startsWith('REVOKED:')) {
      equipment.qrTokenHistory.push({
        token: equipment.qrToken,
        revokedAt: new Date(),
        revokedBy: userId,
        reason,
      });
    }
    equipment.qrToken = `REVOKED:${equipment._id}`;
    equipment.qrStatus = 'revoked';
  }

  /**
   * Mark as replaced — same as revoke but sets qrStatus = 'replaced'.
   * Used on the old record during a replace operation.
   */
  markReplaced(equipment, userId, reason = 'replaced') {
    if (equipment.qrToken && !equipment.qrToken.startsWith('REPLACED:')) {
      equipment.qrTokenHistory.push({
        token: equipment.qrToken,
        revokedAt: new Date(),
        revokedBy: userId,
        reason,
      });
    }
    equipment.qrToken = `REPLACED:${equipment._id}`;
    equipment.qrStatus = 'replaced';
  }
}

module.exports = new QRService();
