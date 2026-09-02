'use strict';

const Equipment = require('../models/Equipment');
const OverdueService = require('./OverdueService');

const DEMO_CODES = [
  'PUMP-001',
  'PUMP-002',
  'PUMP-003',
  'GEN-002',
  'HVAC-003',
  'PUMP-005',
  'PUMP-006',
];

class DemoService {
  async list() {
    const records = await Equipment.find({ equipmentCode: { $in: DEMO_CODES } })
      .select('equipmentCode name category location status qrStatus qrToken qrTokenHistory nextMaintenanceDate')
      .lean();

    const byCode = new Map(records.map((record) => [record.equipmentCode, record]));
    return DEMO_CODES.map((code) => byCode.get(code)).filter(Boolean).map((equipment) => {
      const historicalToken = equipment.qrTokenHistory?.at(-1)?.token;
      const token = equipment.qrStatus === 'active' ? equipment.qrToken : historicalToken;
      const overdue = OverdueService.compute(equipment.nextMaintenanceDate);
      return {
        equipmentCode: equipment.equipmentCode,
        name: equipment.name,
        category: equipment.category,
        location: equipment.location,
        status: equipment.status,
        qrStatus: equipment.qrStatus,
        isOverdue: overdue.isOverdue,
        daysOverdue: overdue.daysOverdue,
        profileUrl: token ? `/equipment/${token}` : null,
        qrCodeUrl: token ? `/static/qr/${token}.png` : null,
      };
    });
  }
}

module.exports = new DemoService();
