'use strict';

const mongoose = require('mongoose');
const MaintenanceEvent = require('../models/MaintenanceEvent');
const Equipment = require('../models/Equipment');
const AppError = require('../utils/AppError');

function sanitize(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  if (obj.tenantId) obj.tenantId = obj.tenantId.toString();
  if (obj.equipmentId) obj.equipmentId = obj.equipmentId.toString();
  if (obj.performedByTechnicianId) obj.performedByTechnicianId = obj.performedByTechnicianId.toString();
  if (obj.createdBy) obj.createdBy = obj.createdBy.toString();
  return obj;
}

class MaintenanceService {
  async list(tenantId, equipmentId, { type, page, pageSize, skip }) {
    await this._assertEquipmentOwned(tenantId, equipmentId);

    const filter = { tenantId, equipmentId };
    if (type) filter.type = type;

    const [docs, totalCount] = await Promise.all([
      MaintenanceEvent.find(filter).sort({ date: -1 }).skip(skip).limit(pageSize).lean(),
      MaintenanceEvent.countDocuments(filter),
    ]);

    return {
      items: docs.map((d) => {
        const obj = { ...d };
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        if (obj.tenantId) obj.tenantId = obj.tenantId.toString();
        if (obj.equipmentId) obj.equipmentId = obj.equipmentId.toString();
        if (obj.performedByTechnicianId) obj.performedByTechnicianId = obj.performedByTechnicianId.toString();
        if (obj.createdBy) obj.createdBy = obj.createdBy.toString();
        return obj;
      }),
      totalCount,
    };
  }

  async create(tenantId, equipmentId, userId, body) {
    const equipment = await this._assertEquipmentOwned(tenantId, equipmentId);

    if (equipment.status === 'Retired') {
      throw new AppError('Cannot add maintenance to retired equipment', 409, 'EQUIPMENT_RETIRED');
    }

    // Validate date is not in the future
    const eventDate = new Date(body.date);
    if (eventDate > new Date()) {
      throw new AppError('Maintenance date cannot be in the future', 422, 'VALIDATION_ERROR');
    }

    const event = new MaintenanceEvent({
      tenantId,
      equipmentId,
      type: body.type,
      performedByTechnicianId: body.performedByTechnicianId,
      date: eventDate,
      description: body.description,
      partsUsed: body.partsUsed || [],
      nextRecommendedDate: body.nextRecommendedDate || null,
      attachments: body.attachments || [],
      createdBy: userId,
    });

    await event.save();

    // Update equipment's nextMaintenanceDate per A5:
    // Use technician's nextRecommendedDate if provided, else date + interval
    const newNextDate = body.nextRecommendedDate
      ? new Date(body.nextRecommendedDate)
      : new Date(eventDate.getTime() + equipment.maintenanceIntervalDays * 86_400_000);

    await Equipment.updateOne(
      { _id: equipmentId },
      { nextMaintenanceDate: newNextDate, updatedAt: new Date() }
    );

    return sanitize(event);
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

module.exports = new MaintenanceService();
