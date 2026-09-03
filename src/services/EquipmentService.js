'use strict';

const mongoose = require('mongoose');
const Equipment = require('../models/Equipment');
const QRService = require('./QRService');
const OverdueService = require('./OverdueService');
const AppError = require('../utils/AppError');

/**
 * Strip internal fields before returning equipment to API consumers.
 * _id is exposed as `id` (string). qrToken and qrTokenHistory are never returned.
 */
function sanitize(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  delete obj.qrToken;
  delete obj.qrTokenHistory;
  // Convert ObjectId refs to strings for consistent JSON output
  if (obj.tenantId) obj.tenantId = obj.tenantId.toString();
  if (obj.assignedTechnicianId) obj.assignedTechnicianId = obj.assignedTechnicianId.toString();
  if (obj.replacedByEquipmentId) obj.replacedByEquipmentId = obj.replacedByEquipmentId.toString();
  if (obj.replacedFromEquipmentId) obj.replacedFromEquipmentId = obj.replacedFromEquipmentId.toString();
  return OverdueService.annotate(obj);
}

class EquipmentService {
  // ── List ────────────────────────────────────────────────────────────────────

  async list(tenantId, { status, category, assignedTechnicianId, page, pageSize, skip }) {
    const filter = { tenantId };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (assignedTechnicianId) {
      if (!mongoose.Types.ObjectId.isValid(assignedTechnicianId)) {
        throw new AppError('Invalid assignedTechnicianId', 422, 'VALIDATION_ERROR');
      }
      filter.assignedTechnicianId = assignedTechnicianId;
    }

    const [docs, totalCount] = await Promise.all([
      Equipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      Equipment.countDocuments(filter),
    ]);

    return { items: docs.map((d) => OverdueService.annotate(sanitizeFromLean(d))), totalCount };
  }

  // ── Overdue list ─────────────────────────────────────────────────────────────

  async listOverdue(tenantId, { page, pageSize, skip }) {
    const filter = OverdueService.overdueFilter(tenantId);
    const [docs, totalCount] = await Promise.all([
      Equipment.find(filter).sort({ nextMaintenanceDate: 1 }).skip(skip).limit(pageSize).lean(),
      Equipment.countDocuments(filter),
    ]);
    return { items: docs.map((d) => OverdueService.annotate(sanitizeFromLean(d))), totalCount };
  }

  // ── Get one ──────────────────────────────────────────────────────────────────

