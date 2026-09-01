'use strict';

/**
 * Nested fault routes — mounted at /api/equipment
 * Handles:
 *   GET  /api/equipment/:id/faults
 *   POST /api/equipment/:id/faults
 */

const express = require('express');
const { list, create } = require('../controllers/FaultController');
const { authenticate } = require('../middleware/authenticate');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { createFaultSchema } = require('../validation/schemas');

const router = express.Router({ mergeParams: true });

router.use(authenticate);

// GET /api/equipment/:id/faults  — Admin | Technician | Viewer
router.get(
  '/:id/faults',
  roleGuard('Admin', 'Technician', 'Viewer'),
  list
);

// POST /api/equipment/:id/faults  — Admin | Technician
router.post(
  '/:id/faults',
  roleGuard('Admin', 'Technician'),
  validate(createFaultSchema),
  create
);

module.exports = router;
