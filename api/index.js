'use strict';

const app = require('../src/app');
const { connectDB } = require('../src/config/database');

let isConnected = false;

module.exports = async (req, res) => {
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
    } catch (err) {
      console.error('MongoDB connection error on Vercel:', err);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_CONNECTION_ERROR',
          message: `Database connection failed: ${err.message || 'Check MONGODB_URI on Vercel'}`,
        },
      });
    }
  }
  return app(req, res);
};
