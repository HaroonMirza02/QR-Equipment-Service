'use strict';

/**
 * clean-production-data.js
 *
 * Safe, idempotent database cleanup and data enrichment script.
 * Rules enforced:
 *   1. Remove confirmed test records: DUMMY, TEST-PRIVATE-SCAN-001, TEST-SCAN-LIVE-001,
 *      TEST-NEW-REPLACEMENT-001, TEST-OLD-001, TEST-QR-REGEN-001, TEST-NEW-001.
 *   2. Clean up any related MaintenanceEvent and FaultIncident records belonging to deleted equipment.
 *   3. Rename TEST-001 -> ENV-001 (Environmental Test Chamber by Espec) without breaking history or relationships.
 *   4. Enrich ALL faulty equipment with realistic, domain-specific FaultIncident and linked MaintenanceEvent records:
 *      - LAB-002 (Electron Microscope)
 *      - PUMP-011 (Hydraulic Power Unit Pump)
 *      - HVAC-007 (Cooling Tower Unit 2)
 *      - PRESS-001 (Hydraulic Press)
 *      - HVAC-003 (Cooling Tower Unit 1 - add diagnostic maintenance if missing)
 *      - PUMP-003 (KSB Pump - verify link)
 *   5. Enrich under-maintenance equipment:
 *      - GEN-005 (Cummins Natural Gas Generator) - add realistic in-progress maintenance & incident
 *      - GEN-002, COMP-003 - verify links
 *   6. Enrich PUMP-008 through PUMP-013, CONV-001, MILL-001, ENV-001 with realistic industrial maintenance records.
 *   7. Perform complete orphan check, QR integrity check, and report stats.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('../config/database');

const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Technician = require('../models/Technician');
const Equipment = require('../models/Equipment');
const MaintenanceEvent = require('../models/MaintenanceEvent');
const FaultIncident = require('../models/FaultIncident');

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000);
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 86_400_000);
}

const CONFIRMED_TEST_CODES = [
  'DUMMY',
  'TEST-PRIVATE-SCAN-001',
  'TEST-SCAN-LIVE-001',
  'TEST-NEW-REPLACEMENT-001',
  'TEST-OLD-001',
  'TEST-QR-REGEN-001',
  'TEST-NEW-001',
];

async function run() {
  await connectDB();
  console.log('[cleanup] Connected to MongoDB database:', mongoose.connection.name);

  const tenant = await Tenant.findOne({ slug: 'meridian-industrial' });
  if (!tenant) {
    throw new Error('Tenant meridian-industrial not found');
  }
  const tenantId = tenant._id;

  // Load users & technicians for proper referencing
  const users = await User.find({ tenantId }).lean();
  const adminUser = users.find((u) => u.role === 'Admin') || users[0];
  const techUser1 = users.find((u) => u.email.includes('tech1')) || users[0];
  const techUser2 = users.find((u) => u.email.includes('tech2')) || users[0];
  const viewerUser = users.find((u) => u.role === 'Viewer') || users[0];

  const technicians = await Technician.find({ tenantId }).lean();
  const tech1 = technicians.find((t) => t.name === 'Rafael Montoya') || technicians[0];
  const tech2 = technicians.find((t) => t.name === 'Siobhan Delacroix') || technicians[1];
  const tech3 = technicians.find((t) => t.name === 'Kwame Asante') || technicians[2];
  const tech4 = technicians.find((t) => t.name === 'Priya Nair') || technicians[3];

  console.log('[cleanup] Loaded tenant, users, and technicians successfully.');

  // ── 1. REMOVE TEST / DUMMY EQUIPMENT & ASSOCIATED RECORDS ─────────────────
  console.log('\n--- 1. AUDITING & REMOVING TEST EQUIPMENT ---');
  const testEquipDocs = await Equipment.find({
    tenantId,
    equipmentCode: { $in: CONFIRMED_TEST_CODES },
  }).lean();

  console.log(`Found ${testEquipDocs.length} confirmed test equipment records to remove:`);
  testEquipDocs.forEach((d) => console.log(`  - [${d.equipmentCode}] ${d.name} (${d._id})`));

  const testIds = testEquipDocs.map((d) => d._id);
  const testTokens = testEquipDocs.map((d) => d.qrToken).filter(Boolean);

  if (testIds.length > 0) {
    // Delete associated MaintenanceEvents
    const delMaint = await MaintenanceEvent.deleteMany({ equipmentId: { $in: testIds } });
    console.log(`Deleted ${delMaint.deletedCount} associated test maintenance events.`);

    // Delete associated FaultIncidents
    const delFaults = await FaultIncident.deleteMany({ equipmentId: { $in: testIds } });
    console.log(`Deleted ${delFaults.deletedCount} associated test fault incidents.`);

    // Delete Equipment records
    const delEquip = await Equipment.deleteMany({ _id: { $in: testIds } });
    console.log(`Deleted ${delEquip.deletedCount} test equipment records.`);

    // Clean up local QR images if any exist
    const qrDir = path.join(__dirname, '..', '..', process.env.QR_STORAGE_PATH || 'public/qr');
    for (const tok of testTokens) {
      const p = path.join(qrDir, `${tok}.png`);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); console.log(`Removed local QR image: ${p}`); } catch (_e) {}
      }
    }
  }

  // ── 2. RENAME TEST-001 -> ENV-001 (LEGITIMATE ASSET) ──────────────────────
  console.log('\n--- 2. RENAMING TEST-001 -> ENV-001 ---');
  const test001 = await Equipment.findOne({ tenantId, equipmentCode: 'TEST-001' });
  if (test001) {
    test001.equipmentCode = 'ENV-001';
    await test001.save();
    console.log(`Successfully renamed TEST-001 to ENV-001 (${test001._id})`);
  } else {
    console.log('TEST-001 not found or already renamed.');
  }

  // ── 3. AUDIT & FIX FAULTY EQUIPMENT HISTORY ───────────────────────────────
  console.log('\n--- 3. FIXING FAULTY EQUIPMENT HISTORY ---');
  const allFaulty = await Equipment.find({ tenantId, status: 'Faulty' });
  console.log(`Found ${allFaulty.length} equipment with status: 'Faulty'`);

  for (const eq of allFaulty) {
    const existingFaults = await FaultIncident.find({ equipmentId: eq._id });
    console.log(`  Equipment [${eq.equipmentCode}] ${eq.name}: currently has ${existingFaults.length} fault(s)`);

    if (eq.equipmentCode === 'LAB-002') {
      if (existingFaults.length === 0) {
        // Create realistic diagnostic maintenance event
        const maintDoc = await MaintenanceEvent.create({
          tenantId,
          equipmentId: eq._id,
          type: 'Corrective',
          performedByTechnicianId: tech2._id,
          date: daysAgo(7),
          description: 'Diagnostic vacuum integrity test performed with helium mass spectrometer. Flange micro-leak identified on specimen exchange chamber. Replacement copper gaskets and Viton O-rings requisitioned.',
          partsUsed: ['Copper sealing flange DN40', 'Viton O-ring set'],
          createdBy: techUser2._id,
        });

        // Create critical unresolved fault incident
        await FaultIncident.create({
          tenantId,
          equipmentId: eq._id,
          reportedDate: daysAgo(8),
          reportedBy: techUser2._id,
          severity: 'Critical',
          description: 'Ultra-high vacuum chamber pressure fluctuation detected during beam alignment. Ion getter pump controller displaying error code E-14 (leak rate threshold exceeded). System isolated pending high-vacuum seal replacement and bake-out cycle.',
          status: 'Open',
          linkedMaintenanceEventId: maintDoc._id,
        });
        console.log('    -> Created realistic Critical Fault & linked MaintenanceEvent for LAB-002');
      }
    } else if (eq.equipmentCode === 'PUMP-011') {
      if (existingFaults.length === 0) {
        const maintDoc = await MaintenanceEvent.create({
          tenantId,
          equipmentId: eq._id,
          type: 'Corrective',
          performedByTechnicianId: tech1._id,
          date: daysAgo(5),
          description: 'Swashplate bearing play inspected. Wear found on cylinder barrel face and valve plate. Pump isolated from main hydraulic loop pending rebuild.',
          partsUsed: [],
          createdBy: techUser1._id,
        });

        await FaultIncident.create({
          tenantId,
          equipmentId: eq._id,
          reportedDate: daysAgo(6),
          reportedBy: techUser1._id,
          severity: 'High',
          description: 'Loss of hydraulic discharge pressure and excessive swashplate displacement noise under 210 bar load. Proportional pressure relief valve hunting.',
          status: 'Open',
          linkedMaintenanceEventId: maintDoc._id,
        });
        console.log('    -> Created realistic High Fault & linked MaintenanceEvent for PUMP-011');
      }
    } else if (eq.equipmentCode === 'HVAC-007') {
      if (existingFaults.length === 0) {
        const maintDoc = await MaintenanceEvent.create({
          tenantId,
          equipmentId: eq._id,
          type: 'Corrective',
          performedByTechnicianId: tech3._id,
          date: daysAgo(8),
          description: 'Gearbox drained and inspected via borescope. Ring gear tooth pitting and bearing spalling observed. Fan drive locked out and tagged out for gearbox replacement.',
          partsUsed: [],
          createdBy: techUser1._id,
        });

        await FaultIncident.create({
          tenantId,
          equipmentId: eq._id,
          reportedDate: daysAgo(9),
          reportedBy: adminUser._id,
          severity: 'High',
          description: 'Fan gearbox oil level low switch tripped. Severe lubricant contamination detected with metal particulate in sight glass. High vibration alarm triggered on fan shaft.',
          status: 'Open',
          linkedMaintenanceEventId: maintDoc._id,
        });
        console.log('    -> Created realistic High Fault & linked MaintenanceEvent for HVAC-007');
      }
    } else if (eq.equipmentCode === 'PRESS-001') {
      if (existingFaults.length === 0) {
        const maintDoc = await MaintenanceEvent.create({
          tenantId,
          equipmentId: eq._id,
          type: 'Corrective',
          performedByTechnicianId: tech1._id,
          date: daysAgo(11),
          description: 'Emergency shutdown containment verified. Hydraulic reservoir isolated. Replacement chevron seal pack and guide bushings requisitioned from manufacturer.',
          partsUsed: ['Hydraulic spill absorbent kit'],
          createdBy: techUser1._id,
        });

        await FaultIncident.create({
          tenantId,
          equipmentId: eq._id,
          reportedDate: daysAgo(12),
          reportedBy: adminUser._id,
          severity: 'Critical',
          description: 'Main ram cylinder seal extrusion resulting in high-pressure oil blowout along guide column during downstroke cycle. Emergency stop engaged automatically.',
          status: 'Open',
          linkedMaintenanceEventId: maintDoc._id,
        });
        console.log('    -> Created realistic Critical Fault & linked MaintenanceEvent for PRESS-001');
      }
    } else if (eq.equipmentCode === 'HVAC-003') {
      // Ensure it has linked maintenance
      const existingMaint = await MaintenanceEvent.findOne({ equipmentId: eq._id });
      if (!existingMaint) {
        const maintDoc = await MaintenanceEvent.create({
          tenantId,
          equipmentId: eq._id,
          type: 'Inspection',
          performedByTechnicianId: tech3._id,
          date: daysAgo(6),
          description: 'Quarterly inspection of cooling tower cell 1. Confirmed structural degradation of PVC fill pack and cracked drift eliminator louvers. Repair pack ordered.',
          partsUsed: [],
          createdBy: adminUser._id,
        });
        if (existingFaults.length > 0 && !existingFaults[0].linkedMaintenanceEventId) {
          existingFaults[0].linkedMaintenanceEventId = maintDoc._id;
          await existingFaults[0].save();
        }
        console.log('    -> Linked MaintenanceEvent created for HVAC-003');
      }
    } else if (eq.equipmentCode === 'PUMP-003') {
      // Check link
      const existingMaint = await MaintenanceEvent.findOne({ equipmentId: eq._id, type: 'Corrective' });
      if (existingMaint && existingFaults.length > 0 && !existingFaults[0].linkedMaintenanceEventId) {
        existingFaults[0].linkedMaintenanceEventId = existingMaint._id;
        await existingFaults[0].save();
        console.log('    -> Linked existing Corrective MaintenanceEvent to PUMP-003 fault');
      }
    }
  }

  // ── 4. AUDIT & FIX UNDER-MAINTENANCE EQUIPMENT ────────────────────────────
  console.log('\n--- 4. AUDITING UNDER-MAINTENANCE EQUIPMENT ---');
  const underMaint = await Equipment.find({ tenantId, status: 'Under Maintenance' });
  console.log(`Found ${underMaint.length} equipment with status: 'Under Maintenance'`);

  for (const eq of underMaint) {
    const existingMaint = await MaintenanceEvent.find({ equipmentId: eq._id });
    console.log(`  Equipment [${eq.equipmentCode}] ${eq.name}: has ${existingMaint.length} maintenance event(s)`);

    if (eq.equipmentCode === 'GEN-005' && existingMaint.length === 0) {
      const maintDoc = await MaintenanceEvent.create({
        tenantId,
        equipmentId: eq._id,
        type: 'Preventive',
        performedByTechnicianId: tech2._id,
        date: daysAgo(4),
        description: 'Scheduled 5,000-hour major overhaul in progress. Spark plug replacement, valve clearance adjustment, and ignition controller firmware update underway.',
        partsUsed: ['Industrial spark plugs x12', 'Valve cover gasket kit'],
        createdBy: techUser2._id,
      });

      await FaultIncident.create({
        tenantId,
        equipmentId: eq._id,
        reportedDate: daysAgo(5),
        reportedBy: techUser2._id,
        severity: 'Medium',
        description: 'Exhaust gas temperature imbalance across cylinders 3 and 5 during pre-maintenance load run. Ignition timing adjustment required.',
        status: 'In Progress',
        statusHistory: [
          {
            from: 'Open',
            to: 'In Progress',
            changedBy: techUser2._id,
            changedAt: daysAgo(4),
            note: 'Unit taken offline for scheduled overhaul and cylinder calibration.',
          },
        ],
        linkedMaintenanceEventId: maintDoc._id,
      });
      console.log('    -> Created realistic In-Progress Fault & MaintenanceEvent for GEN-005');
    }
  }

  // ── 5. ENRICH INDUSTRIAL EQUIPMENT WITH REALISTIC SERVICE HISTORY ──────────
  console.log('\n--- 5. ENRICHING SERVICE HISTORIES FOR INDUSTRIAL EQUIPMENT ---');
  const industrialItems = [
    {
      code: 'PUMP-008',
      maint: {
        type: 'Scheduled',
        performedByTechnicianId: tech1._id,
        date: daysAgo(60),
        description: 'Routine quarterly impeller check and seal chamber flush. Dynamic vibration measured at 0.4 mm/s RMS (within ISO tolerance).',
        partsUsed: ['Gland packing set'],
        nextRecommendedDate: daysFromNow(60),
        createdBy: techUser1._id,
      },
    },
    {
      code: 'PUMP-009',
      maint: {
        type: 'Scheduled',
        performedByTechnicianId: tech1._id,
        date: daysAgo(150),
        description: 'Routine 120-day service. Bearing lubrication and mechanical seal face inspection completed. Coupling alignment verified.',
        partsUsed: ['Synthetic grease cartridge'],
        nextRecommendedDate: daysAgo(30), // overdue as expected
        createdBy: techUser1._id,
      },
    },
    {
      code: 'PUMP-010',
      maint: {
        type: 'Inspection',
        performedByTechnicianId: tech1._id,
        date: daysAgo(45),
        description: 'Submersible wastewater pump lift and inspection. Impeller wear ring clearance measured at 0.35 mm (spec < 0.5 mm). Returned to sump.',
        partsUsed: [],
        nextRecommendedDate: daysFromNow(15),
        createdBy: techUser1._id,
      },
    },
    {
      code: 'PUMP-012',
      maint: {
        type: 'Preventive',
        performedByTechnicianId: tech1._id,
        date: daysAgo(65),
        description: 'Air motor stroke counter checked (142,000 strokes). Fluid delivery pressure tested at 8.2 bar. Suction strainer cleaned.',
        partsUsed: [],
        nextRecommendedDate: daysFromNow(25),
        createdBy: techUser1._id,
      },
    },
    {
      code: 'PUMP-013',
      maint: {
        type: 'Scheduled',
        performedByTechnicianId: tech1._id,
        date: daysAgo(100),
        description: 'Intake strainer backwash inspection and packing gland adjustment. Shaft leakage rate calibrated to 8 drops/min for cooling.',
        partsUsed: ['Packing rings x4'],
        nextRecommendedDate: daysFromNow(20),
        createdBy: techUser1._id,
      },
    },
    {
      code: 'CONV-001',
      maint: {
        type: 'Scheduled',
        performedByTechnicianId: tech1._id,
        date: daysAgo(40),
        description: 'Conveyor belt tracking and tension adjusted. Drive drum lagging inspected for wear. Emergency pull-cord safety switches tested OK.',
        partsUsed: [],
        nextRecommendedDate: daysFromNow(20),
        createdBy: techUser1._id,
      },
    },
    {
      code: 'MILL-001',
      maint: {
        type: 'Preventive',
        performedByTechnicianId: tech4._id,
        date: daysAgo(75),
        description: 'Quarterly machine tool calibration. Spindle taper runout measured at 0.003 mm. Way lube pressure and filter verified.',
        partsUsed: ['Way lube filter element'],
        nextRecommendedDate: daysFromNow(45),
        createdBy: adminUser._id,
      },
    },
    {
      code: 'ENV-001',
      maint: {
        type: 'Inspection',
        performedByTechnicianId: tech3._id,
        date: daysAgo(90),
        description: 'Semi-annual temperature and humidity chamber calibration using NIST-traceable reference meter. Refrigerant R404A circuit pressures verified.',
        partsUsed: [],
        nextRecommendedDate: daysFromNow(90),
        createdBy: techUser1._id,
      },
    },
  ];

  for (const item of industrialItems) {
    const eq = await Equipment.findOne({ tenantId, equipmentCode: item.code });
    if (eq) {
      const hasMaint = await MaintenanceEvent.findOne({ equipmentId: eq._id });
      if (!hasMaint) {
        await MaintenanceEvent.create({
          tenantId,
          equipmentId: eq._id,
          ...item.maint,
        });
        console.log(`  Added realistic maintenance event for [${item.code}]`);
      }
    }
  }

  // ── 6. DATA INTEGRITY & AUDIT ─────────────────────────────────────────────
  console.log('\n--- 6. DATA INTEGRITY AUDIT ---');

  // Check 1: Any test equipment left?
  const remainingTest = await Equipment.countDocuments({
    tenantId,
    $or: [
      { equipmentCode: { $in: CONFIRMED_TEST_CODES } },
      { equipmentCode: /^TEST-/ },
      { name: /test/i },
      { manufacturer: /test/i },
      { model: /test/i },
    ],
  });
  console.log('Remaining test/dummy equipment records:', remainingTest);

  // Check 2: Any faulty equipment with 0 faults?
  const faultyEquips = await Equipment.find({ tenantId, status: 'Faulty' });
  let faultyWithoutFaults = 0;
  for (const eq of faultyEquips) {
    const fc = await FaultIncident.countDocuments({ equipmentId: eq._id });
    if (fc === 0) {
      console.error(`ERROR: Faulty equipment ${eq.equipmentCode} has 0 faults!`);
      faultyWithoutFaults++;
    }
  }
  console.log('Faulty equipment without fault history:', faultyWithoutFaults);

  // Check 3: Any under-maintenance equipment with 0 maintenance?
  const underMaintEquips = await Equipment.find({ tenantId, status: 'Under Maintenance' });
  let underMaintWithoutHistory = 0;
  for (const eq of underMaintEquips) {
    const mc = await MaintenanceEvent.countDocuments({ equipmentId: eq._id });
    if (mc === 0) {
      console.error(`ERROR: Under Maintenance equipment ${eq.equipmentCode} has 0 maintenance events!`);
      underMaintWithoutHistory++;
    }
  }
  console.log('Under Maintenance equipment without maintenance history:', underMaintWithoutHistory);

  // Check 4: Orphaned MaintenanceEvents?
  const allMaint = await MaintenanceEvent.find({ tenantId });
  let orphanMaint = 0;
  for (const m of allMaint) {
    const eq = await Equipment.findById(m.equipmentId);
    if (!eq) {
      console.error(`ERROR: Orphaned MaintenanceEvent ${m._id} -> non-existent equipment ${m.equipmentId}`);
      orphanMaint++;
    }
  }
  console.log('Orphaned maintenance events:', orphanMaint);

  // Check 5: Orphaned FaultIncidents?
  const allFaults = await FaultIncident.find({ tenantId });
  let orphanFaults = 0;
  for (const f of allFaults) {
    const eq = await Equipment.findById(f.equipmentId);
    if (!eq) {
      console.error(`ERROR: Orphaned FaultIncident ${f._id} -> non-existent equipment ${f.equipmentId}`);
      orphanFaults++;
    }
  }
  console.log('Orphaned fault incidents:', orphanFaults);

  // Check 6: QR token integrity
  const allEquips = await Equipment.find({ tenantId });
  const tokenSet = new Set();
  let duplicateTokens = 0;
  let invalidActiveTokens = 0;
  for (const eq of allEquips) {
    if (tokenSet.has(eq.qrToken)) {
      console.error(`ERROR: Duplicate qrToken found: ${eq.qrToken} on ${eq.equipmentCode}`);
      duplicateTokens++;
    }
    tokenSet.add(eq.qrToken);

    if (eq.status !== 'Retired') {
      if (eq.qrStatus !== 'active' || !/^[0-9a-f]{64}$/i.test(eq.qrToken)) {
        console.error(`ERROR: Invalid active QR token on ${eq.equipmentCode}: ${eq.qrToken}`);
        invalidActiveTokens++;
      }
    }
  }
  console.log('Duplicate QR tokens:', duplicateTokens);
  console.log('Invalid active QR tokens:', invalidActiveTokens);

  // Check 7: Pump count check
  const pumpCodes = ['PUMP-001', 'PUMP-002', 'PUMP-003', 'PUMP-004', 'PUMP-005', 'PUMP-006', 'PUMP-007', 'PUMP-008', 'PUMP-009', 'PUMP-010', 'PUMP-011', 'PUMP-012', 'PUMP-013'];
  const existingPumps = await Equipment.find({ tenantId, equipmentCode: { $in: pumpCodes } }).select('equipmentCode').lean();
  console.log(`Pump check: found ${existingPumps.length} of ${pumpCodes.length} expected pumps.`);

  // ── 7. SUMMARY STATISTICS ─────────────────────────────────────────────────
  const now = new Date();
  const totalEquip = allEquips.length;
  const operational = allEquips.filter((e) => e.status === 'Operational').length;
  const faulty = allEquips.filter((e) => e.status === 'Faulty').length;
  const inMaint = allEquips.filter((e) => e.status === 'Under Maintenance').length;
  const retired = allEquips.filter((e) => e.status === 'Retired').length;
  const overdue = allEquips.filter((e) => e.status !== 'Retired' && e.nextMaintenanceDate && e.nextMaintenanceDate < now).length;
  const openFaults = await FaultIncident.countDocuments({ tenantId, status: { $in: ['Open', 'In Progress'] } });

  console.log('\n================ FINAL DATABASE STATISTICS ================');
  console.log(`  Total Equipment:                ${totalEquip}`);
  console.log(`  Operational:                    ${operational}`);
  console.log(`  Faulty:                         ${faulty}`);
  console.log(`  Under Maintenance:              ${inMaint}`);
  console.log(`  Retired:                        ${retired}`);
  console.log(`  Overdue:                        ${overdue}`);
  console.log(`  Total Maintenance Events:       ${allMaint.length}`);
  console.log(`  Total Fault Incidents:          ${allFaults.length}`);
  console.log(`  Active Unresolved Faults:       ${openFaults}`);
  console.log('===========================================================\n');

  await mongoose.disconnect();
  console.log('[cleanup] Finished successfully and disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('[cleanup] FATAL ERROR:', err);
  process.exit(1);
});
