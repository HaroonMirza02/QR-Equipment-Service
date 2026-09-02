'use strict';

const Equipment = require('../models/Equipment');
const MaintenanceEvent = require('../models/MaintenanceEvent');
const FaultIncident = require('../models/FaultIncident');
const Technician = require('../models/Technician');
const OverdueService = require('./OverdueService');

const SEVERITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];

function highestSeverity(severities) {
  if (!severities || severities.length === 0) return null;
  let max = -1;
  let result = null;
  for (const s of severities) {
    const idx = SEVERITY_ORDER.indexOf(s);
    if (idx > max) { max = idx; result = s; }
  }
  return result;
}

class ScanService {
  /**
   * Resolve a qrToken to a public-safe profile.
   * Returns one of six shapes:
   *   { type: 'active',    data: PublicProfile }
   *   { type: 'retired',   data: TombstoneRetired }
   *   { type: 'replaced',  data: TombstoneReplaced }
   *   { type: 'not_found' }
   */
  async resolve(qrToken) {
    // First resolve the active token. If it is no longer current, look in the
    // immutable token history so a printed retired/replaced label still opens a
    // safe tombstone rather than an ambiguous 404.
    let equipment = await Equipment.findOne({ qrToken }).lean();
    let matchedHistoricalToken = false;

    if (!equipment) {
      equipment = await Equipment.findOne({ 'qrTokenHistory.token': qrToken }).lean();
      matchedHistoricalToken = Boolean(equipment);
    }

    if (!equipment) {
      return { type: 'not_found' };
    }

    // A rotated label belonging to active equipment is deliberately not linked
    // to the new private token. This communicates that the physical label must
    // be replaced without weakening token rotation.
    if (matchedHistoricalToken && equipment.qrStatus === 'active') {
      return {
        type: 'revoked',
        data: {
          status: 'revoked',
          code: 'QR_REVOKED',
          message: 'This label has been revoked. Ask a supervisor for the current equipment label.',
          equipmentCode: equipment.equipmentCode,
        },
      };
    }

    // Token found — check equipment lifecycle
    if (equipment.qrStatus === 'revoked') {
      return {
        type: 'retired',
        data: {
          status: 'retired',
          code: 'QR_RETIRED',
          message: 'This equipment has been retired and is no longer in service.',
          retiredEquipmentCode: equipment.equipmentCode,
          retiredEquipmentName: equipment.name,
          retiredAt: this._historyDate(equipment, qrToken),
          successor: null,
        },
      };
    }

    if (equipment.qrStatus === 'replaced') {
      let successor = null;
      if (equipment.replacedByEquipmentId) {
        const newEq = await Equipment.findById(equipment.replacedByEquipmentId)
          .select('equipmentCode name qrToken')
          .lean();
        if (newEq && newEq.qrToken) {
          const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
          successor = {
            equipmentCode: newEq.equipmentCode,
            name: newEq.name,
            profileUrl: `${baseUrl}/equipment/${newEq.qrToken}`,
          };
        }
      }
      return {
        type: 'replaced',
        data: {
          status: 'replaced',
          code: 'QR_REPLACED',
          message: "This equipment has been replaced. Scan the new unit's QR code, or view its profile below.",
          retiredEquipmentCode: equipment.equipmentCode,
          retiredAt: this._historyDate(equipment, qrToken),
          successor,
        },
      };
    }

    // Active equipment — check isPublicVisible
    if (!equipment.isPublicVisible) {
      return {
        type: 'restricted',
        data: {
          status: 'restricted',
          code: 'QR_NOT_PUBLIC',
          message: 'This equipment profile is not publicly accessible.',
        },
      };
    }

    // Build public profile
    const [maintenanceSummary, faultSummary, maintenanceHistory, faultHistory, technician] = await Promise.all([
      this._getMaintenanceSummary(equipment._id, equipment.tenantId),
      this._getFaultSummary(equipment._id, equipment.tenantId),
      this._getMaintenanceHistory(equipment._id, equipment.tenantId),
      this._getFaultHistory(equipment._id, equipment.tenantId),
      equipment.assignedTechnicianId
        ? Technician.findOne({ _id: equipment.assignedTechnicianId, tenantId: equipment.tenantId })
          .select('name specialty status')
          .lean()
        : null,
    ]);

    const { isOverdue, daysOverdue } = OverdueService.compute(equipment.nextMaintenanceDate);

    return {
      type: 'active',
      data: {
        equipmentCode: equipment.equipmentCode,
        name: equipment.name,
        category: equipment.category,
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        serialNumber: equipment.serialNumber,
        installationDate: equipment.installationDate,
        location: equipment.location,
        status: equipment.status,
        maintenanceIntervalDays: equipment.maintenanceIntervalDays,
        nextMaintenanceDate: equipment.nextMaintenanceDate,
        isOverdue,
        daysOverdue,
        maintenanceSummary,
        faultSummary,
        assignedTechnician: technician ? {
          name: technician.name,
          specialty: technician.specialty,
          status: technician.status,
        } : null,
        maintenanceHistory,
        faultHistory,
        recordUpdatedAt: equipment.updatedAt,
      },
    };
  }

  _historyDate(equipment, qrToken) {
    const entry = equipment.qrTokenHistory?.find((item) => item.token === qrToken);
    return entry?.revokedAt || equipment.updatedAt || null;
  }

  async _getMaintenanceSummary(equipmentId, tenantId) {
    const [totalCount, lastEvent] = await Promise.all([
      MaintenanceEvent.countDocuments({ equipmentId, tenantId }),
      MaintenanceEvent.findOne({ equipmentId, tenantId }).sort({ date: -1 }).select('date type').lean(),
    ]);
    return {
      totalCount,
      lastMaintenanceDate: lastEvent ? lastEvent.date : null,
      lastMaintenanceType: lastEvent ? lastEvent.type : null,
    };
  }

  async _getFaultSummary(equipmentId, tenantId) {
    const openFaults = await FaultIncident.find(
      { equipmentId, tenantId, status: { $ne: 'Resolved' } },
      { severity: 1 }
    ).lean();

    return {
      openCount: openFaults.length,
      highestOpenSeverity: highestSeverity(openFaults.map((f) => f.severity)),
    };
  }

  async _getMaintenanceHistory(equipmentId, tenantId) {
    const events = await MaintenanceEvent.find({ equipmentId, tenantId })
      .sort({ date: -1 })
      .limit(10)
      .select('type date description partsUsed nextRecommendedDate performedByTechnicianId')
      .populate('performedByTechnicianId', 'name specialty')
      .lean();

    return events.map((event) => ({
      type: event.type,
      date: event.date,
      description: event.description,
      partsUsed: event.partsUsed,
      nextRecommendedDate: event.nextRecommendedDate,
      technician: event.performedByTechnicianId ? {
        name: event.performedByTechnicianId.name,
        specialty: event.performedByTechnicianId.specialty,
      } : null,
    }));
  }

  async _getFaultHistory(equipmentId, tenantId) {
    const faults = await FaultIncident.find({ equipmentId, tenantId })
      .sort({ reportedDate: -1 })
      .limit(10)
      .select('reportedDate severity description status resolvedDate resolutionNotes')
      .lean();

    return faults.map((fault) => ({
      reportedDate: fault.reportedDate,
      severity: fault.severity,
      description: fault.description,
      status: fault.status,
      resolvedDate: fault.resolvedDate,
      resolutionNotes: fault.resolutionNotes,
    }));
  }
}

module.exports = new ScanService();
