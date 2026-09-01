'use strict';

const mongoose = require('mongoose');
const FaultIncident = require('../models/FaultIncident');
const Equipment = require('../models/Equipment');
const AppError = require('../utils/AppError');

// Valid forward-only status transitions (ARCHITECTURE.md §5.7)
const VALID_TRANSITIONS = {
  'Open': ['In Progress', 'Resolved'],
  'In Progress': ['Resolved'],
  'Resolved': [], // terminal state — no backward transitions
};

function sanitize(obj) {
  const result = obj.toObject ? obj.toObject() : { ...obj };
  result.id = result._id.toString();
  delete result._id;
  delete result.__v;
  if (result.tenantId) result.tenantId = result.tenantId.toString();
  if (result.equipmentId) result.equipmentId = result.equipmentId.toString();
  if (result.reportedBy) result.reportedBy = result.reportedBy.toString();
  if (result.resolvedBy) result.resolvedBy = result.resolvedBy.toString();
  if (result.linkedMaintenanceEventId) result.linkedMaintenanceEventId = result.linkedMaintenanceEventId.toString();
  return result;
}

class FaultService {
  async list(tenantId, equipmentId, { status, severity, page, pageSize, skip }) {
    await this._assertEquipmentOwned(tenantId, equipmentId);

    const filter = { tenantId, equipmentId };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const [docs, totalCount] = await Promise.all([
      FaultIncident.find(filter).sort({ reportedDate: -1 }).skip(skip).limit(pageSize).lean(),
      FaultIncident.countDocuments(filter),
    ]);

    return {
      items: docs.map((d) => {
        const obj = { ...d };
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        if (obj.tenantId) obj.tenantId = obj.tenantId.toString();
        if (obj.equipmentId) obj.equipmentId = obj.equipmentId.toString();
        if (obj.reportedBy) obj.reportedBy = obj.reportedBy.toString();
        if (obj.resolvedBy) obj.resolvedBy = obj.resolvedBy.toString();
        if (obj.linkedMaintenanceEventId) obj.linkedMaintenanceEventId = obj.linkedMaintenanceEventId.toString();
        return obj;
      }),
      totalCount,
    };
  }

  async create(tenantId, equipmentId, userId, body) {
    const equipment = await this._assertEquipmentOwned(tenantId, equipmentId);

    if (equipment.status === 'Retired') {
      throw new AppError('Cannot add fault to retired equipment', 409, 'EQUIPMENT_RETIRED');
    }

    const fault = new FaultIncident({
      tenantId,
      equipmentId,
      reportedDate: new Date(body.reportedDate),
      reportedBy: userId,
      severity: body.severity,
      description: body.description,
      status: 'Open',
    });

    await fault.save();
    return sanitize(fault);
  }

  async resolve(tenantId, faultId, userId, body) {
    if (!mongoose.Types.ObjectId.isValid(faultId)) {
      throw new AppError('Fault not found', 404, 'FAULT_NOT_FOUND');
    }

    const fault = await FaultIncident.findById(faultId);
    if (!fault || fault.tenantId.toString() !== tenantId) {
      throw new AppError('Fault not found', 404, 'FAULT_NOT_FOUND');
    }

    const { status: newStatus, resolutionNotes, resolvedDate, linkedMaintenanceEventId } = body;

    // Validate state machine transition
    const allowed = VALID_TRANSITIONS[fault.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new AppError(
        `Invalid status transition: ${fault.status} → ${newStatus}`,
        409,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Append audit entry
    fault.statusHistory.push({
      from: fault.status,
      to: newStatus,
      changedBy: userId,
      changedAt: new Date(),
      note: resolutionNotes || '',
    });

    fault.status = newStatus;

    if (newStatus === 'Resolved') {
      fault.resolvedDate = resolvedDate ? new Date(resolvedDate) : new Date();
      fault.resolutionNotes = resolutionNotes || null;
      fault.resolvedBy = userId;
    }

    if (linkedMaintenanceEventId) {
      fault.linkedMaintenanceEventId = linkedMaintenanceEventId;
    }

    await fault.save();
    return sanitize(fault);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  async _assertEquipmentOwned(tenantId, equipmentId) {
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      throw new AppError('Equipment not found', 404, 'EQUIPMENT_NOT_FOUND');
    }
    const equipment = await Equipment.findById(equipmentId).lean();
    if (!equipment || equipment.tenantId.toString() !== tenantId) {
      throw new AppError('Equipment not found', 404, 'EQUIPMENT_NOT_FOUND');
    }
    return equipment;
  }
}

module.exports = new FaultService();
