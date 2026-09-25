'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');

const Tenant = require('../models/Tenant');
const Technician = require('../models/Technician');
const Equipment = require('../models/Equipment');
const MaintenanceEvent = require('../models/MaintenanceEvent');
const FaultIncident = require('../models/FaultIncident');

async function audit() {
  await connectDB();
  console.log('[audit] Connected to MongoDB database:', mongoose.connection.name);

  const tenant = await Tenant.findOne({ slug: 'meridian-industrial' });
  if (!tenant) throw new Error('Tenant not found');
  const tenantId = tenant._id;

  const now = new Date();

  // 1. All Equipment
  const equips = await Equipment.find({ tenantId }).lean();
  const totalEquipment = equips.length;

  // 2. Status Counts
  const operational = equips.filter((e) => e.status === 'Operational').length;
  const faulty = equips.filter((e) => e.status === 'Faulty').length;
  const underMaintenance = equips.filter((e) => e.status === 'Under Maintenance').length;
  const retired = equips.filter((e) => e.status === 'Retired').length;

  // 3. Overdue
  const overdue = equips.filter(
    (e) => e.status !== 'Retired' && e.nextMaintenanceDate && new Date(e.nextMaintenanceDate) < now
  ).length;

  // 4. Overdue vs On Schedule for Operational
  const operationalOverdue = equips.filter(
    (e) => e.status === 'Operational' && e.nextMaintenanceDate && new Date(e.nextMaintenanceDate) < now
  ).length;
  const operationalOnSchedule = equips.filter(
    (e) => e.status === 'Operational' && (!e.nextMaintenanceDate || new Date(e.nextMaintenanceDate) >= now)
  ).length;

  // 5. Needs Attention (Precedence Rule: Faulty + Operational Overdue)
  const needsAttention = faulty + operationalOverdue;

  // 6. Check mutual exclusivity:
  const mutuallyExclusiveSum = operationalOnSchedule + needsAttention + underMaintenance + retired;
  const reconciled = mutuallyExclusiveSum === totalEquipment;

  // 7. Maintenance and Fault counts per equipment
  let equipWithMaintenance = 0;
  let equipWithFaults = 0;
  let faultyWithoutFaults = [];
  let underMaintWithoutActivity = [];

  for (const eq of equips) {
    const mc = await MaintenanceEvent.countDocuments({ equipmentId: eq._id });
    const fc = await FaultIncident.countDocuments({ equipmentId: eq._id });

    if (mc > 0) equipWithMaintenance++;
    if (fc > 0) equipWithFaults++;

    if (eq.status === 'Faulty' && fc === 0) {
      faultyWithoutFaults.push(eq.equipmentCode);
    }
    if (eq.status === 'Under Maintenance' && mc === 0 && fc === 0) {
      underMaintWithoutActivity.push(eq.equipmentCode);
    }
  }

  // 8. Unresolved Faults
  const unresolvedFaults = await FaultIncident.countDocuments({
    tenantId,
    status: { $in: ['Open', 'In Progress'] },
  });

  // 9. Check Test/Dummy equipment
  const testEquips = equips.filter(
    (e) =>
      ['DUMMY', 'TEST-PRIVATE-SCAN-001', 'TEST-SCAN-LIVE-001', 'TEST-NEW-REPLACEMENT-001', 'TEST-OLD-001', 'TEST-QR-REGEN-001', 'TEST-NEW-001'].includes(e.equipmentCode) ||
      e.equipmentCode.startsWith('TEST-') ||
      e.name === 'TEST' ||
      e.manufacturer === 'TEST' ||
      e.model === 'TEST'
  );

  // 9b. Check Lab equipment (must be 0 in industrial dataset)
  const labEquips = equips.filter(
    (e) =>
      e.equipmentCode.startsWith('LAB-') ||
      e.name.toLowerCase().includes('microscope') ||
      e.name.toLowerCase().includes('spectrometer')
  );

  // 10. Orphan check for MaintenanceEvents
  const allMaint = await MaintenanceEvent.find({ tenantId }).lean();
  let orphanedMaint = 0;
  for (const m of allMaint) {
    const eq = equips.find((e) => e._id.toString() === m.equipmentId.toString());
    if (!eq) orphanedMaint++;
  }

  // 11. Orphan check for FaultIncidents
  const allFaults = await FaultIncident.find({ tenantId }).lean();
  let orphanedFaults = 0;
  for (const f of allFaults) {
    const eq = equips.find((e) => e._id.toString() === f.equipmentId.toString());
    if (!eq) orphanedFaults++;
  }

  // 12. QR Token integrity
  const allTokens = equips.map((e) => e.qrToken).filter(Boolean);
  const duplicateTokens = allTokens.length - new Set(allTokens).size;
  const invalidActiveTokens = equips.filter(
    (e) => e.qrStatus === 'active' && (!e.qrToken || !/^[0-9a-f]{64}$/.test(e.qrToken))
  ).length;

  // 13. Replacement reference check
  let invalidReplacements = 0;
  for (const eq of equips) {
    if (eq.replacedByEquipmentId) {
      const target = equips.find((e) => e._id.toString() === eq.replacedByEquipmentId.toString());
      if (!target) invalidReplacements++;
    }
    if (eq.replacedFromEquipmentId) {
      const source = equips.find((e) => e._id.toString() === eq.replacedFromEquipmentId.toString());
      if (!source) invalidReplacements++;
    }
  }

  // 14. Technician reference check
  const techs = await Technician.find({ tenantId }).select('_id').lean();
  const techIds = new Set(techs.map((t) => t._id.toString()));
  let invalidTechRefs = 0;
  for (const eq of equips) {
    if (eq.assignedTechnicianId && !techIds.has(eq.assignedTechnicianId.toString())) {
      invalidTechRefs++;
    }
  }
  for (const m of allMaint) {
    if (m.performedByTechnicianId && !techIds.has(m.performedByTechnicianId.toString())) {
      invalidTechRefs++;
    }
  }

  // 15. Expected Equipment Check
  const expectedPumps = ['PUMP-001', 'PUMP-002', 'PUMP-003', 'PUMP-004', 'PUMP-005', 'PUMP-006', 'PUMP-007'];
  const expectedGens = ['GEN-001', 'GEN-002', 'GEN-003'];
  const expectedComps = ['COMP-001', 'COMP-002', 'COMP-003'];
  const expectedMachs = ['MACH-001', 'MACH-002'];
  const expectedHvacs = ['HVAC-001', 'HVAC-002', 'HVAC-003'];

  const actualPumps = equips.filter((e) => expectedPumps.includes(e.equipmentCode)).map((e) => e.equipmentCode);
  const actualGens = equips.filter((e) => expectedGens.includes(e.equipmentCode)).map((e) => e.equipmentCode);
  const actualComps = equips.filter((e) => expectedComps.includes(e.equipmentCode)).map((e) => e.equipmentCode);
  const actualMachs = equips.filter((e) => expectedMachs.includes(e.equipmentCode)).map((e) => e.equipmentCode);
  const actualHvacs = equips.filter((e) => expectedHvacs.includes(e.equipmentCode)).map((e) => e.equipmentCode);

  console.log('\n===============================================================');
  console.log('              COMPREHENSIVE DATABASE AUDIT REPORT             ');
  console.log('===============================================================');
  console.log(`Total Equipment Records:             ${totalEquipment} ${totalEquipment === 18 ? '✓ (Exactly 18 records)' : '✗'}`);
  console.log(`  • Operational (Total):             ${operational}`);
  console.log(`    - Operational & On Schedule:     ${operationalOnSchedule}`);
  console.log(`    - Operational & Overdue:         ${operationalOverdue}`);
  console.log(`  • Needs Attention (Faulty+Overdue):${needsAttention}`);
  console.log(`  • Faulty:                          ${faulty}`);
  console.log(`  • Under Maintenance:               ${underMaintenance}`);
  console.log(`  • Retired:                         ${retired}`);
  console.log(`  • Total Overdue:                   ${overdue}`);
  console.log('---------------------------------------------------------------');
  console.log(`Reconciliation Verification:`);
  console.log(`  Operational(On Schedule) [${operationalOnSchedule}] + Needs Attention [${needsAttention}] + In Maintenance [${underMaintenance}] + Retired [${retired}] = ${mutuallyExclusiveSum}`);
  console.log(`  Matches Total Registered [${totalEquipment}]:   ${reconciled ? '✓ YES (Exact match)' : '✗ NO'}`);
  console.log('---------------------------------------------------------------');
  console.log(`Equipment with Maintenance History:  ${equipWithMaintenance}`);
  console.log(`Equipment with Fault History:        ${equipWithFaults}`);
  console.log(`Total Maintenance Event Records:     ${allMaint.length}`);
  console.log(`Total Fault Incident Records:        ${allFaults.length}`);
  console.log(`Active Unresolved Faults:            ${unresolvedFaults}`);
  console.log('---------------------------------------------------------------');
  console.log(`INTEGRITY CHECKS:`);
  console.log(`  • Test/Dummy Records:              ${testEquips.length} ${testEquips.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Non-industrial Lab Records:      ${labEquips.length} ${labEquips.length === 0 ? '✓ PASS (No lab items)' : '✗ FAIL'}`);
  console.log(`  • Faulty Equipment with 0 Faults:  ${faultyWithoutFaults.length} ${faultyWithoutFaults.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Under-Maint without Activity:    ${underMaintWithoutActivity.length} ${underMaintWithoutActivity.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Orphaned Maintenance Events:     ${orphanedMaint} ${orphanedMaint === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Orphaned Fault Incidents:        ${orphanedFaults} ${orphanedFaults === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Duplicate QR Tokens:             ${duplicateTokens} ${duplicateTokens === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Invalid Active QR Tokens:        ${invalidActiveTokens} ${invalidActiveTokens === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Invalid Replacement References:  ${invalidReplacements} ${invalidReplacements === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Invalid Technician References:   ${invalidTechRefs} ${invalidTechRefs === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Realistic Pumps (PUMP-001..007): ${actualPumps.length}/7 ${actualPumps.length === 7 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Realistic Gens  (GEN-001..003):  ${actualGens.length}/3 ${actualGens.length === 3 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Realistic Comps (COMP-001..003): ${actualComps.length}/3 ${actualComps.length === 3 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Production Mach (MACH-001..002): ${actualMachs.length}/2 ${actualMachs.length === 2 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Realistic HVAC  (HVAC-001..003): ${actualHvacs.length}/3 ${actualHvacs.length === 3 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('===============================================================\n');

  await mongoose.disconnect();
}

audit().catch((err) => {
  console.error('[audit] ERROR:', err);
  process.exit(1);
});
