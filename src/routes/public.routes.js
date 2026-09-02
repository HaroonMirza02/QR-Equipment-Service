'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { scan } = require('../controllers/ScanController');
const { listDemoEquipment } = require('../controllers/DemoController');

const router = express.Router();

// Rate limit: 60 requests/minute per IP on the public scan endpoint
// (ARCHITECTURE.md §5.4, Assumption A4)
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.PUBLIC_SCAN_RATE_LIMIT, 10) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again in a minute.',
    },
  },
});

// GET /api/public/scan/:qrToken
router.get('/scan/:qrToken', scanLimiter, scan);

// Development/demo-only QR label directory. In production it is disabled
// unless explicitly enabled for a controlled showcase environment.
router.get('/demo-equipment', scanLimiter, listDemoEquipment);

module.exports = router;
