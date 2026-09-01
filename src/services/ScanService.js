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
   *   { type: 'retired',   data: TombstoneRetired }
   *   { type: 'replaced',  data: TombstoneReplaced }
   *   { type: 'not_found' }
   */
  async resolve(qrToken) {
    // Primary lookup: find by active qrToken regardless of qrStatus
    // (retired/replaced equipment keeps its record but qrToken is set to null)
    // We need to also handle the case where someone scans a token that matched
    // a now-retired record. Since we null out qrToken on retire/replace,
    // a direct match on qrToken will only find active records.
    // Tombstone cases (retired/replaced) are therefore unreachable via qrToken
    // after retirement — which is correct: the token is gone, we return 404.
    //
    // However, per ARCHITECTURE.md §4.3, if qrStatus is 'revoked' or 'replaced'
    // and the token is still somehow present (edge-case: future extension where
    // we keep the token but mark it), we return the tombstone.
    // The current implementation nulls out qrToken, so this path returns 404
    // for stale tokens. That is the correct, secure behaviour documented in §6.2.

    const equipment = await Equipment.findOne({ qrToken }).lean();

    if (!equipment) {
      return { type: 'not_found' };
    }

    // Token found — check qrStatus
    if (equipment.qrStatus === 'revoked') {
      return {
        type: 'retired',
        data: {
          status: 'retired',
          code: 'QR_RETIRED',
          message: 'This equipment has been retired and is no longer in service.',
          retiredEquipmentCode: equipment.equipmentCode,
          retiredEquipmentName: equipment.name,
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
            qrCodeUrl: `${baseUrl}/api/public/scan/${newEq.qrToken}`,
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
    const [maintenanceSummary, faultSummary] = await Promise.all([
      this._getMaintenanceSummary(equipment._id),
      this._getFaultSummary(equipment._id),
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

  async _getMaintenanceSummary(equipmentId) {
    const [totalCount, lastEvent] = await Promise.all([
      MaintenanceEvent.countDocuments({ equipmentId }),
      MaintenanceEvent.findOne({ equipmentId }).sort({ date: -1 }).select('date type').lean(),
    ]);
    return {
      totalCount,
      lastMaintenanceDate: lastEvent ? lastEvent.date : null,
      lastMaintenanceType: lastEvent ? lastEvent.type : null,
    };
  }

  async _getFaultSummary(equipmentId) {
    const openFaults = await FaultIncident.find(
      { equipmentId, status: { $ne: 'Resolved' } },
      { severity: 1 }
    ).lean();

    return {
      openCount: openFaults.length,
      highestOpenSeverity: highestSeverity(openFaults.map((f) => f.severity)),
    };
  }
}

module.exports = new ScanService();
