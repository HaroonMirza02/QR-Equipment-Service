'use strict';

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  await mongoose.connect(uri);
  console.log('[db] connected to MongoDB');

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });
}

module.exports = { connectDB };
