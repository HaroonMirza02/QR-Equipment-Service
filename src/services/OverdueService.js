'use strict';

/**
 * OverdueService — on-the-fly overdue computation.
 *
 * Per ARCHITECTURE.md §5.1:
 *   isOverdue  = nextMaintenanceDate != null && nextMaintenanceDate < now
 *   daysOverdue = floor((now - nextMaintenanceDate) / 86400000), minimum 0
 *
 * Computed at read time, never stored, always correct.
 */
class OverdueService {
  /**
   * Compute isOverdue and daysOverdue for a single nextMaintenanceDate value.
   * @param {Date|null} nextMaintenanceDate
   * @returns {{ isOverdue: boolean, daysOverdue: number }}
   */
  compute(nextMaintenanceDate) {
    if (!nextMaintenanceDate) {
      return { isOverdue: false, daysOverdue: 0 };
    }
    const now = Date.now();
    const diff = now - new Date(nextMaintenanceDate).getTime();
    if (diff <= 0) {
      return { isOverdue: false, daysOverdue: 0 };
    }
    return {
      isOverdue: true,
      daysOverdue: Math.floor(diff / 86_400_000),
    };
  }

  /**
   * Attach isOverdue / daysOverdue fields to a plain equipment object.
   * Works on both Mongoose documents (.toObject()) and lean results.
   * @param {Object} equipmentObj
   * @returns {Object} same object reference with fields added
   */
  annotate(equipmentObj) {
    const { isOverdue, daysOverdue } = this.compute(equipmentObj.nextMaintenanceDate);
    equipmentObj.isOverdue = isOverdue;
    equipmentObj.daysOverdue = daysOverdue;
    return equipmentObj;
  }

  /**
   * Annotate an array of equipment objects in-place.
   */
  annotateMany(equipmentArray) {
    return equipmentArray.map((e) => this.annotate(e));
  }

  /**
   * MongoDB query filter for overdue equipment.
   * Excludes Retired equipment.
   */
  overdueFilter(tenantId) {
    return {
      tenantId,
      status: { $ne: 'Retired' },
      nextMaintenanceDate: { $lt: new Date(), $ne: null },
    };
  }
}

module.exports = new OverdueService();
