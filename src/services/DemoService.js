'use strict';

const Equipment = require('../models/Equipment');
const OverdueService = require('./OverdueService');

const DEMO_CODES = [
  'PUMP-001', 'PUMP-002', 'PUMP-003', 'PUMP-004', 'PUMP-005', 'PUMP-006', 'PUMP-007',
  'PUMP-008', 'PUMP-009', 'PUMP-010', 'PUMP-011', 'PUMP-012', 'PUMP-013',
  'GEN-001', 'GEN-002', 'GEN-003', 'GEN-004', 'GEN-005', 'GEN-006',
  'COMP-001', 'COMP-002', 'COMP-003', 'COMP-004', 'COMP-005', 'COMP-006', 'COMP-007',
  'HVAC-001', 'HVAC-002', 'HVAC-003', 'HVAC-004', 'HVAC-005', 'HVAC-006', 'HVAC-007',
  'ELEC-001', 'ELEC-002', 'ELEC-003', 'ELEC-004', 'ELEC-005', 'ELEC-006',
  'CONV-001', 'CONV-002', 'PRESS-001', 'MILL-001', 'DRILL-001', 'SAW-001',
  'WELD-001', 'WELD-002', 'TEST-001', 'PACK-001', 'LAB-001', 'LAB-002',
];

class DemoService {
  /**
   * List demo equipment with pagination and category grouping
   * @param {Object} options - { page: number, pageSize: number, category?: string }
   * @returns {Object} - { data: [], total: number, page: number, pageSize: number, pages: number, byCategory: Object }
   */
  async list(options = {}) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(50, parseInt(options.pageSize, 10) || 12));

    // Fetch all demo equipment
    const records = await Equipment.find({ equipmentCode: { $in: DEMO_CODES } })
      .select('equipmentCode name category location status qrStatus qrToken qrTokenHistory nextMaintenanceDate isPublicVisible')
      .lean();

    // Map records by code
    const byCode = new Map(records.map((record) => [record.equipmentCode, record]));
    
    // Transform all records
    const allEquipment = DEMO_CODES
      .map((code) => byCode.get(code))
      .filter(Boolean)
      .filter((eq) => eq.isPublicVisible !== false)  // Exclude private equipment from demo
      .map((equipment) => {
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

    // Apply category filter if provided
    let filtered = allEquipment;
    if (options.category && options.category !== 'all') {
      filtered = allEquipment.filter((eq) => eq.category === options.category);
    }

    // Group by category for UI rendering
    const byCategory = {};
    allEquipment.forEach((eq) => {
      if (!byCategory[eq.category]) {
        byCategory[eq.category] = [];
      }
      byCategory[eq.category].push(eq);
    });

    // Calculate pagination
    const total = filtered.length;
    const pages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      pages,
      hasNextPage: page < pages,
      hasPrevPage: page > 1,
      byCategory,
    };
  }
}

module.exports = new DemoService();
