'use strict';

const dns = require('node:dns');
const mongoose = require('mongoose');

const DEFAULT_MONGODB_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

function mongodbDnsServers() {
  const configured = process.env.MONGODB_DNS_SERVERS;
  if (!configured) return DEFAULT_MONGODB_DNS_SERVERS;

  return configured
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
}

function isSrvDnsFailure(error, uri) {
  return (
    uri.startsWith('mongodb+srv://') &&
    ['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL', 'ENOTFOUND'].includes(error?.code) &&
    ['querySrv', 'queryTxt'].includes(error?.syscall)
  );
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'qr_equipment';
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  try {
    await mongoose.connect(uri, { dbName });
  } catch (error) {
    if (!isSrvDnsFailure(error, uri)) throw error;

    const fallbackServers = mongodbDnsServers();
    if (!fallbackServers.length) throw error;

    console.warn(
      `[db] MongoDB SRV lookup failed via the system resolver (${error.code}); retrying with configured DNS fallback`
    );
    dns.setServers(fallbackServers);
    await mongoose.connect(uri, { dbName });
  }

  console.log('[db] connected to MongoDB');

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });
}

module.exports = { connectDB };
