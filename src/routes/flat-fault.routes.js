'use strict';

/**
 * Flat fault routes — mounted at /api/faults
 * Handles: PATCH /api/faults/:id/resolve
 *
 * Separate from fault.routes.js to avoid path conflicts when mounted
 * under both /api/equipment (nested) and /api/faults (flat).
 */

const express = require('express');
const { resolve } = require('../controllers/FaultController');
const { authenticate } = require('../middleware/authenticate');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { resolveFaultSchema } = require('../validation/schemas');

const router = express.Router();

router.use(authenticate);

// PATCH /api/faults/:id/resolve  — Admin | Technician
router.patch(
  '/:id/resolve',
  roleGuard('Admin', 'Technician'),
  validate(resolveFaultSchema),
  resolve
);

module.exports = router;
