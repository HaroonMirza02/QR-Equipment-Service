'use strict';

const express = require('express');
const {
  list,
  listOverdue,
  getById,
  create,
  patch,
  retire,
  replace,
  regenerateQR,
} = require('../controllers/EquipmentController');
const { authenticate } = require('../middleware/authenticate');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const {
  createEquipmentSchema,
  patchEquipmentSchema,
  retireEquipmentSchema,
  regenerateQRSchema,
  replaceEquipmentSchema,
} = require('../validation/schemas');

const router = express.Router();

// All equipment routes require authentication
router.use(authenticate);

// ── IMPORTANT: /overdue MUST be registered before /:id ─────────────────────
// If /:id is first, Express matches "overdue" as an id value.
// (ARCHITECTURE.md §5.5 route-ordering note)

// GET /api/equipment/overdue  — Admin | Technician | Viewer
router.get(
  '/overdue',
  roleGuard('Admin', 'Technician', 'Viewer'),
  listOverdue
);

// GET /api/equipment  — Admin | Technician | Viewer
router.get(
  '/',
  roleGuard('Admin', 'Technician', 'Viewer'),
  list
);

// POST /api/equipment  — Admin only
router.post(
  '/',
  roleGuard('Admin'),
  validate(createEquipmentSchema),
  create
);

// GET /api/equipment/:id  — Admin | Technician | Viewer
router.get(
  '/:id',
  roleGuard('Admin', 'Technician', 'Viewer'),
  getById
);

// PATCH /api/equipment/:id  — Admin only
router.patch(
  '/:id',
  roleGuard('Admin'),
  validate(patchEquipmentSchema),
  patch
);

// POST /api/equipment/:id/retire  — Admin only
router.post(
  '/:id/retire',
  roleGuard('Admin'),
  validate(retireEquipmentSchema),
  retire
);

// POST /api/equipment/:id/replace  — Admin only
router.post(
  '/:id/replace',
  roleGuard('Admin'),
  validate(replaceEquipmentSchema),
  replace
);

// POST /api/equipment/:id/qr/regenerate  — Admin only
router.post(
  '/:id/qr/regenerate',
  roleGuard('Admin'),
  validate(regenerateQRSchema),
  regenerateQR
);

module.exports = router;
