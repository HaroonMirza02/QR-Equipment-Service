'use strict';

const mongoose = require('mongoose');

const qrTokenHistoryEntrySchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    revokedAt: { type: Date, required: true },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    site: { type: String, required: true, trim: true },
    building: { type: String, required: true, trim: true },
    zone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const equipmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },

    // QR token — cryptographically random, separate from _id (see ARCHITECTURE.md §2.1).
    // Unique sparse index is declared below (not inline) to avoid Mongoose duplicate-index warning.
    // On retirement/replacement, set to "REVOKED:<_id>" or "REPLACED:<_id>" sentinel
    // (unique per document). MongoDB 8.0 indexes null in sparse unique indexes,
    // so null cannot be used for multiple retired records.
    qrToken: { type: String, default: null },

    qrTokenHistory: { type: [qrTokenHistoryEntrySchema], default: [] },
    qrStatus: {
      type: String,
      enum: ['active', 'revoked', 'replaced'],
      required: true,
      default: 'active',
    },

    equipmentCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Pump', 'Generator', 'Compressor', 'HVAC', 'Electrical', 'Other'],
      required: true,
    },
    manufacturer: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    serialNumber: { type: String, default: null, trim: true },
    installationDate: { type: Date, required: true },
    location: { type: locationSchema, required: true },
    status: {
      type: String,
      enum: ['Operational', 'Under Maintenance', 'Faulty', 'Retired'],
      required: true,
      default: 'Operational',
    },
    assignedTechnicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician',
      default: null,
    },
    maintenanceIntervalDays: { type: Number, required: true, min: 1 },
    nextMaintenanceDate: { type: Date, default: null },
    replacedByEquipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Equipment',
      default: null,
    },
    replacedFromEquipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Equipment',
      default: null,
    },
    isPublicVisible: { type: Boolean, required: true, default: true },
    notes: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

// Primary scan lookup — sparse allows multiple nulls (retired equipment)
equipmentSchema.index({ qrToken: 1 }, { unique: true, sparse: true });
// Asset tag unique per tenant
equipmentSchema.index({ equipmentCode: 1, tenantId: 1 }, { unique: true });
// List + filter
equipmentSchema.index({ tenantId: 1, status: 1 });
// Overdue dashboard
equipmentSchema.index({ tenantId: 1, nextMaintenanceDate: 1 });
// Technician workload
equipmentSchema.index({ assignedTechnicianId: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
