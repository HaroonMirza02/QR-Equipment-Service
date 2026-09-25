'use strict';

/**
 * Seed Script — QR Equipment Service
 *
 * Creates:
 *   - 1 tenant (Meridian Industrial Services)
 *   - 4 users (Admin, Technician x2, Viewer)
 *   - 4 technicians
 *   - 18 realistic industrial equipment items matching the specification:
 *       Pumps (7), Generators (3), Compressors (3), Production Machines (2), HVAC (3)
 *     Statuses: 12 Operational (4 Overdue), 2 Under Maintenance, 2 Faulty, 2 Retired (1 revoked, 1 replaced)
 *     1 Private / Restricted asset (GEN-003)
 *     1 Replaced chain: PUMP-006 → PUMP-007
 *   - Realistic domain-specific maintenance events and fault incidents
 *   - Valid QR tokens and QR code PNG assets in public/qr
 *
 * Safe to re-run: drops existing data for the seeded tenant before inserting.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { connectDB } = require('../config/database');

const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Technician = require('../models/Technician');
const Equipment = require('../models/Equipment');
const MaintenanceEvent = require('../models/MaintenanceEvent');
const FaultIncident = require('../models/FaultIncident');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const QR_DIR = path.join(__dirname, '..', '..', process.env.QR_STORAGE_PATH || 'public/qr');

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000);
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 86_400_000);
}

async function genToken() {
  for (let i = 0; i < 3; i++) {
    const t = crypto.randomBytes(32).toString('hex');
    const exists = await Equipment.findOne({ qrToken: t }).lean();
    if (!exists) return t;
  }
  throw new Error('Could not generate unique QR token');
}

async function genQRImage(token) {
  try {
    if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });
    const file = path.join(QR_DIR, `${token}.png`);
    const url = `${BASE_URL}/equipment/${token}`;
    await QRCode.toFile(file, url, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 300 });
  } catch (_err) {
    // Graceful fallback for read-only or serverless filesystems
  }
  return `${BASE_URL}/static/qr/${token}.png`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log(`[seed] Connected to MongoDB database: ${mongoose.connection.name}`);

  // ── Tenant ────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ slug: 'meridian-industrial' });
  if (tenant) {
    console.log('[seed] Cleaning existing tenant data…');
    const tid = tenant._id;
    await Promise.all([
      FaultIncident.deleteMany({ tenantId: tid }),
      MaintenanceEvent.deleteMany({ tenantId: tid }),
      Equipment.deleteMany({ tenantId: tid }),
      Technician.deleteMany({ tenantId: tid }),
      User.deleteMany({ tenantId: tid }),
    ]);
  } else {
    tenant = await Tenant.create({
      name: 'Meridian Industrial Services',
      slug: 'meridian-industrial',
      isActive: true,
    });
  }
  const tenantId = tenant._id;
  console.log(`[seed] Tenant: ${tenant.name} (${tenantId})`);

  // ── Technicians ───────────────────────────────────────────────────────────
  const [tech1, tech2, tech3, tech4] = await Technician.insertMany([
    {
      tenantId,
      name: 'Rafael Montoya',
      specialty: 'Hydraulics & Pumping Systems',
      contactInfo: { phone: '+1-555-0101', email: 'r.montoya@meridian.example' },
      status: 'active',
    },
    {
      tenantId,
      name: 'Siobhan Delacroix',
      specialty: 'Electrical & Power Systems',
      contactInfo: { phone: '+1-555-0102', email: 's.delacroix@meridian.example' },
      status: 'active',
    },
    {
      tenantId,
      name: 'Kwame Asante',
      specialty: 'HVAC & Refrigeration',
      contactInfo: { phone: '+1-555-0103', email: 'k.asante@meridian.example' },
      status: 'active',
    },
    {
      tenantId,
      name: 'Priya Nair',
      specialty: 'Rotating Equipment & Production Machinery',
      contactInfo: { phone: '+1-555-0104', email: 'p.nair@meridian.example' },
      status: 'active',
    },
  ]);
  console.log('[seed] Technicians created: 4');

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin1234!', BCRYPT_ROUNDS);
  const techHash  = await bcrypt.hash('Tech1234!',  BCRYPT_ROUNDS);
  const viewHash  = await bcrypt.hash('View1234!',  BCRYPT_ROUNDS);

  const [adminUser, techUser1, techUser2, viewerUser] = await User.insertMany([
    {
      tenantId,
      name: 'Alexandra Voss',
      email: 'admin@meridian.example',
      passwordHash: adminHash,
      role: 'Admin',
      isActive: true,
    },
    {
      tenantId,
      name: 'Rafael Montoya',
      email: 'tech1@meridian.example',
      passwordHash: techHash,
      role: 'Technician',
      linkedTechnicianId: tech1._id,
      isActive: true,
    },
    {
      tenantId,
      name: 'Siobhan Delacroix',
      email: 'tech2@meridian.example',
      passwordHash: techHash,
      role: 'Technician',
      linkedTechnicianId: tech2._id,
      isActive: true,
    },
    {
      tenantId,
      name: 'Marcus Webb',
      email: 'viewer@meridian.example',
      passwordHash: viewHash,
      role: 'Viewer',
      isActive: true,
    },
  ]);
  console.log('[seed] Users created: 4');

  // ── Equipment helper ──────────────────────────────────────────────────────
  async function mkEquipment(overrides) {
    const token = await genToken();
    await genQRImage(token);
    const doc = await Equipment.create({
      tenantId,
      qrToken: token,
      qrStatus: 'active',
      qrTokenHistory: [],
      isPublicVisible: true,
      status: 'Operational',
      ...overrides,
    });
    return doc;
  }

  // ── 18 Realistic Industrial Equipment Items ───────────────────────────────

  // ── PUMPS (PUMP-001 to PUMP-007) ──────────────────────────────────────────
  const pump001 = await mkEquipment({
    equipmentCode: 'PUMP-001',
    name: 'Primary Transfer Pump A',
    category: 'Pump',
    manufacturer: 'Grundfos',
    model: 'CM5-6 A-R-I-E-AVBE',
    serialNumber: 'GF-2021-00441',
    installationDate: daysAgo(1200),
    location: { site: 'Plant A', building: 'Block 1', zone: 'Zone 1' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(22),
    assignedTechnicianId: tech1._id,
  });

  const pump002 = await mkEquipment({
    equipmentCode: 'PUMP-002',
    name: 'Secondary Transfer Pump B',
    category: 'Pump',
    manufacturer: 'Grundfos',
    model: 'CM10-12 A-R-I-E-AVBE',
    serialNumber: 'GF-2020-00882',
    installationDate: daysAgo(1800),
    location: { site: 'Plant A', building: 'Block 1', zone: 'Zone 2' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysAgo(15),   // overdue
    assignedTechnicianId: tech1._id,
  });

  const pump003 = await mkEquipment({
    equipmentCode: 'PUMP-003',
    name: 'Coolant Circulation Pump',
    category: 'Pump',
    manufacturer: 'KSB',
    model: 'Etanorm 032-200',
    serialNumber: 'KSB-2019-11023',
    installationDate: daysAgo(2200),
    location: { site: 'Plant A', building: 'Block 2', zone: 'Zone 3' },
    status: 'Faulty',
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysAgo(5),    // overdue
    assignedTechnicianId: tech1._id,
  });

  const pump004 = await mkEquipment({
    equipmentCode: 'PUMP-004',
    name: 'Fire Suppression Jockey Pump',
    category: 'Pump',
    manufacturer: 'Pentair',
    model: 'Aurora 411',
    serialNumber: 'PE-2020-JSP-0003',
    installationDate: daysAgo(1400),
    location: { site: 'Plant A', building: 'Fire Pump House', zone: 'Ground' },
    maintenanceIntervalDays: 30,
    nextMaintenanceDate: daysFromNow(5),
    assignedTechnicianId: tech1._id,
  });

  // PUMP-005 — RETIRED (no successor)
  const pump005token = await genToken();
  await genQRImage(pump005token);
  const pump005 = await Equipment.create({
    tenantId,
    qrToken: pump005token,
    qrStatus: 'revoked',
    qrTokenHistory: [
      {
        token: pump005token,
        revokedAt: daysAgo(45),
        revokedBy: adminUser._id,
        reason: 'retired — end of service life',
      },
    ],
    equipmentCode: 'PUMP-005',
    name: 'Condensate Return Pump (Retired)',
    category: 'Pump',
    manufacturer: 'Flowserve',
    model: 'Mark 3 1.5x1-6',
    serialNumber: 'FS-2015-CRP-0001',
    installationDate: daysAgo(3600),
    location: { site: 'Plant A', building: 'Block 2', zone: 'Zone 1' },
    status: 'Retired',
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: null,
    isPublicVisible: true,
  });
  await Equipment.updateOne({ _id: pump005._id }, { qrToken: `REVOKED:${pump005._id}` });

  // PUMP-006 (OLD — REPLACED by PUMP-007)
  const pump006token = await genToken();
  await genQRImage(pump006token);
  const pump006 = await Equipment.create({
    tenantId,
    qrToken: pump006token,
    qrStatus: 'replaced',
    qrTokenHistory: [
      {
        token: pump006token,
        revokedAt: daysAgo(20),
        revokedBy: adminUser._id,
        reason: 'replaced by PUMP-007',
      },
    ],
    equipmentCode: 'PUMP-006',
    name: 'Boiler Feed Pump (Replaced)',
    category: 'Pump',
    manufacturer: 'Sulzer',
    model: 'BB1 2x3-8',
    serialNumber: 'SU-2016-BFP-0002',
    installationDate: daysAgo(3000),
    location: { site: 'Plant A', building: 'Boiler House', zone: 'Ground' },
    status: 'Retired',
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: null,
    isPublicVisible: true,
  });
  await Equipment.updateOne({ _id: pump006._id }, { qrToken: `REPLACED:${pump006._id}` });

  // PUMP-007 (NEW REPLACEMENT)
  const pump007 = await mkEquipment({
    equipmentCode: 'PUMP-007',
    name: 'Boiler Feed Pump Mk2',
    category: 'Pump',
    manufacturer: 'Sulzer',
    model: 'BB1 3x4-10',
    serialNumber: 'SU-2026-BFP-0044',
    installationDate: daysAgo(20),
    location: { site: 'Plant A', building: 'Boiler House', zone: 'Ground' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(70),
    assignedTechnicianId: tech1._id,
    replacedFromEquipmentId: pump006._id,
  });
  await Equipment.updateOne({ _id: pump006._id }, { replacedByEquipmentId: pump007._id });

  // ── GENERATORS (GEN-001 to GEN-003) ───────────────────────────────────────
  const gen001 = await mkEquipment({
    equipmentCode: 'GEN-001',
    name: 'Standby Generator Unit 1',
    category: 'Generator',
    manufacturer: 'Caterpillar',
    model: 'C15 ACERT',
    serialNumber: 'CAT-2022-GEN-0031',
    installationDate: daysAgo(730),
    location: { site: 'Plant A', building: 'Utility Block', zone: 'Zone 1' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysFromNow(60),
    assignedTechnicianId: tech2._id,
  });

  const gen002 = await mkEquipment({
    equipmentCode: 'GEN-002',
    name: 'Standby Generator Unit 2',
    category: 'Generator',
    manufacturer: 'Caterpillar',
    model: 'C18 ACERT',
    serialNumber: 'CAT-2021-GEN-0055',
    installationDate: daysAgo(900),
    location: { site: 'Plant B', building: 'Utility Block', zone: 'Zone 1' },
    status: 'Under Maintenance',
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysAgo(8),    // overdue
    assignedTechnicianId: tech2._id,
  });

  const gen003 = await mkEquipment({
    equipmentCode: 'GEN-003',
    name: 'Emergency Generator — Data Room',
    category: 'Generator',
    manufacturer: 'Cummins',
    model: 'C250 D5',
    serialNumber: 'CUM-2022-EG-0007',
    installationDate: daysAgo(500),
    location: { site: 'Admin Block', building: 'Server Room', zone: 'B1' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(30),
    assignedTechnicianId: tech2._id,
    isPublicVisible: false,
    notes: 'Restricted — data room access required for physical inspection.',
  });

  // ── COMPRESSORS (COMP-001 to COMP-003) ────────────────────────────────────
  const comp001 = await mkEquipment({
    equipmentCode: 'COMP-001',
    name: 'Air Compressor Station 1',
    category: 'Compressor',
    manufacturer: 'Atlas Copco',
    model: 'GA 22 VSD+',
    serialNumber: 'AC-2020-00312',
    installationDate: daysAgo(1500),
    location: { site: 'Plant A', building: 'Block 3', zone: 'Zone 1' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysFromNow(10),
    assignedTechnicianId: tech4._id,
  });

  const comp002 = await mkEquipment({
    equipmentCode: 'COMP-002',
    name: 'Air Compressor Station 2',
    category: 'Compressor',
    manufacturer: 'Atlas Copco',
    model: 'GA 37 VSD+',
    serialNumber: 'AC-2019-00418',
    installationDate: daysAgo(1900),
    location: { site: 'Plant A', building: 'Block 3', zone: 'Zone 2' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysAgo(30),   // overdue
    assignedTechnicianId: tech4._id,
  });

  const comp003 = await mkEquipment({
    equipmentCode: 'COMP-003',
    name: 'Nitrogen Generator Compressor',
    category: 'Compressor',
    manufacturer: 'Parker Hannifin',
    model: 'HPNM-45',
    serialNumber: 'PH-2021-NGC-0019',
    installationDate: daysAgo(1100),
    location: { site: 'Plant B', building: 'Block 4', zone: 'Zone 2' },
    status: 'Under Maintenance',
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysAgo(3),
    assignedTechnicianId: tech4._id,
  });

  // ── PRODUCTION MACHINES (MACH-001, MACH-002) ──────────────────────────────
  const mach001 = await mkEquipment({
    equipmentCode: 'MACH-001',
    name: 'CNC Production Milling Machine',
    category: 'Other',
    manufacturer: 'Haas Automation',
    model: 'UMC-750 5-Axis',
    serialNumber: 'HA-2021-UMC-0750',
    installationDate: daysAgo(1500),
    location: { site: 'Plant A', building: 'Machine Shop', zone: 'Bay 1' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysAgo(14),   // overdue
    assignedTechnicianId: tech4._id,
  });

  const mach002 = await mkEquipment({
    equipmentCode: 'MACH-002',
    name: 'Industrial Hydraulic Stamping Press',
    category: 'Other',
    manufacturer: 'Schuler',
    model: 'ECOPRESS 630',
    serialNumber: 'SC-2020-PRS-0630',
    installationDate: daysAgo(1800),
    location: { site: 'Plant A', building: 'Press Bay', zone: 'Line 1' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysFromNow(45),
    assignedTechnicianId: tech4._id,
  });

  // ── HVAC (HVAC-001 to HVAC-003) ───────────────────────────────────────────
  const hvac001 = await mkEquipment({
    equipmentCode: 'HVAC-001',
    name: 'Chiller Unit — Production Floor',
    category: 'HVAC',
    manufacturer: 'Trane',
    model: 'CGAM030',
    serialNumber: 'TR-2021-CHI-0017',
    installationDate: daysAgo(850),
    location: { site: 'Plant A', building: 'Block 1', zone: 'Roof' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(45),
    assignedTechnicianId: tech3._id,
  });

  const hvac002 = await mkEquipment({
    equipmentCode: 'HVAC-002',
    name: 'AHU — Administration Building',
    category: 'HVAC',
    manufacturer: 'Carrier',
    model: '39HQ040',
    serialNumber: 'CA-2018-AHU-0029',
    installationDate: daysAgo(2500),
    location: { site: 'Admin Block', building: 'Main Building', zone: 'Roof' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysAgo(44),   // overdue
    assignedTechnicianId: tech3._id,
  });

  const hvac003 = await mkEquipment({
    equipmentCode: 'HVAC-003',
    name: 'Cooling Tower Unit 1',
    category: 'HVAC',
    manufacturer: 'Baltimore Aircoil',
    model: 'VXT-322-A',
    serialNumber: 'BAC-2020-CT-0008',
    installationDate: daysAgo(1600),
    location: { site: 'Plant B', building: 'External Yard', zone: 'Zone A' },
    status: 'Faulty',
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysAgo(12),   // overdue
    assignedTechnicianId: tech3._id,
  });

  console.log('[seed] Equipment created: 18');

  // ── Maintenance Events ────────────────────────────────────────────────────
  const allMaintenance = [
    // PUMP-001
    {
      tenantId,
      equipmentId: pump001._id,
      type: 'Scheduled',
      performedByTechnicianId: tech1._id,
      date: daysAgo(68),
      description: 'Routine 90-day inspection. Checked seals, impeller clearance, and bearings. All within tolerance.',
      partsUsed: ['Mechanical seal kit'],
      nextRecommendedDate: daysFromNow(22),
      createdBy: techUser1._id,
    },
    {
      tenantId,
      equipmentId: pump001._id,
      type: 'Preventive',
      performedByTechnicianId: tech1._id,
      date: daysAgo(158),
      description: 'Lubrication of drive bearings and optical shaft alignment check performed.',
      partsUsed: [],
      createdBy: techUser1._id,
    },
    // PUMP-002
    {
      tenantId,
      equipmentId: pump002._id,
      type: 'Scheduled',
      performedByTechnicianId: tech1._id,
      date: daysAgo(105),
      description: 'Scheduled service. Replaced wear ring and adjusted gland packing.',
      partsUsed: ['Wear ring', 'O-ring set'],
      createdBy: techUser1._id,
    },
    // PUMP-003
    {
      tenantId,
      equipmentId: pump003._id,
      type: 'Corrective',
      performedByTechnicianId: tech1._id,
      date: daysAgo(10),
      description: 'Emergency diagnostic following vibration alarm. Drive-end bearing damage confirmed.',
      partsUsed: [],
      createdBy: techUser1._id,
    },
    // PUMP-004
    {
      tenantId,
      equipmentId: pump004._id,
      type: 'Scheduled',
      performedByTechnicianId: tech1._id,
      date: daysAgo(25),
      description: 'Monthly jockey pump flow and cut-in pressure test. Run time 15 min, pressure 8 bar. OK.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(5),
      createdBy: techUser1._id,
    },
    // PUMP-005
    {
      tenantId,
      equipmentId: pump005._id,
      type: 'Inspection',
      performedByTechnicianId: tech1._id,
      date: daysAgo(45),
      description: 'Decommissioning inspection, fluid drainage, and electrical isolation.',
      partsUsed: [],
      createdBy: adminUser._id,
    },
    // PUMP-006
    {
      tenantId,
      equipmentId: pump006._id,
      type: 'Inspection',
      performedByTechnicianId: tech1._id,
      date: daysAgo(30),
      description: 'Pre-replacement performance assessment and hydraulic isolation.',
      partsUsed: [],
      createdBy: adminUser._id,
    },
    // PUMP-007
    {
      tenantId,
      equipmentId: pump007._id,
      type: 'Inspection',
      performedByTechnicianId: tech1._id,
      date: daysAgo(10),
      description: 'Commissioning inspection after installation. Baseline vibration and pressure certified within spec.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(70),
      createdBy: techUser1._id,
    },
    // GEN-001
    {
      tenantId,
      equipmentId: gen001._id,
      type: 'Scheduled',
      performedByTechnicianId: tech2._id,
      date: daysAgo(120),
      description: 'Semi-annual generator service. Oil and filter change, 4-hour resistive load bank test at 100%.',
      partsUsed: ['Engine oil 15W-40 (20L)', 'Oil filter', 'Fuel filter'],
      nextRecommendedDate: daysFromNow(60),
      createdBy: techUser2._id,
    },
    // GEN-002
    {
      tenantId,
      equipmentId: gen002._id,
      type: 'Corrective',
      performedByTechnicianId: tech2._id,
      date: daysAgo(8),
      description: 'Coolant leak identified during weekly check. Disassembly and upper hose replacement in progress.',
      partsUsed: ['Coolant hose assembly'],
      createdBy: techUser2._id,
    },
    // GEN-003
    {
      tenantId,
      equipmentId: gen003._id,
      type: 'Scheduled',
      performedByTechnicianId: tech2._id,
      date: daysAgo(60),
      description: 'Quarterly data room backup generator inspection. Battery impedance test and ATS transfer test OK.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(30),
      createdBy: techUser2._id,
    },
    // COMP-001
    {
      tenantId,
      equipmentId: comp001._id,
      type: 'Scheduled',
      performedByTechnicianId: tech4._id,
      date: daysAgo(50),
      description: 'Air filter replacement and synthetic compressor fluid change. Pressure relief valve tested OK.',
      partsUsed: ['Air filter element', 'Rotary compressor oil (5L)'],
      nextRecommendedDate: daysFromNow(10),
      createdBy: adminUser._id,
    },
    // COMP-002
    {
      tenantId,
      equipmentId: comp002._id,
      type: 'Scheduled',
      performedByTechnicianId: tech4._id,
      date: daysAgo(90),
      description: 'Scheduled 4000-hour service. Replaced air/oil separator and scavenge line check valve.',
      partsUsed: ['Air/oil separator element', 'Check valve'],
      createdBy: adminUser._id,
    },
    // COMP-003
    {
      tenantId,
      equipmentId: comp003._id,
      type: 'Preventive',
      performedByTechnicianId: tech4._id,
      date: daysAgo(3),
      description: 'Valve overhaul commenced. Compressor isolated from nitrogen header.',
      partsUsed: ['Valve plate assembly'],
      createdBy: adminUser._id,
    },
    // MACH-001
    {
      tenantId,
      equipmentId: mach001._id,
      type: 'Scheduled',
      performedByTechnicianId: tech4._id,
      date: daysAgo(104),
      description: 'Quarterly CNC machine calibration. Spindle taper runout check (0.002 mm), guideway lubrication flush.',
      partsUsed: ['Way lube ISO VG 68 (10L)', 'Spindle wiper seals'],
      createdBy: techUser1._id,
    },
    // MACH-002
    {
      tenantId,
      equipmentId: mach002._id,
      type: 'Scheduled',
      performedByTechnicianId: tech4._id,
      date: daysAgo(75),
      description: 'Hydraulic press preventive maintenance. Main ram hydraulic pack pressure check, light curtain safety calibration.',
      partsUsed: ['Hydraulic filter cartridge'],
      nextRecommendedDate: daysFromNow(45),
      createdBy: techUser2._id,
    },
    // HVAC-001
    {
      tenantId,
      equipmentId: hvac001._id,
      type: 'Inspection',
      performedByTechnicianId: tech3._id,
      date: daysAgo(45),
      description: 'Quarterly chiller inspection. Refrigerant charge checked (R-410A), condenser coils pressure-washed.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(45),
      createdBy: techUser1._id,
    },
    // HVAC-002
    {
      tenantId,
      equipmentId: hvac002._id,
      type: 'Scheduled',
      performedByTechnicianId: tech3._id,
      date: daysAgo(164),
      description: 'Filter replacement and blower belt tension check. Supply air flow calibrated.',
      partsUsed: ['G4 filter panels x6', 'F7 bag filters x4', 'Drive belt'],
      createdBy: techUser1._id,
    },
    // HVAC-003
    {
      tenantId,
      equipmentId: hvac003._id,
      type: 'Corrective',
      performedByTechnicianId: tech3._id,
      date: daysAgo(7),
      description: 'Fill pack inspection and water distribution basin cleaning. Fill degradation mapped for overhaul.',
      partsUsed: [],
      createdBy: techUser1._id,
    },
  ];

  const createdMaintenance = await MaintenanceEvent.insertMany(allMaintenance);
  console.log(`[seed] Maintenance events created: ${createdMaintenance.length}`);

  // Create lookup for linking maintenance to faults
  const maintMap = {};
  createdMaintenance.forEach((m) => {
    maintMap[m.equipmentId.toString()] = m._id;
  });

  // ── Fault Incidents ───────────────────────────────────────────────────────
  const faultDocs = [
    // PUMP-003 — open critical fault (bearing damage)
    {
      tenantId,
      equipmentId: pump003._id,
      reportedDate: daysAgo(10),
      reportedBy: techUser1._id,
      severity: 'Critical',
      description: 'Severe radial vibration (8.2 mm/s RMS) detected on drive-end pump shaft. Bearing failure suspected. Pump isolated.',
      status: 'Open',
      linkedMaintenanceEventId: maintMap[pump003._id.toString()],
    },
    // PUMP-002 — open medium fault (overdue + leaking seal)
    {
      tenantId,
      equipmentId: pump002._id,
      reportedDate: daysAgo(5),
      reportedBy: techUser1._id,
      severity: 'Medium',
      description: 'Minor seal weep observed on stuffing box. Pump remains operational with daily visual inspection.',
      status: 'Open',
    },
    // GEN-002 — in-progress high fault (coolant leak, under maintenance)
    {
      tenantId,
      equipmentId: gen002._id,
      reportedDate: daysAgo(9),
      reportedBy: techUser2._id,
      severity: 'High',
      description: 'Coolant leak from upper radiator hose connection. Generator isolated for hose replacement.',
      status: 'In Progress',
      linkedMaintenanceEventId: maintMap[gen002._id.toString()],
      statusHistory: [
        {
          from: 'Open',
          to: 'In Progress',
          changedBy: techUser2._id,
          changedAt: daysAgo(8),
          note: 'Hose ordered, replacement in progress.',
        },
      ],
    },
    // HVAC-003 — open high fault (cooling tower fill damage)
    {
      tenantId,
      equipmentId: hvac003._id,
      reportedDate: daysAgo(7),
      reportedBy: adminUser._id,
      severity: 'High',
      description: 'Fill media damage observed on two sections. Drift eliminator cracked resulting in excessive drift and reduced cooling efficiency.',
      status: 'Open',
      linkedMaintenanceEventId: maintMap[hvac003._id.toString()],
    },
    // COMP-002 — resolved fault (overdue but previous fault was fixed)
    {
      tenantId,
      equipmentId: comp002._id,
      reportedDate: daysAgo(95),
      reportedBy: techUser1._id,
      severity: 'Low',
      description: 'Excessive oil carry-over in discharge air line. Air/oil separator degraded.',
      status: 'Resolved',
      resolvedDate: daysAgo(88),
      resolutionNotes: 'Air/oil separator element replaced during scheduled service. Oil carry-over certified within spec.',
      resolvedBy: adminUser._id,
      statusHistory: [
        {
          from: 'Open',
          to: 'Resolved',
          changedBy: adminUser._id,
          changedAt: daysAgo(88),
          note: 'Resolved during scheduled service.',
        },
      ],
    },
    // PUMP-001 — resolved medium fault
    {
      tenantId,
      equipmentId: pump001._id,
      reportedDate: daysAgo(200),
      reportedBy: techUser1._id,
      severity: 'Medium',
      description: 'Intermittent flow reduction reported by operators. Impeller cavitation wear suspected.',
      status: 'Resolved',
      resolvedDate: daysAgo(190),
      resolutionNotes: 'Impeller replaced and pump laser-aligned. Full flow restored.',
      resolvedBy: techUser1._id,
      statusHistory: [
        {
          from: 'Open',
          to: 'In Progress',
          changedBy: techUser1._id,
          changedAt: daysAgo(198),
          note: 'Inspection scheduled.',
        },
        {
          from: 'In Progress',
          to: 'Resolved',
          changedBy: techUser1._id,
          changedAt: daysAgo(190),
          note: 'Impeller replaced and verified.',
        },
      ],
    },
    // HVAC-002 — open low fault (overdue unit, minor duct noise)
    {
      tenantId,
      equipmentId: hvac002._id,
      reportedDate: daysAgo(20),
      reportedBy: viewerUser._id,
      severity: 'Low',
      description: 'Rattling noise from supply air duct — loose inspection hatch panel.',
      status: 'Open',
    },
    // COMP-003 — in-progress medium fault (under maintenance)
    {
      tenantId,
      equipmentId: comp003._id,
      reportedDate: daysAgo(14),
      reportedBy: techUser1._id,
      severity: 'Medium',
      description: 'Valve chatter audible under load. Output pressure fluctuating ±0.3 bar.',
      status: 'In Progress',
      linkedMaintenanceEventId: maintMap[comp003._id.toString()],
      statusHistory: [
        {
          from: 'Open',
          to: 'In Progress',
          changedBy: techUser2._id,
          changedAt: daysAgo(3),
          note: 'Compressor isolated, valve overhaul underway.',
        },
      ],
    },
    // MACH-001 — open low fault (way wiper wear on milling machine)
    {
      tenantId,
      equipmentId: mach001._id,
      reportedDate: daysAgo(12),
      reportedBy: techUser1._id,
      severity: 'Low',
      description: 'Y-axis guideway telescopic wiper lip degraded. Minor coolant weeping into chip pan.',
      status: 'Open',
    },
  ];

  await FaultIncident.insertMany(faultDocs);
  console.log(`[seed] Fault incidents created: ${faultDocs.length}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n[seed] ─────────────────────────────────────────────────────');
  console.log('[seed] Seed complete. Summary:');
  console.log(`  Tenant:      ${tenant.name}  (${tenantId})`);
  console.log('  Users:       4  (admin / tech1 / tech2 / viewer)');
  console.log('  Technicians: 4');
  console.log('  Equipment:   18');
  console.log('    Pumps:                 7  (PUMP-001 to PUMP-007)');
  console.log('    Generators:            3  (GEN-001 to GEN-003)');
  console.log('    Compressors:           3  (COMP-001 to COMP-003)');
  console.log('    Production Machines:   2  (MACH-001, MACH-002)');
  console.log('    HVAC Systems:          3  (HVAC-001 to HVAC-003)');
  console.log('    Operational:          12');
  console.log('    Under Maintenance:     2  (GEN-002, COMP-003)');
  console.log('    Faulty:                2  (PUMP-003, HVAC-003)');
  console.log('    Retired:               2  (PUMP-005 retired, PUMP-006 replaced by PUMP-007)');
  console.log('    Overdue (Total):       7  (PUMP-002, COMP-002, MACH-001, HVAC-002, PUMP-003, GEN-002, HVAC-003)');
  console.log('    Private (Restricted):  1  (GEN-003)');
  console.log('    Replaced Chain:        PUMP-006 → PUMP-007');
  console.log(`    Maintenance Events:   ${createdMaintenance.length}`);
  console.log(`    Fault Incidents:      ${faultDocs.length}`);
  console.log('[seed] ─────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('[seed] Disconnected');
}

seed().catch((err) => {
  console.error('[seed] ERROR:', err);
  process.exit(1);
});
