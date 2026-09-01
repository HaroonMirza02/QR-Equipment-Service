'use strict';

const mongoose = require('mongoose');

const technicianSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    specialty: { type: String, required: true, trim: true },
    contactInfo: {
      phone: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
    },
    status: { type: String, enum: ['active', 'inactive'], required: true, default: 'active' },
  },
  { timestamps: true }
);

technicianSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('Technician', technicianSchema);
