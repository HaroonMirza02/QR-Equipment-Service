'use strict';

const mongoose = require('mongoose');

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const faultIncidentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', required: true },
    reportedDate: { type: Date, required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    severity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      required: true,
    },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved'],
      required: true,
      default: 'Open',
    },
    resolvedDate: { type: Date, default: null },
    resolutionNotes: { type: String, default: null, trim: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    linkedMaintenanceEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaintenanceEvent',
      default: null,
    },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
    // createdAt is immutable
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: false }
);

faultIncidentSchema.index({ equipmentId: 1, reportedDate: -1 });
faultIncidentSchema.index({ equipmentId: 1, status: 1 });
faultIncidentSchema.index({ tenantId: 1, status: 1, severity: 1 });

module.exports = mongoose.model('FaultIncident', faultIncidentSchema);
