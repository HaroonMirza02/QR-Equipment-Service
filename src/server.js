'use strict';

require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/database');

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

start().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
