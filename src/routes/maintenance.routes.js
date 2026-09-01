'use strict';

const express = require('express');
const { list, create } = require('../controllers/MaintenanceController');
const { authenticate } = require('../middleware/authenticate');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { createMaintenanceSchema } = require('../validation/schemas');

// mergeParams: true so :id from /api/equipment/:id is accessible
const router = express.Router({ mergeParams: true });

router.use(authenticate);

// GET /api/equipment/:id/maintenance  — Admin | Technician | Viewer
router.get(
  '/:id/maintenance',
  roleGuard('Admin', 'Technician', 'Viewer'),
  list
);

// POST /api/equipment/:id/maintenance  — Admin | Technician
router.post(
  '/:id/maintenance',
  roleGuard('Admin', 'Technician'),
  validate(createMaintenanceSchema),
  create
);

module.exports = router;
