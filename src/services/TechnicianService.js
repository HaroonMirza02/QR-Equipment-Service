'use strict';

const mongoose = require('mongoose');
const Technician = require('../models/Technician');
const AppError = require('../utils/AppError');

/**
 * Strip contactInfo unless the requester is Admin, or is a Technician
 * requesting their own linked record.
 *
 * @param {Object} doc       - lean technician object
 * @param {Object} reqUser   - { id, role, tenantId }
 * @param {string} linkedId  - the Technician._id linked to this user (if role=Technician)
 */
function sanitize(doc, reqUser, linkedId) {
  const obj = { ...doc };
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  if (obj.tenantId) obj.tenantId = obj.tenantId.toString();

  const isAdmin = reqUser.role === 'Admin';
  const isOwnRecord =
    reqUser.role === 'Technician' && linkedId && obj.id === linkedId.toString();

  if (!isAdmin && !isOwnRecord) {
    delete obj.contactInfo;
  }

  return obj;
}

class TechnicianService {
  async list(tenantId, reqUser, linkedTechnicianId, { status, page, pageSize, skip }) {
    const filter = { tenantId };
    if (status) filter.status = status;

    const [docs, totalCount] = await Promise.all([
      Technician.find(filter).sort({ name: 1 }).skip(skip).limit(pageSize).lean(),
      Technician.countDocuments(filter),
    ]);

    return {
      items: docs.map((d) => sanitize(d, reqUser, linkedTechnicianId)),
      totalCount,
    };
  }

  async getById(tenantId, technicianId, reqUser, linkedTechnicianId) {
    if (!mongoose.Types.ObjectId.isValid(technicianId)) {
      throw new AppError('Technician not found', 404, 'TECHNICIAN_NOT_FOUND');
    }
    const doc = await Technician.findById(technicianId).lean();
    if (!doc || doc.tenantId.toString() !== tenantId) {
      throw new AppError('Technician not found', 404, 'TECHNICIAN_NOT_FOUND');
    }
    return sanitize(doc, reqUser, linkedTechnicianId);
  }
}

module.exports = new TechnicianService();
