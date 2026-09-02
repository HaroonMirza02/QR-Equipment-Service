'use strict';

/**
 * Decodes every QR image referenced by the current equipment dataset and
 * verifies that it resolves to the stable mobile profile route. This tests
 * the actual PNG pixels that will be printed, not only the token metadata.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const Equipment = require('../models/Equipment');

const QR_DIR = path.join(__dirname, '..', '..', process.env.QR_STORAGE_PATH || 'public/qr');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN_RE = /^[0-9a-f]{64}$/;

function decode(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  return jsQR(pixels, png.width, png.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  const equipment = await Equipment.find({})
    .select('equipmentCode qrToken qrTokenHistory')
    .lean();

  const labels = [];
  for (const item of equipment) {
    if (TOKEN_RE.test(item.qrToken || '')) labels.push({ code: item.equipmentCode, token: item.qrToken, kind: 'current' });
    for (const entry of item.qrTokenHistory || []) {
      if (TOKEN_RE.test(entry.token || '')) labels.push({ code: item.equipmentCode, token: entry.token, kind: 'historical' });
    }
  }

  if (!labels.length) throw new Error('No QR labels found. Run npm run seed first.');

  let failed = 0;
  for (const label of labels) {
    const filePath = path.join(QR_DIR, `${label.token}.png`);
    const expected = `${BASE_URL}/equipment/${label.token}`;
    const actual = fs.existsSync(filePath) ? decode(filePath) : null;
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.code.padEnd(10)} ${label.kind.padEnd(10)} ${actual || 'missing/unreadable'}`);
  }

  console.log(`\n${labels.length - failed}/${labels.length} QR images decoded to the correct mobile profile URL.`);
  await mongoose.disconnect();
  if (failed) process.exitCode = 1;
}

verify().catch(async (error) => {
  console.error(`[qr-test] ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
