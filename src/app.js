'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const publicRouter = require('./routes/public.routes');
const authRouter = require('./routes/auth.routes');
const equipmentRouter = require('./routes/equipment.routes');
const maintenanceRouter = require('./routes/maintenance.routes');
const equipmentFaultRouter = require('./routes/fault.routes');      // /api/equipment/:id/faults
const flatFaultRouter = require('./routes/flat-fault.routes');      // /api/faults/:id/resolve
const technicianRouter = require('./routes/technician.routes');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

const app = express();

// ── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Static files (QR images) ─────────────────────────────────────────────────
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/equipment', maintenanceRouter);     // /api/equipment/:id/maintenance
app.use('/api/equipment', equipmentFaultRouter);  // /api/equipment/:id/faults
app.use('/api/faults', flatFaultRouter);          // /api/faults/:id/resolve
app.use('/api/technicians', technicianRouter);

// ── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
