'use strict';

const Equipment = require('../models/Equipment');
const MaintenanceEvent = require('../models/MaintenanceEvent');
const FaultIncident = require('../models/FaultIncident');
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
   * Returns one of four shapes:
   *   { type: 'active',    data: PublicProfile }
   *   { type: 'replaced',  data: TombstoneReplaced }
   *   { type: 'restricted', data: Restricted }
   *   { type: 'not_found' }
   *
   * Revoked/retired tokens with no successor are QR_NOT_FOUND (404).
   * QR_REPLACED is returned only when a successor exists.
   */
  async resolve(qrToken) {
    let equipment = await Equipment.findOne({ qrToken }).lean();
    if (!equipment) {
      equipment = await Equipment.findOne({ 'qrTokenHistory.token': qrToken }).lean();
    }

    if (!equipment) {
      return { type: 'not_found' };
    }

    if (equipment.qrStatus === 'replaced' && equipment.replacedByEquipmentId) {
      let successor = null;
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
      if (successor) {
        return {
          type: 'replaced',
          data: {
            status: 'replaced',
            code: 'QR_REPLACED',
            message: "This equipment has been replaced. Scan the new unit's QR code, or view its profile below.",
            retiredEquipmentCode: equipment.equipmentCode,
            successor,
          },
        };
      }
    }

    if (
      equipment.qrStatus === 'revoked' ||
      equipment.qrStatus === 'replaced' ||
      equipment.qrToken !== qrToken
    ) {
      return { type: 'not_found' };
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

    const [maintenanceSummary, faultSummary] = await Promise.all([
      this._getMaintenanceSummary(equipment._id, equipment.tenantId),
      this._getFaultSummary(equipment._id, equipment.tenantId),
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
        installationDate: equipment.installationDate,
        location: equipment.location,
        status: equipment.status,
        nextMaintenanceDate: equipment.nextMaintenanceDate,
        isOverdue,
        daysOverdue,
        maintenanceSummary,
        faultSummary,
      },
    };
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
}

module.exports = new ScanService();
