'use strict';

const express = require('express');
const { list, getById } = require('../controllers/TechnicianController');
const { authenticate } = require('../middleware/authenticate');
const { roleGuard } = require('../middleware/roleGuard');

const router = express.Router();

router.use(authenticate);
router.use(roleGuard('Admin', 'Technician', 'Viewer'));

// GET /api/technicians
router.get('/', list);

// GET /api/technicians/:id
router.get('/:id', getById);

module.exports = router;
