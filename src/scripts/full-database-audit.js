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
  // operationalOnSchedule + needsAttention + underMaintenance + retired == totalEquipment
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

  // 12. QR integrity check
  const tokenSet = new Set();
  let duplicateTokens = 0;
  let invalidActiveTokens = 0;
  for (const eq of equips) {
    if (tokenSet.has(eq.qrToken)) duplicateTokens++;
    tokenSet.add(eq.qrToken);

    if (eq.status !== 'Retired') {
      if (eq.qrStatus !== 'active' || !/^[0-9a-f]{64}$/i.test(eq.qrToken)) {
        invalidActiveTokens++;
      }
    } else {
      if (!['revoked', 'replaced'].includes(eq.qrStatus)) {
        console.warn(`Retired item ${eq.equipmentCode} has unexpected qrStatus: ${eq.qrStatus}`);
      }
    }
  }

  // 13. Replacement relationship check
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

  // 15. Pump check
  const expectedPumps = ['PUMP-001', 'PUMP-002', 'PUMP-003', 'PUMP-004', 'PUMP-005', 'PUMP-006', 'PUMP-007', 'PUMP-008', 'PUMP-009', 'PUMP-010', 'PUMP-011', 'PUMP-012', 'PUMP-013'];
  const actualPumps = equips.filter((e) => expectedPumps.includes(e.equipmentCode)).map((e) => e.equipmentCode);

  console.log('\n===============================================================');
  console.log('              COMPREHENSIVE DATABASE AUDIT REPORT             ');
  console.log('===============================================================');
  console.log(`Total Equipment Records:             ${totalEquipment}`);
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
  console.log(`  • Remaining Test/Dummy Records:    ${testEquips.length} ${testEquips.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Faulty Equipment with 0 Faults:  ${faultyWithoutFaults.length} ${faultyWithoutFaults.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Under-Maint without Activity:    ${underMaintWithoutActivity.length} ${underMaintWithoutActivity.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Orphaned Maintenance Events:     ${orphanedMaint} ${orphanedMaint === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Orphaned Fault Incidents:        ${orphanedFaults} ${orphanedFaults === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Duplicate QR Tokens:             ${duplicateTokens} ${duplicateTokens === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Invalid Active QR Tokens:        ${invalidActiveTokens} ${invalidActiveTokens === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Invalid Replacement References:  ${invalidReplacements} ${invalidReplacements === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Invalid Technician References:   ${invalidTechRefs} ${invalidTechRefs === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  • Expected Pumps (PUMP-001 to 013):${actualPumps.length}/13 ${actualPumps.length === 13 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('===============================================================\n');

  // Check LAB-002 specifically
  const lab002 = equips.find((e) => e.equipmentCode === 'LAB-002');
  if (lab002) {
    const labFaults = await FaultIncident.find({ equipmentId: lab002._id }).lean();
    const labMaint = await MaintenanceEvent.find({ equipmentId: lab002._id }).lean();
    console.log('LAB-002 Verification:');
    console.log(`  • Status:      ${lab002.status}`);
    console.log(`  • Fault Count: ${labFaults.length} (Severity: ${labFaults[0]?.severity}, Status: ${labFaults[0]?.status})`);
    console.log(`  • Fault Desc:  ${labFaults[0]?.description}`);
    console.log(`  • Maint Count: ${labMaint.length} (Type: ${labMaint[0]?.type})`);
    console.log(`  • Maint Desc:  ${labMaint[0]?.description}\n`);
  }

  // Check ENV-001
  const env001 = equips.find((e) => e.equipmentCode === 'ENV-001');
  if (env001) {
    console.log('ENV-001 (formerly TEST-001) Verification:');
    console.log(`  • Name:        ${env001.name}`);
    console.log(`  • Mfr/Model:   ${env001.manufacturer} ${env001.model}`);
    console.log(`  • Status:      ${env001.status}`);
    console.log(`  • QR Token:    ${env001.qrToken.substring(0, 16)}... (active)\n`);
  }

  await mongoose.disconnect();
}

audit().catch((err) => {
  console.error('[audit] FATAL ERROR:', err);
  process.exit(1);
});
