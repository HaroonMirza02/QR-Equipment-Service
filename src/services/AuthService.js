'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

class AuthService {
  /**
   * Validate credentials and return a signed JWT.
   * Error messages are intentionally identical for wrong email vs wrong password
   * to prevent user enumeration (ARCHITECTURE.md §5.3).
   */
  async login(email, password) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new AppError('Account is disabled', 403, 'ACCOUNT_DISABLED');
    }

    // Update lastLoginAt without triggering full validation
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    const token = this._signToken(user);

    return {
      token,
      expiresIn: parseInt(process.env.JWT_EXPIRES_IN, 10) || 86400,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Hash a plaintext password.
   */
  async hashPassword(plaintext) {
    return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  }

  /**
   * Sign a JWT for a user document.
   * Payload: { sub, role, tenantId, iat, exp }
   */
  _signToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured');
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN, 10) || 86400;
    return jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        tenantId: user.tenantId.toString(),
      },
      secret,
      { expiresIn }
    );
  }

  /**
   * Verify a token string and return the decoded payload.
   * Throws AppError on invalid/expired token.
   */
  verifyToken(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured');
    try {
      return jwt.verify(token, secret);
    } catch {
      throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
    }
  }
}

module.exports = new AuthService();
