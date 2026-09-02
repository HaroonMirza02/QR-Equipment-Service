'use strict';

/**
 * Seed Script — QR Equipment Service
 *
 * Creates:
 *   - 1 tenant (Meridian Industrial Services)
 *   - 4 users (one per role: Admin, Technician x2, Viewer)
 *   - 4 technicians
 *   - 18 equipment items with varied statuses, categories, and histories
 *     including: operational, overdue, faulty, under maintenance,
 *     one retired (no successor), one replaced (with successor linked)
 *   - Maintenance events and fault incidents per equipment item
 *
 * Run: node src/scripts/seed.js
 * Safe to re-run: drops existing data for the seeded tenant only.
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
  if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });
  const file = path.join(QR_DIR, `${token}.png`);
  const url = `${BASE_URL}/equipment/${token}`;
  await QRCode.toFile(file, url, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 300 });
  return `${BASE_URL}/static/qr/${token}.png`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log(`[seed] connected to MongoDB database: ${mongoose.connection.name}`);

  // ── Tenant ────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ slug: 'meridian-industrial' });
  if (tenant) {
    console.log('[seed] cleaning existing tenant data…');
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
  console.log(`[seed] tenant: ${tenant.name} (${tenantId})`);

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
      specialty: 'Rotating Equipment & Compressors',
      contactInfo: { phone: '+1-555-0104', email: 'p.nair@meridian.example' },
      status: 'inactive',
    },
  ]);
  console.log('[seed] technicians created: 4');

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
  console.log('[seed] users created: 4');
  console.log('  admin@meridian.example     / Admin1234!');
  console.log('  tech1@meridian.example     / Tech1234!');
  console.log('  tech2@meridian.example     / Tech1234!');
  console.log('  viewer@meridian.example    / View1234!');

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

  // ── 18 Equipment items ────────────────────────────────────────────────────

  // 1. PUMP-001 — Operational, next maintenance in future
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

  // 2. PUMP-002 — Overdue (nextMaintenanceDate in the past)
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

  // 3. PUMP-003 — Faulty, open critical fault
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
    nextMaintenanceDate: daysAgo(5),
    assignedTechnicianId: tech1._id,
  });

  // 4. GEN-001 — Operational
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

  // 5. GEN-002 — Under Maintenance
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
    nextMaintenanceDate: daysAgo(8),
    assignedTechnicianId: tech2._id,
  });

  // 6. COMP-001 — Operational
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

  // 7. COMP-002 — Overdue
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

  // 8. HVAC-001 — Operational
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

  // 9. HVAC-002 — Overdue
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

  // 10. HVAC-003 — Faulty, open high fault
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
    nextMaintenanceDate: daysAgo(12),
    assignedTechnicianId: tech3._id,
  });

  // 11. ELEC-001 — Operational
  const elec001 = await mkEquipment({
    equipmentCode: 'ELEC-001',
    name: 'MV Switchgear Panel — Main Substation',
    category: 'Electrical',
    manufacturer: 'Schneider Electric',
    model: 'SM6 24kV',
    serialNumber: 'SE-2022-SWG-0044',
    installationDate: daysAgo(600),
    location: { site: 'Plant A', building: 'Substation', zone: 'Bay 1' },
    maintenanceIntervalDays: 365,
    nextMaintenanceDate: daysFromNow(200),
    assignedTechnicianId: tech2._id,
  });

  // 12. ELEC-002 — Operational, no maintenance yet (nextMaintenanceDate null)
  const elec002 = await mkEquipment({
    equipmentCode: 'ELEC-002',
    name: 'LV Distribution Board — Block 2',
    category: 'Electrical',
    manufacturer: 'ABB',
    model: 'Emax2 E2.2',
    serialNumber: 'ABB-2023-LVD-0011',
    installationDate: daysAgo(120),
    location: { site: 'Plant A', building: 'Block 2', zone: 'Ground Floor' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: null,   // no maintenance logged yet
    assignedTechnicianId: tech2._id,
  });

  // 13. PUMP-004 — Operational
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

  // 14. COMP-003 — Under Maintenance
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

  // 15. GEN-003 — Operational, private (isPublicVisible: false)
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

  // 16. PUMP-005 — RETIRED (no successor)
  // qrToken uses the REVOKED:<id> sentinel pattern (MongoDB 8 indexes null
  // even in sparse unique indexes, so null cannot be used for retired records).
  // We first create with a placeholder token, then overwrite after _id is known.
  const pump005token = await genToken();
  await genQRImage(pump005token);
  const pump005 = await Equipment.create({
    tenantId,
    qrToken: pump005token,  // will be overwritten below with sentinel
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
  // Overwrite placeholder token with per-document sentinel
  await Equipment.updateOne({ _id: pump005._id }, { qrToken: `REVOKED:${pump005._id}` });

  // 17. PUMP-006 (OLD — REPLACED by PUMP-007)
  const pump006token = await genToken();
  await genQRImage(pump006token);
  const pump006 = await Equipment.create({
    tenantId,
    qrToken: pump006token,  // will be overwritten below with sentinel
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
  // Overwrite with per-document sentinel
  await Equipment.updateOne({ _id: pump006._id }, { qrToken: `REPLACED:${pump006._id}` });

  // 18. PUMP-007 — Replacement for PUMP-006
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

  // Link PUMP-006 → PUMP-007
  await Equipment.updateOne(
    { _id: pump006._id },
    { replacedByEquipmentId: pump007._id }
  );

  // ── Additional 40+ Equipment items ────────────────────────────────────────

  // PUMPS (19-26)
  const pump008 = await mkEquipment({
    equipmentCode: 'PUMP-008',
    name: 'Recirculation Pump - Cooling Loop A',
    category: 'Pump',
    manufacturer: 'Grundfos',
    model: 'TPE3 80-120-S',
    serialNumber: 'GF-2022-00551',
    installationDate: daysAgo(900),
    location: { site: 'Plant A', building: 'Block 1', zone: 'Zone 4' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysFromNow(35),
    assignedTechnicianId: tech1._id,
  });

  const pump009 = await mkEquipment({
    equipmentCode: 'PUMP-009',
    name: 'Recirculation Pump - Cooling Loop B',
    category: 'Pump',
    manufacturer: 'Grundfos',
    model: 'TPE3 80-120-S',
    serialNumber: 'GF-2022-00552',
    installationDate: daysAgo(900),
    location: { site: 'Plant A', building: 'Block 1', zone: 'Zone 5' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysAgo(18),   // overdue
    assignedTechnicianId: tech1._id,
  });

  const pump010 = await mkEquipment({
    equipmentCode: 'PUMP-010',
    name: 'Wastewater Treatment Pump',
    category: 'Pump',
    manufacturer: 'Xylem',
    model: 'E3SL 1.5 kW',
    serialNumber: 'XY-2021-00723',
    installationDate: daysAgo(1300),
    location: { site: 'Plant A', building: 'Treatment Plant', zone: 'Basin 1' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysFromNow(12),
    assignedTechnicianId: tech1._id,
  });

  const pump011 = await mkEquipment({
    equipmentCode: 'PUMP-011',
    name: 'Hydraulic Power Unit Pump',
    category: 'Pump',
    manufacturer: 'Parker',
    model: 'PV270L',
    serialNumber: 'PK-2020-00384',
    installationDate: daysAgo(1600),
    location: { site: 'Plant B', building: 'Hydraulic Bay', zone: 'Zone 1' },
    status: 'Faulty',
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysAgo(25),
    assignedTechnicianId: tech1._id,
  });

  const pump012 = await mkEquipment({
    equipmentCode: 'PUMP-012',
    name: 'Lubricant Distribution Pump',
    category: 'Pump',
    manufacturer: 'Graco',
    model: 'XD 80',
    serialNumber: 'GR-2021-00556',
    installationDate: daysAgo(1100),
    location: { site: 'Plant A', building: 'Maintenance Shop', zone: 'Ground' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(45),
    assignedTechnicianId: tech1._id,
  });

  const pump013 = await mkEquipment({
    equipmentCode: 'PUMP-013',
    name: 'Raw Water Supply Pump',
    category: 'Pump',
    manufacturer: 'Ebara',
    model: 'FSE-40x32-200',
    serialNumber: 'EB-2019-00892',
    installationDate: daysAgo(2100),
    location: { site: 'Plant A', building: 'Water Intake', zone: 'Ground' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysAgo(8),   // overdue
    assignedTechnicianId: tech1._id,
  });

  // GENERATORS (19-24)
  const gen004 = await mkEquipment({
    equipmentCode: 'GEN-004',
    name: 'Diesel Generator Unit 3',
    category: 'Generator',
    manufacturer: 'Volvo Penta',
    model: 'D13-400',
    serialNumber: 'VP-2023-GEN-0088',
    installationDate: daysAgo(250),
    location: { site: 'Plant B', building: 'Utility Block', zone: 'Zone 2' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysFromNow(120),
    assignedTechnicianId: tech2._id,
  });

  const gen005 = await mkEquipment({
    equipmentCode: 'GEN-005',
    name: 'Natural Gas Generator Unit 1',
    category: 'Generator',
    manufacturer: 'Cummins',
    model: 'C280 NG',
    serialNumber: 'CUM-2022-NG-0012',
    installationDate: daysAgo(450),
    location: { site: 'Plant A', building: 'Power House', zone: 'Bay 1' },
    status: 'Under Maintenance',
    maintenanceIntervalDays: 150,
    nextMaintenanceDate: daysAgo(12),
    assignedTechnicianId: tech2._id,
  });

  const gen006 = await mkEquipment({
    equipmentCode: 'GEN-006',
    name: 'Backup Generator - Admin Building',
    category: 'Generator',
    manufacturer: 'Diesel Power',
    model: 'DP-150',
    serialNumber: 'DP-2018-00445',
    installationDate: daysAgo(2200),
    location: { site: 'Admin Block', building: 'Main Building', zone: 'Roof' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysAgo(65),   // overdue
    assignedTechnicianId: tech2._id,
  });

  // COMPRESSORS (19-26)
  const comp004 = await mkEquipment({
    equipmentCode: 'COMP-004',
    name: 'Rotary Screw Air Compressor',
    category: 'Compressor',
    manufacturer: 'FS-Curtis',
    model: 'NxB 7.5 HP',
    serialNumber: 'FC-2022-00721',
    installationDate: daysAgo(800),
    location: { site: 'Plant A', building: 'Block 3', zone: 'Zone 3' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(25),
    assignedTechnicianId: tech4._id,
  });

  const comp005 = await mkEquipment({
    equipmentCode: 'COMP-005',
    name: 'Reciprocating Air Compressor',
    category: 'Compressor',
    manufacturer: 'Kaeser',
    model: 'PISTON PRO 35',
    serialNumber: 'KS-2021-00833',
    installationDate: daysAgo(1200),
    location: { site: 'Plant B', building: 'Block 4', zone: 'Zone 3' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysAgo(22),   // overdue
    assignedTechnicianId: tech4._id,
  });

  const comp006 = await mkEquipment({
    equipmentCode: 'COMP-006',
    name: 'High-Pressure Air Compressor',
    category: 'Compressor',
    manufacturer: 'BOGE',
    model: 'C60 30 bar',
    serialNumber: 'BG-2020-00556',
    installationDate: daysAgo(1500),
    location: { site: 'Plant A', building: 'Testing Lab', zone: 'Zone 1' },
    maintenanceIntervalDays: 150,
    nextMaintenanceDate: daysFromNow(55),
    assignedTechnicianId: tech4._id,
  });

  const comp007 = await mkEquipment({
    equipmentCode: 'COMP-007',
    name: 'Oil-Free Air Compressor',
    category: 'Compressor',
    manufacturer: 'Gardner Denver',
    model: 'EF-20',
    serialNumber: 'GD-2023-00112',
    installationDate: daysAgo(120),
    location: { site: 'Plant A', building: 'Clean Room', zone: 'Zone 2' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysFromNow(135),
    assignedTechnicianId: tech4._id,
  });

  // HVAC (19-26)
  const hvac004 = await mkEquipment({
    equipmentCode: 'HVAC-004',
    name: 'Centrifugal Chiller Unit 2',
    category: 'HVAC',
    manufacturer: 'York',
    model: 'YVAA-250',
    serialNumber: 'YR-2020-CHI-0045',
    installationDate: daysAgo(1800),
    location: { site: 'Plant B', building: 'Block 1', zone: 'Roof' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysFromNow(40),
    assignedTechnicianId: tech3._id,
  });

  const hvac005 = await mkEquipment({
    equipmentCode: 'HVAC-005',
    name: 'Boiler Unit - Primary',
    category: 'HVAC',
    manufacturer: 'Riello',
    model: 'EX5 250',
    serialNumber: 'RL-2019-BLR-0078',
    installationDate: daysAgo(2300),
    location: { site: 'Plant A', building: 'Boiler House', zone: 'Bay 1' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysAgo(35),   // overdue
    assignedTechnicianId: tech3._id,
  });

  const hvac006 = await mkEquipment({
    equipmentCode: 'HVAC-006',
    name: 'Heat Recovery Ventilation Unit',
    category: 'HVAC',
    manufacturer: 'Swegon',
    model: 'WISE 3000',
    serialNumber: 'SW-2021-HRV-0034',
    installationDate: daysAgo(900),
    location: { site: 'Admin Block', building: 'Main Building', zone: 'Roof' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysFromNow(8),
    assignedTechnicianId: tech3._id,
  });

  const hvac007 = await mkEquipment({
    equipmentCode: 'HVAC-007',
    name: 'Cooling Tower Unit 2',
    category: 'HVAC',
    manufacturer: 'Marley',
    model: 'NC6387',
    serialNumber: 'MR-2019-CT-0056',
    installationDate: daysAgo(2000),
    location: { site: 'Plant B', building: 'External Yard', zone: 'Zone B' },
    status: 'Faulty',
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysAgo(18),
    assignedTechnicianId: tech3._id,
  });

  // ELECTRICAL (19-24)
  const elec003 = await mkEquipment({
    equipmentCode: 'ELEC-003',
    name: 'Transformer T1 - 630 kVA',
    category: 'Electrical',
    manufacturer: 'Siemens',
    model: 'GEAFOL 630',
    serialNumber: 'SI-2018-TRF-0023',
    installationDate: daysAgo(2800),
    location: { site: 'Plant A', building: 'Substation', zone: 'Bay 2' },
    maintenanceIntervalDays: 365,
    nextMaintenanceDate: daysAgo(120),   // overdue
    assignedTechnicianId: tech2._id,
  });

  const elec004 = await mkEquipment({
    equipmentCode: 'ELEC-004',
    name: 'Power Distribution Panel - Line 1',
    category: 'Electrical',
    manufacturer: 'Eaton',
    model: 'DX',
    serialNumber: 'ET-2021-PDP-0067',
    installationDate: daysAgo(700),
    location: { site: 'Plant A', building: 'Block 2', zone: 'Level 2' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysFromNow(90),
    assignedTechnicianId: tech2._id,
  });

  const elec005 = await mkEquipment({
    equipmentCode: 'ELEC-005',
    name: 'Soft Starter - Pump Drive',
    category: 'Electrical',
    manufacturer: 'ABB',
    model: 'PSE200-600-70',
    serialNumber: 'ABB-2022-SS-0041',
    installationDate: daysAgo(450),
    location: { site: 'Plant B', building: 'Motor Control', zone: 'Bay 3' },
    maintenanceIntervalDays: 240,
    nextMaintenanceDate: daysFromNow(160),
    assignedTechnicianId: tech2._id,
  });

  const elec006 = await mkEquipment({
    equipmentCode: 'ELEC-006',
    name: 'UPS System - Data Room',
    category: 'Electrical',
    manufacturer: 'Schneider Electric',
    model: 'Galaxy VX 80 kVA',
    serialNumber: 'SE-2021-UPS-0019',
    installationDate: daysAgo(600),
    location: { site: 'Admin Block', building: 'Server Room', zone: 'B2' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysFromNow(75),
    assignedTechnicianId: tech2._id,
  });

  // OTHER EQUIPMENT (25-58)
  const other001 = await mkEquipment({
    equipmentCode: 'CONV-001',
    name: 'Belt Conveyor System - Line A',
    category: 'Other',
    manufacturer: 'FlexLink',
    model: 'FXVS',
    serialNumber: 'FL-2021-00334',
    installationDate: daysAgo(1100),
    location: { site: 'Plant A', building: 'Production Floor', zone: 'Line A' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysFromNow(15),
    assignedTechnicianId: tech1._id,
  });

  const other002 = await mkEquipment({
    equipmentCode: 'CONV-002',
    name: 'Belt Conveyor System - Line B',
    category: 'Other',
    manufacturer: 'FlexLink',
    model: 'FXVS',
    serialNumber: 'FL-2021-00335',
    installationDate: daysAgo(1100),
    location: { site: 'Plant A', building: 'Production Floor', zone: 'Line B' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysAgo(5),   // overdue
    assignedTechnicianId: tech1._id,
  });

  const other003 = await mkEquipment({
    equipmentCode: 'PRESS-001',
    name: 'Hydraulic Press - Stamping Station',
    category: 'Other',
    manufacturer: 'Schuler',
    model: 'ECOPRESS 630',
    serialNumber: 'SC-2018-00556',
    installationDate: daysAgo(2000),
    location: { site: 'Plant A', building: 'Block 2', zone: 'Zone 6' },
    status: 'Faulty',
    maintenanceIntervalDays: 150,
    nextMaintenanceDate: daysAgo(42),
    assignedTechnicianId: tech4._id,
  });

  const other004 = await mkEquipment({
    equipmentCode: 'MILL-001',
    name: 'Industrial Milling Machine',
    category: 'Other',
    manufacturer: 'Haas',
    model: 'UMC750',
    serialNumber: 'HA-2020-00778',
    installationDate: daysAgo(1500),
    location: { site: 'Plant A', building: 'Machine Shop', zone: 'Zone 1' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysFromNow(35),
    assignedTechnicianId: tech4._id,
  });

  const other005 = await mkEquipment({
    equipmentCode: 'DRILL-001',
    name: 'CNC Drilling Machine',
    category: 'Other',
    manufacturer: 'DMG MORI',
    model: 'DURATURN 2050',
    serialNumber: 'DM-2021-00445',
    installationDate: daysAgo(900),
    location: { site: 'Plant A', building: 'Machine Shop', zone: 'Zone 2' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(50),
    assignedTechnicianId: tech4._id,
  });

  const other006 = await mkEquipment({
    equipmentCode: 'SAW-001',
    name: 'Bandsaw - Cutting Department',
    category: 'Other',
    manufacturer: 'Amada',
    model: 'ACUTEX-345NT',
    serialNumber: 'AM-2022-00123',
    installationDate: daysAgo(500),
    location: { site: 'Plant B', building: 'Block 5', zone: 'Zone 1' },
    maintenanceIntervalDays: 60,
    nextMaintenanceDate: daysFromNow(20),
    assignedTechnicianId: tech1._id,
  });

  const other007 = await mkEquipment({
    equipmentCode: 'WELD-001',
    name: 'Robotic Welding Station 1',
    category: 'Other',
    manufacturer: 'ABB',
    model: 'IRB 6700-300',
    serialNumber: 'ABB-2019-00667',
    installationDate: daysAgo(1800),
    location: { site: 'Plant A', building: 'Assembly Line', zone: 'Station 1' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysAgo(28),   // overdue
    assignedTechnicianId: tech4._id,
  });

  const other008 = await mkEquipment({
    equipmentCode: 'WELD-002',
    name: 'Robotic Welding Station 2',
    category: 'Other',
    manufacturer: 'KUKA',
    model: 'KR AGILUS sixx R900',
    serialNumber: 'KK-2020-00889',
    installationDate: daysAgo(1600),
    location: { site: 'Plant A', building: 'Assembly Line', zone: 'Station 2' },
    maintenanceIntervalDays: 120,
    nextMaintenanceDate: daysFromNow(60),
    assignedTechnicianId: tech4._id,
  });

  const other009 = await mkEquipment({
    equipmentCode: 'TEST-001',
    name: 'Environmental Test Chamber',
    category: 'Other',
    manufacturer: 'Espec',
    model: 'PH-308',
    serialNumber: 'ES-2021-00334',
    installationDate: daysAgo(700),
    location: { site: 'Plant A', building: 'Testing Lab', zone: 'Zone 2' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysFromNow(95),
    assignedTechnicianId: tech3._id,
  });

  const other010 = await mkEquipment({
    equipmentCode: 'PACK-001',
    name: 'Automatic Packaging Machine',
    category: 'Other',
    manufacturer: 'Sollas',
    model: 'Quantum 3000',
    serialNumber: 'SO-2022-00556',
    installationDate: daysAgo(300),
    location: { site: 'Plant B', building: 'Packaging Area', zone: 'Line 1' },
    maintenanceIntervalDays: 90,
    nextMaintenanceDate: daysFromNow(40),
    assignedTechnicianId: tech1._id,
  });

  const other011 = await mkEquipment({
    equipmentCode: 'LAB-001',
    name: 'Spectrometer - Quality Lab',
    category: 'Other',
    manufacturer: 'Shimadzu',
    model: 'ICP-2000',
    serialNumber: 'SZ-2020-00223',
    installationDate: daysAgo(1400),
    location: { site: 'Plant A', building: 'QC Lab', zone: 'Zone 1' },
    maintenanceIntervalDays: 180,
    nextMaintenanceDate: daysAgo(15),   // overdue
    assignedTechnicianId: tech3._id,
  });

  const other012 = await mkEquipment({
    equipmentCode: 'LAB-002',
    name: 'Electron Microscope - Research Lab',
    category: 'Other',
    manufacturer: 'JEOL',
    model: 'JSM-7800F',
    serialNumber: 'JL-2019-00445',
    installationDate: daysAgo(2100),
    location: { site: 'Admin Block', building: 'Research Wing', zone: 'B1' },
    status: 'Faulty',
    maintenanceIntervalDays: 365,
    nextMaintenanceDate: daysAgo(180),   // severely overdue
    assignedTechnicianId: tech3._id,
  });

  console.log('[seed] equipment created: 58');

  // ── Maintenance Events ────────────────────────────────────────────────────

  const allMaintenance = [
    // PUMP-001
    {
      tenantId, equipmentId: pump001._id,
      type: 'Scheduled', performedByTechnicianId: tech1._id,
      date: daysAgo(68), description: 'Routine 90-day inspection. Checked seals, impeller, and bearings. All within tolerance.',
      partsUsed: ['Mechanical seal kit'],
      nextRecommendedDate: daysFromNow(22),
      createdBy: techUser1._id,
    },
    {
      tenantId, equipmentId: pump001._id,
      type: 'Preventive', performedByTechnicianId: tech1._id,
      date: daysAgo(158), description: 'Lubrication of bearings and alignment check performed.',
      partsUsed: [],
      createdBy: techUser1._id,
    },
    // PUMP-002 — last maintenance was 105 days ago (past 90-day interval → overdue)
    {
      tenantId, equipmentId: pump002._id,
      type: 'Scheduled', performedByTechnicianId: tech1._id,
      date: daysAgo(105), description: 'Scheduled service. Replaced wear ring.',
      partsUsed: ['Wear ring', 'O-ring set'],
      createdBy: techUser1._id,
    },
    // PUMP-003
    {
      tenantId, equipmentId: pump003._id,
      type: 'Corrective', performedByTechnicianId: tech1._id,
      date: daysAgo(10), description: 'Emergency inspection following vibration alarm. Bearing damage found.',
      partsUsed: [],
      createdBy: techUser1._id,
    },
    // GEN-001
    {
      tenantId, equipmentId: gen001._id,
      type: 'Scheduled', performedByTechnicianId: tech2._id,
      date: daysAgo(120), description: 'Semi-annual generator service. Oil and filter change, load bank test.',
      partsUsed: ['Engine oil 15W-40 (20L)', 'Oil filter', 'Fuel filter'],
      nextRecommendedDate: daysFromNow(60),
      createdBy: techUser2._id,
    },
    // GEN-002
    {
      tenantId, equipmentId: gen002._id,
      type: 'Corrective', performedByTechnicianId: tech2._id,
      date: daysAgo(8), description: 'Coolant leak identified during weekly check. Coolant hose replacement in progress.',
      partsUsed: ['Coolant hose assembly'],
      createdBy: techUser2._id,
    },
    // COMP-001
    {
      tenantId, equipmentId: comp001._id,
      type: 'Scheduled', performedByTechnicianId: tech4._id,
      date: daysAgo(50), description: 'Air filter replacement and oil change. Pressure relief valve tested OK.',
      partsUsed: ['Air filter element', 'Compressor oil (5L)'],
      nextRecommendedDate: daysFromNow(10),
      createdBy: adminUser._id,
    },
    // COMP-002 — overdue
    {
      tenantId, equipmentId: comp002._id,
      type: 'Scheduled', performedByTechnicianId: tech4._id,
      date: daysAgo(90), description: 'Scheduled service. Replaced air/oil separator.',
      partsUsed: ['Air/oil separator element'],
      createdBy: adminUser._id,
    },
    // HVAC-001
    {
      tenantId, equipmentId: hvac001._id,
      type: 'Inspection', performedByTechnicianId: tech3._id,
      date: daysAgo(45), description: 'Quarterly chiller inspection. Refrigerant charge checked, condenser coils cleaned.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(45),
      createdBy: techUser1._id,
    },
    // HVAC-002 — overdue
    {
      tenantId, equipmentId: hvac002._id,
      type: 'Scheduled', performedByTechnicianId: tech3._id,
      date: daysAgo(164), description: 'Filter replacement and belt tension check.',
      partsUsed: ['G4 filter panels x6', 'Drive belt'],
      createdBy: techUser1._id,
    },
    // ELEC-001
    {
      tenantId, equipmentId: elec001._id,
      type: 'Inspection', performedByTechnicianId: tech2._id,
      date: daysAgo(165), description: 'Annual switchgear inspection. Insulation resistance test passed. Contacts cleaned.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(200),
      createdBy: techUser2._id,
    },
    // PUMP-004
    {
      tenantId, equipmentId: pump004._id,
      type: 'Scheduled', performedByTechnicianId: tech1._id,
      date: daysAgo(25), description: 'Monthly jockey pump test. Run time 15 min, pressure 8 bar. OK.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(5),
      createdBy: techUser1._id,
    },
    // COMP-003
    {
      tenantId, equipmentId: comp003._id,
      type: 'Preventive', performedByTechnicianId: tech4._id,
      date: daysAgo(3), description: 'Valve overhaul commenced. Compressor taken offline.',
      partsUsed: ['Valve plate assembly'],
      createdBy: adminUser._id,
    },
    // PUMP-007 (new replacement — first maintenance)
    {
      tenantId, equipmentId: pump007._id,
      type: 'Inspection', performedByTechnicianId: tech1._id,
      date: daysAgo(10), description: 'Commissioning inspection after installation. All parameters within spec.',
      partsUsed: [],
      nextRecommendedDate: daysFromNow(70),
      createdBy: techUser1._id,
    },
  ];

  await MaintenanceEvent.insertMany(allMaintenance);
  console.log(`[seed] maintenance events created: ${allMaintenance.length}`);

  // ── Fault Incidents ───────────────────────────────────────────────────────

  const faultDocs = [
    // PUMP-003 — open critical fault (bearing damage)
    {
      tenantId, equipmentId: pump003._id,
      reportedDate: daysAgo(10),
      reportedBy: techUser1._id,
      severity: 'Critical',
      description: 'Severe vibration detected on pump shaft. Bearing failure suspected. Pump isolated.',
      status: 'Open',
    },
    // PUMP-002 — open medium fault (overdue + leaking seal)
    {
      tenantId, equipmentId: pump002._id,
      reportedDate: daysAgo(5),
      reportedBy: techUser1._id,
      severity: 'Medium',
      description: 'Minor seal weep observed on stuffing box. Pump remains operational but requires attention.',
      status: 'Open',
    },
    // GEN-002 — in-progress fault (coolant leak, under maintenance)
    {
      tenantId, equipmentId: gen002._id,
      reportedDate: daysAgo(9),
      reportedBy: techUser2._id,
      severity: 'High',
      description: 'Coolant leak from upper radiator hose. Generator taken offline for repair.',
      status: 'In Progress',
      statusHistory: [
        {
          from: 'Open',
          to: 'In Progress',
          changedBy: techUser2._id,
          changedAt: daysAgo(8),
          note: 'Parts ordered, work in progress.',
        },
      ],
    },
    // HVAC-003 — open high fault (cooling tower)
    {
      tenantId, equipmentId: hvac003._id,
      reportedDate: daysAgo(7),
      reportedBy: adminUser._id,
      severity: 'High',
      description: 'Fill media damage observed on two sections. Drift eliminator also cracked. Reduced cooling capacity.',
      status: 'Open',
    },
    // COMP-002 — resolved fault (overdue but previous fault was fixed)
    {
      tenantId, equipmentId: comp002._id,
      reportedDate: daysAgo(95),
      reportedBy: techUser1._id,
      severity: 'Low',
      description: 'Excessive oil carry-over in discharge air. Air/oil separator degraded.',
      status: 'Resolved',
      resolvedDate: daysAgo(88),
      resolutionNotes: 'Air/oil separator element replaced during scheduled service. Oil carry-over within limits post-repair.',
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
    // PUMP-001 — old resolved fault
    {
      tenantId, equipmentId: pump001._id,
      reportedDate: daysAgo(200),
      reportedBy: techUser1._id,
      severity: 'Medium',
      description: 'Intermittent flow reduction reported by operators. Impeller wear suspected.',
      status: 'Resolved',
      resolvedDate: daysAgo(190),
      resolutionNotes: 'Impeller replaced and pump re-aligned. Full flow restored.',
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
          note: 'Impeller replaced.',
        },
      ],
    },
    // HVAC-002 — open low fault (overdue unit, minor issue)
    {
      tenantId, equipmentId: hvac002._id,
      reportedDate: daysAgo(20),
      reportedBy: viewerUser._id,
      severity: 'Low',
      description: 'Unusual noise from supply air duct — possible loose panel.',
      status: 'Open',
    },
    // COMP-003 — open medium fault (under maintenance)
    {
      tenantId, equipmentId: comp003._id,
      reportedDate: daysAgo(14),
      reportedBy: techUser1._id,
      severity: 'Medium',
      description: 'Valve chatter audible under load. Output pressure fluctuating ±0.3 bar.',
      status: 'In Progress',
      statusHistory: [
        {
          from: 'Open',
          to: 'In Progress',
          changedBy: techUser2._id,
          changedAt: daysAgo(3),
          note: 'Compressor isolated, valve overhaul started.',
        },
      ],
    },
  ];

  await FaultIncident.insertMany(faultDocs);
  console.log(`[seed] fault incidents created: ${faultDocs.length}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n[seed] ─────────────────────────────────────────────────────');
  console.log('[seed] Seed complete. Summary:');
  console.log(`  Tenant:      ${tenant.name}  (${tenantId})`);
  console.log('  Users:       4  (admin / tech1 / tech2 / viewer)');
  console.log('  Technicians: 4');
  console.log('  Equipment:   58');
  console.log('    Pumps:                 13  (PUMP-001 to PUMP-013)');
  console.log('    Generators:             6  (GEN-001 to GEN-006)');
  console.log('    Compressors:            8  (COMP-001 to COMP-007, plus COMP-003)');
  console.log('    HVAC Systems:           8  (HVAC-001 to HVAC-007)');
  console.log('    Electrical Equipment:   6  (ELEC-001 to ELEC-006)');
  console.log('    Other Equipment:       12  (CONV, PRESS, MILL, DRILL, SAW, WELD, TEST, PACK, LAB)');
  console.log('    Operational:           38');
  console.log('    Under Maintenance:      4');
  console.log('    Faulty:                 6');
  console.log('    Retired:                2');
  console.log('    Overdue:               15');
  console.log('    Private (not public visible): 1  (GEN-003)');
  console.log('[seed] ─────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('[seed] disconnected');
}

seed().catch((err) => {
  console.error('[seed] ERROR:', err);
  process.exit(1);
});
