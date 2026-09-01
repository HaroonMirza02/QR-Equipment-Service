'use strict';

const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const maintenanceEventSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', required: true },
    type: {
      type: String,
      enum: ['Scheduled', 'Preventive', 'Corrective', 'Inspection'],
      required: true,
    },
    performedByTechnicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician',
      required: true,
    },
    date: { type: Date, required: true },
    description: { type: String, required: true, trim: true },
    partsUsed: { type: [String], default: [] },
    nextRecommendedDate: { type: Date, default: null },
    attachments: { type: [attachmentSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // createdAt is immutable — set once on insert, never updated
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  {
    // Disable automatic updatedAt — this collection is append-only
    timestamps: false,
  }
);

// History list — most recent first
maintenanceEventSchema.index({ equipmentId: 1, date: -1 });
// Tenant-wide audit
maintenanceEventSchema.index({ tenantId: 1, date: -1 });

module.exports = mongoose.model('MaintenanceEvent', maintenanceEventSchema);
