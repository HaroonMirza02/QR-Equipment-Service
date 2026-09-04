'use strict';

const Equipment = require('../models/Equipment');
const OverdueService = require('./OverdueService');

function getBaseUrl() {
  return (
    process.env.FRONTEND_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    process.env.BACKEND_URL ||
    process.env.BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

class DemoService {
  /**
   * List demo equipment with pagination and category grouping.
   * Newest added equipment appears FIRST at the top!
   * @param {Object} options - { page: number, pageSize: number, category?: string }
   * @returns {Object} - { data: [], total: number, page: number, pageSize: number, pages: number, byCategory: Object }
   */
  async list(options = {}) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(50, parseInt(options.pageSize, 10) || 12));
    const baseUrl = getBaseUrl();

    // Fetch all public equipment sorted newest created FIRST
    const filter = { isPublicVisible: { $ne: false } };
    if (options.category && options.category !== 'all') {
      filter.category = options.category;
    }

    const records = await Equipment.find(filter)
      .sort({ createdAt: -1 })
      .select('_id equipmentCode name category manufacturer model location status qrStatus qrToken qrTokenHistory nextMaintenanceDate isPublicVisible createdAt')
      .lean();

    // Transform records
    const allEquipment = records.map((equipment) => {
      const historicalToken = equipment.qrTokenHistory?.at(-1)?.token;
      const token = equipment.qrStatus === 'active' ? equipment.qrToken : historicalToken;
      const overdue = OverdueService.compute(equipment.nextMaintenanceDate);

      return {
        id: equipment._id.toString(),
        equipmentCode: equipment.equipmentCode,
        name: equipment.name,
        category: equipment.category,
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        location: equipment.location,
        status: equipment.status,
        qrStatus: equipment.qrStatus,
        isOverdue: overdue.isOverdue,
        daysOverdue: overdue.daysOverdue,
        profileUrl: token ? `/equipment/${token}` : null,
        qrCodeUrl: token ? `${baseUrl}/static/qr/${token}.png` : null,
        createdAt: equipment.createdAt,
      };
    });

    // Group by category for UI rendering
    const byCategory = {};
    allEquipment.forEach((eq) => {
      if (!byCategory[eq.category]) {
        byCategory[eq.category] = [];
      }
      byCategory[eq.category].push(eq);
    });

    // Calculate pagination
    const total = allEquipment.length;
    const pages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const data = allEquipment.slice(start, start + pageSize);

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
