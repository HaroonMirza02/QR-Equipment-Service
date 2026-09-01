'use strict';

const express = require('express');
const { login } = require('../controllers/AuthController');
const { validate } = require('../middleware/validate');
const { loginSchema } = require('../validation/schemas');

const router = express.Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), login);

module.exports = router;