  async getById(tenantId, equipmentId) {
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      throw new AppError('Invalid equipment id', 404, 'EQUIPMENT_NOT_FOUND');
    }
    const doc = await Equipment.findById(equipmentId).lean();
    if (!doc) throw new AppError('Equipment not found', 404, 'EQUIPMENT_NOT_FOUND');
    // Cross-tenant: return 404, not 403 (ARCHITECTURE.md §6.1)
    if (doc.tenantId.toString() !== tenantId) {
      throw new AppError('Equipment not found', 404, 'EQUIPMENT_NOT_FOUND');
    }
    return OverdueService.annotate(sanitizeFromLean(doc));
  }

  async getQR(tenantId, equipmentId) {
    const equipment = await this._loadOwned(tenantId, equipmentId);
    if (equipment.status === 'Retired' || equipment.qrStatus !== 'active') {
      throw new AppError('Active QR is not available for retired equipment', 409, 'QR_NOT_ACTIVE');
    }

    const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    return {
      equipmentCode: equipment.equipmentCode,
      name: equipment.name,
      qrCodeUrl: `${baseUrl}/static/qr/${equipment.qrToken}.png`,
      profileUrl: `${baseUrl}/equipment/${equipment.qrToken}`,
    };
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  async create(tenantId, body) {
    // Check code uniqueness
    await this._assertCodeUnique(tenantId, body.equipmentCode);

    const { token, qrCodeUrl } = await QRService.issueNew();

    const equipment = new Equipment({
      tenantId,
      ...body,
      qrToken: token,
      qrStatus: 'active',
      qrTokenHistory: [],
      status: 'Operational',
    });

    await equipment.save();

    const result = sanitize(equipment);
    result.qrCodeUrl = qrCodeUrl;
    return result;
  }

  // ── Patch ────────────────────────────────────────────────────────────────────

  async patch(tenantId, equipmentId, body) {
    const equipment = await this._loadOwned(tenantId, equipmentId);

    const PATCHABLE = [
      'name', 'category', 'manufacturer', 'model', 'serialNumber',
      'location', 'maintenanceIntervalDays', 'assignedTechnicianId',
      'isPublicVisible', 'notes',
    ];

    // If equipmentCode is being changed, check uniqueness
    if (body.equipmentCode && body.equipmentCode !== equipment.equipmentCode) {
      await this._assertCodeUnique(tenantId, body.equipmentCode, equipmentId);
      equipment.equipmentCode = body.equipmentCode;
    }

    for (const field of PATCHABLE) {
      if (body[field] !== undefined) {
        equipment[field] = body[field];
      }
    }

    await equipment.save();
    return sanitize(equipment);
  }

  // ── Retire ───────────────────────────────────────────────────────────────────

  async retire(tenantId, equipmentId, userId, reason) {
    const equipment = await this._loadOwned(tenantId, equipmentId);

    if (equipment.status === 'Retired') {
      throw new AppError('Equipment is already retired', 409, 'ALREADY_RETIRED');
    }

    equipment.status = 'Retired';
    QRService.revokeToken(equipment, userId, reason || 'retired');

    await equipment.save();
    return sanitize(equipment);
  }

  // ── Replace ──────────────────────────────────────────────────────────────────

  async replace(tenantId, oldEquipmentId, userId, body) {
    const oldEquipment = await this._loadOwned(tenantId, oldEquipmentId);

    if (oldEquipment.replacedByEquipmentId) {
      throw new AppError('Equipment has already been replaced', 409, 'ALREADY_REPLACED');
    }
    if (oldEquipment.status === 'Retired' && oldEquipment.qrStatus === 'revoked') {
      throw new AppError('Equipment has already been retired without a replacement', 409, 'ALREADY_RETIRED');
    }

    let newEquipment;

    if (body.replacementEquipmentId) {
      // Case A: Link to an existing successor asset
      const successor = await this._loadOwned(tenantId, body.replacementEquipmentId);
      if (successor.id === oldEquipment.id) {
        throw new AppError('Equipment cannot replace itself', 400, 'INVALID_REPLACEMENT');
      }
      successor.replacedFromEquipmentId = oldEquipment._id;
      await successor.save();
      newEquipment = successor;
    } else {
      // Case B: Create new replacement equipment definition
      await this._assertCodeUnique(tenantId, body.equipmentCode);

      const { token } = await QRService.issueNew();

      newEquipment = new Equipment({
        tenantId,
        ...body,
        qrToken: token,
        qrStatus: 'active',
        qrTokenHistory: [],
        status: 'Operational',
        replacedFromEquipmentId: oldEquipment._id,
      });
      await newEquipment.save();
    }

    // Now update old record
    oldEquipment.status = 'Retired';
    oldEquipment.replacedByEquipmentId = newEquipment._id;
    QRService.markReplaced(oldEquipment, userId, body.reason || (`replaced by ${newEquipment.equipmentCode}`));
    await oldEquipment.save();

    return {
      retiredEquipment: {
        id: oldEquipment._id.toString(),
        equipmentCode: oldEquipment.equipmentCode,
        status: oldEquipment.status,
      },
      newEquipment: sanitize(newEquipment),
    };
  }

  // ── Regenerate QR ────────────────────────────────────────────────────────────

  async regenerateQR(tenantId, equipmentId, userId, reason) {
    const equipment = await this._loadOwned(tenantId, equipmentId);

    if (equipment.status === 'Retired') {
      throw new AppError('Cannot regenerate QR for retired equipment', 409, 'EQUIPMENT_RETIRED');
    }

    const qrCodeUrl = await QRService.rotateToken(equipment, userId, reason || 'regenerated by admin');
    await equipment.save();

    return { qrCodeUrl, regeneratedAt: new Date().toISOString() };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  async _loadOwned(tenantId, equipmentId) {
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      throw new AppError('Equipment not found', 404, 'EQUIPMENT_NOT_FOUND');
    }
    const equipment = await Equipment.findById(equipmentId);
    if (!equipment || equipment.tenantId.toString() !== tenantId) {
      throw new AppError('Equipment not found', 404, 'EQUIPMENT_NOT_FOUND');
    }
    return equipment;
  }

  async _assertCodeUnique(tenantId, equipmentCode, excludeId = null) {
    const filter = { tenantId, equipmentCode };
    if (excludeId) filter._id = { $ne: excludeId };
    const existing = await Equipment.findOne(filter).lean();
    if (existing) {
      throw new AppError(
        `Equipment code '${equipmentCode}' already exists in this tenant`,
        409,
        'EQUIPMENT_CODE_CONFLICT'
      );
    }
  }
}

// ── Lean-object sanitizer (no toObject()) ────────────────────────────────────
function sanitizeFromLean(obj) {
  const result = { ...obj };
  result.id = result._id.toString();
  delete result._id;
  delete result.__v;
  delete result.qrToken;
  delete result.qrTokenHistory;
  if (result.tenantId) result.tenantId = result.tenantId.toString();
  if (result.assignedTechnicianId) result.assignedTechnicianId = result.assignedTechnicianId.toString();
  if (result.replacedByEquipmentId) result.replacedByEquipmentId = result.replacedByEquipmentId.toString();
  if (result.replacedFromEquipmentId) result.replacedFromEquipmentId = result.replacedFromEquipmentId.toString();
  return result;
}

module.exports = new EquipmentService();
