'use strict';

const AuthService = require('../services/AuthService');
const { success } = require('../utils/response');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    return success(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
