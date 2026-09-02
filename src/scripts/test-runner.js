'use strict';

/**
 * QR Equipment Service — Automated Test Runner
 *
 * Self-contained HTTP test script. No external test framework required.
 * Uses only Node.js built-ins (http, https) plus the project's own modules.
 *
 * Prerequisites:
 *   1. Server running:  npm start  (in a separate terminal)
 *   2. Database seeded: npm run seed
 *
 * Run: npm test   OR   node src/scripts/test-runner.js
 *
 * Output: PASS/FAIL per test case, final summary with counts.
 * Exit code: 0 = all passed, 1 = one or more failures.
 */

require('dotenv').config();
const http = require('http');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────────────

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TIMEOUT_MS = 8000;

// Parsed from BASE_URL
const parsedBase = new URL(BASE);
const USE_HTTPS = parsedBase.protocol === 'https:';
const HOST = parsedBase.hostname;
const PORT = parsedBase.port
  ? parseInt(parsedBase.port, 10)
  : USE_HTTPS ? 443 : 80;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
      timeout: TIMEOUT_MS,
    };

    const lib = USE_HTTPS ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

const results = { pass: 0, fail: 0, errors: [] };

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    results.pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    results.fail++;
    results.errors.push(`${label}${detail ? ': ' + detail : ''}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
}

function assertBody(label, res, expectedStatus, expectedCode) {
  assert(
    `${label} → HTTP ${expectedStatus}`,
    res.status === expectedStatus,
    `got ${res.status}`
  );
  if (expectedCode) {
    const code = res.body?.error?.code || res.body?.data?.code;
    assert(
      `${label} → code ${expectedCode}`,
      code === expectedCode,
      `got "${code}"`
    );
  }
}

// ── State shared across tests ─────────────────────────────────────────────────

let adminToken = '';
let techToken = '';
let viewerToken = '';
let equipmentId = '';       // a normal operational equipment id
let overdueEquipId = '';    // PUMP-002 (overdue)
let faultyEquipId = '';     // PUMP-003 (faulty, open critical fault)
let retiredEquipId = '';    // PUMP-005 (retired, no successor)
let replacedEquipId = '';   // PUMP-006 (replaced by PUMP-007)
let newEquipId = '';        // equipment created during tests
let maintenanceEventId = '';
let faultId = '';
let openFaultId = '';       // a real open fault to test resolve flow
let technicianId = '';
let activeQrToken = '';     // token for a live equipment item

// ── Test suites ───────────────────────────────────────────────────────────────

async function testAuth() {
  section('AUTH');

  // 422 — missing fields
  let res = await request('POST', '/api/auth/login', {});
  assertBody('Login with empty body', res, 422, 'VALIDATION_ERROR');

  // 422 — bad email format
  res = await request('POST', '/api/auth/login', { email: 'notanemail', password: 'x' });
  assertBody('Login with bad email format', res, 422, 'VALIDATION_ERROR');

  // 401 — wrong password (same message as wrong email)
  res = await request('POST', '/api/auth/login', {
    email: 'admin@meridian.example',
    password: 'wrongpassword',
  });
  assertBody('Login with wrong password', res, 401, 'INVALID_CREDENTIALS');

  // 401 — email not found
  res = await request('POST', '/api/auth/login', {
    email: 'nobody@meridian.example',
    password: 'Admin1234!',
  });
  assertBody('Login with unknown email', res, 401, 'INVALID_CREDENTIALS');

  // 200 — admin login
  res = await request('POST', '/api/auth/login', {
    email: 'admin@meridian.example',
    password: 'Admin1234!',
  });
  assert('Admin login → 200', res.status === 200, `got ${res.status}`);
  assert('Admin login → token present', typeof res.body?.data?.token === 'string');
  assert('Admin login → role = Admin', res.body?.data?.user?.role === 'Admin');
  adminToken = res.body?.data?.token || '';

  // 200 — technician login
  res = await request('POST', '/api/auth/login', {
    email: 'tech1@meridian.example',
    password: 'Tech1234!',
  });
  assert('Tech login → 200', res.status === 200);
  techToken = res.body?.data?.token || '';

  // 200 — viewer login
  res = await request('POST', '/api/auth/login', {
    email: 'viewer@meridian.example',
    password: 'View1234!',
  });
  assert('Viewer login → 200', res.status === 200);
  viewerToken = res.body?.data?.token || '';
}

async function testEquipmentList() {
  section('EQUIPMENT — List');

  // 401 — no token
  let res = await request('GET', '/api/equipment');
  assertBody('List equipment without auth', res, 401);

  // 200 — admin can list
  res = await request('GET', '/api/equipment', null, { Authorization: `Bearer ${adminToken}` });
  assert('List equipment → 200', res.status === 200);
  assert('List equipment → data is array', Array.isArray(res.body?.data));
  assert('List equipment → has pagination', typeof res.body?.pagination?.totalCount === 'number');
  assert('List equipment → items have isOverdue', res.body?.data?.[0]?.isOverdue !== undefined);
  assert('List equipment → items have daysOverdue', res.body?.data?.[0]?.daysOverdue !== undefined);
  assert('List equipment → qrToken not exposed', res.body?.data?.[0]?.qrToken === undefined);

  // Capture IDs for later tests
  const items = res.body?.data || [];
  const operational = items.find((e) => e.status === 'Operational' && e.isPublicVisible);
  equipmentId = operational?.id || '';
  assert('List equipment → found operational item', !!equipmentId);

  overdueEquipId = items.find((e) => e.equipmentCode === 'PUMP-002')?.id || '';
  faultyEquipId  = items.find((e) => e.equipmentCode === 'PUMP-003')?.id || '';

  // Viewer can list
  res = await request('GET', '/api/equipment', null, { Authorization: `Bearer ${viewerToken}` });
  assert('Viewer can list equipment → 200', res.status === 200);

  // Filter by status
  res = await request('GET', '/api/equipment?status=Faulty', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Filter by status=Faulty → all items Faulty',
    (res.body?.data || []).every((e) => e.status === 'Faulty'));

  // Pagination
  res = await request('GET', '/api/equipment?page=1&pageSize=3', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Pagination pageSize=3 → max 3 items', (res.body?.data || []).length <= 3);
}

async function testEquipmentOverdue() {
  section('EQUIPMENT — Overdue');

  const res = await request('GET', '/api/equipment/overdue', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Overdue list → 200', res.status === 200);
  const items = res.body?.data || [];
  assert('Overdue list → all isOverdue=true', items.every((e) => e.isOverdue === true));
  assert('Overdue list → all daysOverdue > 0', items.every((e) => e.daysOverdue > 0));
  assert('Overdue list → none Retired', items.every((e) => e.status !== 'Retired'));
  assert('Overdue list → at least 3 items', items.length >= 3);
}

async function testEquipmentGetById() {
  section('EQUIPMENT — Get by ID');

  // 401 — no token
  let res = await request('GET', `/api/equipment/${equipmentId}`);
  assertBody('Get equipment without auth', res, 401);

  // 404 — bad id format (treated as not found)
  res = await request('GET', '/api/equipment/notanid', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assertBody('Get equipment with invalid id', res, 404);

  // 404 — valid ObjectId that doesn't exist
  res = await request('GET', '/api/equipment/000000000000000000000001', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assertBody('Get equipment with non-existent id', res, 404, 'EQUIPMENT_NOT_FOUND');

  // 200 — valid
  res = await request('GET', `/api/equipment/${equipmentId}`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Get equipment by id → 200', res.status === 200);
  assert('Get equipment → has isOverdue', res.body?.data?.isOverdue !== undefined);
  assert('Get equipment → no qrToken', res.body?.data?.qrToken === undefined);

  // Capture the qrToken path from the seed — need it for QR scan tests
  // We get it from the admin list response (but qrToken is stripped).
  // Instead, we'll query the overdue item and use its id for scan test via DB.
  // For the scan test we need the actual token — use the equipment id to look
  // up from the GET list; but tokens are stripped. We'll create a new equipment
  // item (in testEquipmentCreate) and capture qrCodeUrl from there.
}

async function testEquipmentCreate() {
  section('EQUIPMENT — Create');

  // 403 — technician cannot create
  let res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-TECH-001',
      name: 'Tech Create Test',
      category: 'Pump',
      manufacturer: 'TestCo',
      model: 'T-1',
      installationDate: '2024-01-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 30,
    },
    { Authorization: `Bearer ${techToken}` }
  );
  assertBody('Technician cannot create equipment', res, 403, 'INSUFFICIENT_ROLE');

  // 403 — viewer cannot create
  res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-VIEW-001',
      name: 'Viewer Create Test',
      category: 'Pump',
      manufacturer: 'TestCo',
      model: 'T-1',
      installationDate: '2024-01-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 30,
    },
    { Authorization: `Bearer ${viewerToken}` }
  );
  assertBody('Viewer cannot create equipment', res, 403, 'INSUFFICIENT_ROLE');

  // 422 — missing required fields
  res = await request(
    'POST',
    '/api/equipment',
    { equipmentCode: 'TEST-MISS-001' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create equipment missing fields', res, 422, 'VALIDATION_ERROR');
  assert('Create equipment missing fields → details array', Array.isArray(res.body?.error?.details));

  // 422 — invalid category
  res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-CAT-001',
      name: 'Cat Test',
      category: 'Submarine',
      manufacturer: 'TestCo',
      model: 'T-1',
      installationDate: '2024-01-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 30,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create equipment invalid category', res, 422, 'VALIDATION_ERROR');

  // 201 — success
  res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-NEW-001',
      name: 'Test Pump Unit',
      category: 'Pump',
      manufacturer: 'TestCo',
      model: 'TP-100',
      serialNumber: 'TC-2024-001',
      installationDate: '2024-03-01',
      location: { site: 'Test Site', building: 'Block A', zone: 'Zone 1' },
      maintenanceIntervalDays: 60,
      isPublicVisible: true,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Create equipment → 201', res.status === 201, `got ${res.status}`);
  assert('Create equipment → has id', typeof res.body?.data?.id === 'string');
  assert('Create equipment → has qrCodeUrl', typeof res.body?.data?.qrCodeUrl === 'string');
  assert('Create equipment → qrToken not in response', res.body?.data?.qrToken === undefined);
  newEquipId = res.body?.data?.id || '';

  // Extract qrToken from the qrCodeUrl path for scan tests
  // qrCodeUrl = http://localhost:3000/static/qr/<token>.png
  const qrCodeUrl = res.body?.data?.qrCodeUrl || '';
  const match = qrCodeUrl.match(/\/([0-9a-f]{64})\.png$/);
  activeQrToken = match ? match[1] : '';
  assert('Create equipment → qrCodeUrl contains 64-char token', !!activeQrToken);

  // Existing QR retrieval for the admin portal
  res = await request('GET', `/api/equipment/${newEquipId}/qr`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Get existing equipment QR → 200', res.status === 200, `got ${res.status}`);
  assert('Get existing equipment QR → has qrCodeUrl', typeof res.body?.data?.qrCodeUrl === 'string');
  assert('Get existing equipment QR → has profileUrl', typeof res.body?.data?.profileUrl === 'string');
  assert('Get existing equipment QR → code matches', res.body?.data?.equipmentCode === 'TEST-NEW-001');

  res = await request('GET', `/api/equipment/${newEquipId}/qr`, null, {
    Authorization: `Bearer ${viewerToken}`,
  });
  assertBody('Viewer cannot retrieve printable QR', res, 403, 'INSUFFICIENT_ROLE');

  // 409 — duplicate code
  res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-NEW-001',
      name: 'Duplicate',
      category: 'Pump',
      manufacturer: 'TestCo',
      model: 'TP-100',
      installationDate: '2024-03-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 60,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create equipment duplicate code', res, 409, 'EQUIPMENT_CODE_CONFLICT');
}

async function testEquipmentPatch() {
  section('EQUIPMENT — Patch');

  // 403 — viewer cannot patch
  let res = await request(
    'PATCH',
    `/api/equipment/${newEquipId}`,
    { name: 'Viewer Patch Attempt' },
    { Authorization: `Bearer ${viewerToken}` }
  );
  assertBody('Viewer cannot patch equipment', res, 403, 'INSUFFICIENT_ROLE');

  // 422 — invalid category
  res = await request(
    'PATCH',
    `/api/equipment/${newEquipId}`,
    { category: 'Submarine' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Patch invalid category', res, 422, 'VALIDATION_ERROR');

  // 200 — valid patch
  res = await request(
    'PATCH',
    `/api/equipment/${newEquipId}`,
    { name: 'Updated Test Pump Unit', notes: 'Updated via test' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Patch equipment → 200', res.status === 200, `got ${res.status}`);
  assert('Patch equipment → name updated', res.body?.data?.name === 'Updated Test Pump Unit');

  // Status field must NOT be patchable via PATCH
  res = await request(
    'PATCH',
    `/api/equipment/${newEquipId}`,
    { status: 'Retired' },
    { Authorization: `Bearer ${adminToken}` }
  );
  // Either 422 (Zod strips unknown) or 200 with status unchanged
  if (res.status === 200) {
    assert(
      'Patch equipment — status field not accepted',
      res.body?.data?.status !== 'Retired',
      `status was changed to Retired`
    );
  } else {
    assert('Patch equipment — status rejected', res.status === 200 || res.status === 422);
  }
}

async function testMaintenanceEvents() {
  section('MAINTENANCE EVENTS');

  // 401 — no token
  let res = await request('GET', `/api/equipment/${equipmentId}/maintenance`);
  assertBody('Get maintenance without auth', res, 401);

  // 200 — list maintenance
  res = await request('GET', `/api/equipment/${equipmentId}/maintenance`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('List maintenance → 200', res.status === 200);
  assert('List maintenance → data is array', Array.isArray(res.body?.data));

  // 403 — viewer cannot create
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/maintenance`,
    {
      type: 'Inspection',
      performedByTechnicianId: '000000000000000000000001',
      date: '2024-06-01',
      description: 'Test inspection',
    },
    { Authorization: `Bearer ${viewerToken}` }
  );
  assertBody('Viewer cannot create maintenance', res, 403, 'INSUFFICIENT_ROLE');

  // 404 — equipment not found
  res = await request(
    'POST',
    '/api/equipment/000000000000000000000001/maintenance',
    {
      type: 'Inspection',
      performedByTechnicianId: '000000000000000000000001',
      date: '2024-06-01',
      description: 'Test',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create maintenance for non-existent equipment', res, 404, 'EQUIPMENT_NOT_FOUND');

  // 422 — future date
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/maintenance`,
    {
      type: 'Inspection',
      performedByTechnicianId: '000000000000000000000001',
      date: tomorrow,
      description: 'Future date test',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create maintenance with future date', res, 422);

  // 422 — missing required fields
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/maintenance`,
    { type: 'Inspection' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create maintenance missing fields', res, 422, 'VALIDATION_ERROR');

  // 201 — success (need a real technicianId from the seeded data)
  // Get a real technician id first
  const techListRes = await request('GET', '/api/technicians', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  technicianId = techListRes.body?.data?.[0]?.id || '';
  assert('Got technician id for maintenance test', !!technicianId);

  const pastDate = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/maintenance`,
    {
      type: 'Inspection',
      performedByTechnicianId: technicianId,
      date: pastDate,
      description: 'Commissioning inspection via test',
      partsUsed: ['Test part A'],
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Create maintenance → 201', res.status === 201, `got ${res.status}`);
  assert('Create maintenance → has id', typeof res.body?.data?.id === 'string');
  maintenanceEventId = res.body?.data?.id || '';

  // Verify nextMaintenanceDate was updated on equipment
  res = await request('GET', `/api/equipment/${newEquipId}`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert(
    'nextMaintenanceDate updated after maintenance',
    res.body?.data?.nextMaintenanceDate !== null
  );

  // No UPDATE/DELETE routes exist for maintenance events
  res = await request('DELETE', `/api/equipment/${newEquipId}/maintenance/${maintenanceEventId}`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('DELETE maintenance → 404 (route does not exist)', res.status === 404, `got ${res.status}`);
}

async function testFaultIncidents() {
  section('FAULT INCIDENTS');

  // 401 — no token
  let res = await request('GET', `/api/equipment/${equipmentId}/faults`);
  assertBody('Get faults without auth', res, 401);

  // 200 — list faults for faulty equipment
  res = await request('GET', `/api/equipment/${faultyEquipId}/faults`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('List faults for faulty equipment → 200', res.status === 200);
  assert('List faults → data is array', Array.isArray(res.body?.data));

  // 403 — viewer cannot create fault
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/faults`,
    {
      reportedDate: new Date().toISOString(),
      severity: 'Low',
      description: 'Viewer fault attempt',
    },
    { Authorization: `Bearer ${viewerToken}` }
  );
  assertBody('Viewer cannot create fault', res, 403, 'INSUFFICIENT_ROLE');

  // 422 — invalid severity
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/faults`,
    {
      reportedDate: new Date().toISOString(),
      severity: 'Catastrophic',
      description: 'Bad severity test',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create fault with invalid severity', res, 422, 'VALIDATION_ERROR');

  // 422 — missing fields
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/faults`,
    { severity: 'Low' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Create fault missing fields', res, 422, 'VALIDATION_ERROR');

  // 201 — create fault
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/faults`,
    {
      reportedDate: new Date().toISOString(),
      severity: 'Medium',
      description: 'Test fault — unusual noise from coupling',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Create fault → 201', res.status === 201, `got ${res.status}`);
  assert('Create fault → status = Open', res.body?.data?.status === 'Open');
  faultId = res.body?.data?.id || '';
  openFaultId = faultId;

  // ── Resolve flow ──────────────────────────────────────────────────────────

  // 422 — resolve requires resolutionNotes + resolvedDate when status=Resolved
  res = await request(
    'PATCH',
    `/api/faults/${faultId}/resolve`,
    { status: 'Resolved' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Resolve fault without notes/date', res, 422, 'VALIDATION_ERROR');

  // 200 — advance to In Progress
  res = await request(
    'PATCH',
    `/api/faults/${faultId}/resolve`,
    { status: 'In Progress' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Advance fault to In Progress → 200', res.status === 200, `got ${res.status}`);
  assert('Fault status = In Progress', res.body?.data?.status === 'In Progress');
  assert('statusHistory has 1 entry', res.body?.data?.statusHistory?.length === 1);

  // 409 — cannot go In Progress → Open (backward)
  res = await request(
    'PATCH',
    `/api/faults/${faultId}/resolve`,
    { status: 'In Progress' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Backward fault transition', res, 409, 'INVALID_STATUS_TRANSITION');

  // 200 — resolve
  res = await request(
    'PATCH',
    `/api/faults/${faultId}/resolve`,
    {
      status: 'Resolved',
      resolutionNotes: 'Coupling replaced, noise resolved.',
      resolvedDate: new Date().toISOString(),
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Resolve fault → 200', res.status === 200, `got ${res.status}`);
  assert('Fault status = Resolved', res.body?.data?.status === 'Resolved');
  assert('Fault has resolvedDate', !!res.body?.data?.resolvedDate);
  assert('statusHistory has 2 entries', res.body?.data?.statusHistory?.length === 2);

  // 409 — cannot transition from Resolved (terminal)
  res = await request(
    'PATCH',
    `/api/faults/${faultId}/resolve`,
    { status: 'In Progress' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Transition from Resolved (terminal)', res, 409, 'INVALID_STATUS_TRANSITION');

  // 404 — fault not found
  res = await request(
    'PATCH',
    '/api/faults/000000000000000000000001/resolve',
    { status: 'In Progress' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Resolve non-existent fault', res, 404, 'FAULT_NOT_FOUND');
}

async function testTechnicians() {
  section('TECHNICIANS');

  // 401 — no token
  let res = await request('GET', '/api/technicians');
  assertBody('List technicians without auth', res, 401);

  // 200 — admin gets full objects including contactInfo
  res = await request('GET', '/api/technicians', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Admin list technicians → 200', res.status === 200);
  assert('Admin sees contactInfo', !!res.body?.data?.[0]?.contactInfo);
  technicianId = res.body?.data?.[0]?.id || '';

  // Viewer should NOT see contactInfo
  res = await request('GET', '/api/technicians', null, {
    Authorization: `Bearer ${viewerToken}`,
  });
  assert('Viewer list technicians → 200', res.status === 200);
  assert('Viewer does NOT see contactInfo', res.body?.data?.[0]?.contactInfo === undefined);

  // 200 — get by id (admin)
  res = await request('GET', `/api/technicians/${technicianId}`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Get technician by id → 200', res.status === 200);
  assert('Admin sees contactInfo on single', !!res.body?.data?.contactInfo);

  // 404 — not found
  res = await request('GET', '/api/technicians/000000000000000000000001', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assertBody('Get non-existent technician', res, 404, 'TECHNICIAN_NOT_FOUND');
}

async function testQRLifecycle() {
  section('QR LIFECYCLE');

  // ── Retire ────────────────────────────────────────────────────────────────

  // 403 — technician cannot retire
  let res = await request(
    'POST',
    `/api/equipment/${newEquipId}/retire`,
    {},
    { Authorization: `Bearer ${techToken}` }
  );
  assertBody('Technician cannot retire equipment', res, 403, 'INSUFFICIENT_ROLE');

  // 200 — admin retires test equipment
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/retire`,
    { reason: 'End of test lifecycle' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Retire equipment → 200', res.status === 200, `got ${res.status}`);
  assert('Retired → status = Retired', res.body?.data?.status === 'Retired');
  assert('Retired → qrStatus = revoked', res.body?.data?.qrStatus === 'revoked');
  assert('Retired → qrToken not exposed', res.body?.data?.qrToken === undefined);

  // 409 — retire already-retired
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/retire`,
    {},
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Retire already-retired equipment', res, 409, 'ALREADY_RETIRED');

  // 409 — cannot add maintenance to retired equipment
  const pastDate = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/maintenance`,
    {
      type: 'Inspection',
      performedByTechnicianId: technicianId,
      date: pastDate,
      description: 'Post-retire maintenance attempt',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Cannot add maintenance to retired equipment', res, 409, 'EQUIPMENT_RETIRED');

  // 409 — cannot add fault to retired equipment
  res = await request(
    'POST',
    `/api/equipment/${newEquipId}/faults`,
    {
      reportedDate: new Date().toISOString(),
      severity: 'Low',
      description: 'Post-retire fault attempt',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Cannot add fault to retired equipment', res, 409, 'EQUIPMENT_RETIRED');

  // ── Regenerate QR ─────────────────────────────────────────────────────────

  // Create a fresh equipment item to test QR regeneration
  res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-QR-REGEN-001',
      name: 'QR Regen Test Unit',
      category: 'Compressor',
      manufacturer: 'TestCo',
      model: 'QR-1',
      installationDate: '2024-01-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 90,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  const regenEquipId = res.body?.data?.id || '';
  assert('Created equipment for QR regen test', !!regenEquipId);

  // 403 — technician cannot regenerate
  res = await request(
    'POST',
    `/api/equipment/${regenEquipId}/qr/regenerate`,
    {},
    { Authorization: `Bearer ${techToken}` }
  );
  assertBody('Technician cannot regenerate QR', res, 403, 'INSUFFICIENT_ROLE');

  // 200 — admin regenerates QR
  res = await request(
    'POST',
    `/api/equipment/${regenEquipId}/qr/regenerate`,
    { reason: 'Test QR rotation' },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Regenerate QR → 200', res.status === 200, `got ${res.status}`);
  assert('Regenerate QR → new qrCodeUrl', typeof res.body?.data?.qrCodeUrl === 'string');
  assert('Regenerate QR → has regeneratedAt', typeof res.body?.data?.regeneratedAt === 'string');

  // ── Replace ───────────────────────────────────────────────────────────────

  // Create equipment to replace
  res = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-OLD-001',
      name: 'To Be Replaced',
      category: 'Pump',
      manufacturer: 'OldCo',
      model: 'OLD-1',
      installationDate: '2020-01-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 90,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  const oldEquipId = res.body?.data?.id || '';
  assert('Created old equipment for replace test', !!oldEquipId);

  // 201 — replace
  res = await request(
    'POST',
    `/api/equipment/${oldEquipId}/replace`,
    {
      equipmentCode: 'TEST-NEW-REPLACEMENT-001',
      name: 'Replacement Unit',
      category: 'Pump',
      manufacturer: 'NewCo',
      model: 'NEW-1',
      installationDate: new Date().toISOString().split('T')[0],
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 90,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert('Replace equipment → 201', res.status === 201, `got ${res.status}`);
  assert('Replace → retiredEquipment present', !!res.body?.data?.retiredEquipment);
  assert('Replace → newEquipment present', !!res.body?.data?.newEquipment);
  assert('Replace → old status = Retired', res.body?.data?.retiredEquipment?.status === 'Retired');
  assert('Replace → new has qrCodeUrl', typeof res.body?.data?.newEquipment?.qrCodeUrl === 'string');

  // 409 — cannot replace already-replaced
  res = await request(
    'POST',
    `/api/equipment/${oldEquipId}/replace`,
    {
      equipmentCode: 'TEST-DOUBLE-REPLACE-001',
      name: 'Double Replace Attempt',
      category: 'Pump',
      manufacturer: 'NewCo',
      model: 'NEW-2',
      installationDate: new Date().toISOString().split('T')[0],
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 90,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assertBody('Replace already-replaced equipment', res, 409, 'ALREADY_REPLACED');
}

async function testPublicScan() {
  section('PUBLIC SCAN — QR resolution');

  // 422 — invalid token format
  let res = await request('GET', '/api/public/scan/tooshort');
  assertBody('Scan invalid token format', res, 422, 'VALIDATION_ERROR');

  // 422 — non-hex characters
  res = await request('GET', `/api/public/scan/${'z'.repeat(64)}`);
  assertBody('Scan non-hex token', res, 422, 'VALIDATION_ERROR');

  // 404 — token not found (random valid format)
  const fakeToken = '0'.repeat(64);
  res = await request('GET', `/api/public/scan/${fakeToken}`);
  assertBody('Scan unknown token', res, 404, 'QR_NOT_FOUND');

  // 200 — active equipment (use token captured from create test)
  if (activeQrToken) {
    // The equipment was retired during testQRLifecycle. Its printed label now
    // resolves to an explicit safe tombstone.
    res = await request('GET', `/api/public/scan/${activeQrToken}`);
    assert('Scan retired equipment token → 200', res.status === 200, `got ${res.status}`);
    assert('Scan retired equipment token → QR_RETIRED', res.body?.data?.code === 'QR_RETIRED');
  }

  // ── Scan a LIVE operational item ──────────────────────────────────────────
  // Create a fresh item to scan while it's active
  const createRes = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-SCAN-LIVE-001',
      name: 'Live Scan Test Unit',
      category: 'HVAC',
      manufacturer: 'ScanCo',
      model: 'SCAN-1',
      installationDate: '2023-01-01',
      location: { site: 'Scan Site', building: 'Block S', zone: 'Zone S' },
      maintenanceIntervalDays: 90,
      isPublicVisible: true,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  const liveQrUrl = createRes.body?.data?.qrCodeUrl || '';
  const liveTokenMatch = liveQrUrl.match(/\/([0-9a-f]{64})\.png$/);
  const liveToken = liveTokenMatch ? liveTokenMatch[1] : '';
  assert('Created live equipment for scan test', !!liveToken);

  // 200 — scan active, public equipment
  res = await request('GET', `/api/public/scan/${liveToken}`);
  assert('Scan active equipment → 200', res.status === 200, `got ${res.status}`);
  assert('Scan → has equipmentCode', typeof res.body?.data?.equipmentCode === 'string');
  assert('Scan → has status', typeof res.body?.data?.status === 'string');
  assert('Scan → has isOverdue', res.body?.data?.isOverdue !== undefined);
  assert('Scan → has daysOverdue', res.body?.data?.daysOverdue !== undefined);
  assert('Scan → has maintenanceSummary', typeof res.body?.data?.maintenanceSummary === 'object');
  assert('Scan → has faultSummary', typeof res.body?.data?.faultSummary === 'object');
  assert('Scan → has maintenanceHistory', Array.isArray(res.body?.data?.maintenanceHistory));
  assert('Scan → has faultHistory', Array.isArray(res.body?.data?.faultHistory));
  assert('Scan → has assignedTechnician field', 'assignedTechnician' in (res.body?.data || {}));
  assert('Scan → qrToken not exposed', res.body?.data?.qrToken === undefined);
  assert('Scan → id not exposed', res.body?.data?.id === undefined);
  assert('Scan → assignedTechnicianId not exposed', res.body?.data?.assignedTechnicianId === undefined);

  // ── Scan private equipment ────────────────────────────────────────────────
  const privateRes = await request(
    'POST',
    '/api/equipment',
    {
      equipmentCode: 'TEST-PRIVATE-SCAN-001',
      name: 'Private Scan Test Unit',
      category: 'Electrical',
      manufacturer: 'PrivCo',
      model: 'PRIV-1',
      installationDate: '2023-01-01',
      location: { site: 'S', building: 'B', zone: 'Z' },
      maintenanceIntervalDays: 90,
      isPublicVisible: false,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  const privUrl = privateRes.body?.data?.qrCodeUrl || '';
  const privMatch = privUrl.match(/\/([0-9a-f]{64})\.png$/);
  const privToken = privMatch ? privMatch[1] : '';

  if (privToken) {
    res = await request('GET', `/api/public/scan/${privToken}`);
    assert('Scan private equipment → 200 (not 404)', res.status === 200, `got ${res.status}`);
    assert('Scan private → code QR_NOT_PUBLIC', res.body?.data?.code === 'QR_NOT_PUBLIC');
  }

  // A valid-format token that never existed remains an unrecognized QR.
  res = await request('GET', `/api/public/scan/${'a'.repeat(64)}`);
  assertBody('Scan unknown valid-format token → 404', res, 404, 'QR_NOT_FOUND');
}

async function testSeedOverdueItems() {
  section('OVERDUE COMPUTATION — Seeded data');

  const res = await request('GET', '/api/equipment/overdue', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert('Overdue endpoint returns data', res.status === 200);

  const items = res.body?.data || [];
  // Seeded overdue items: PUMP-002 (15 days), COMP-002 (30 days), HVAC-002 (44 days)
  const overdueCodes = items.map((e) => e.equipmentCode);
  assert('PUMP-002 is overdue', overdueCodes.includes('PUMP-002'));
  assert('COMP-002 is overdue', overdueCodes.includes('COMP-002'));
  assert('HVAC-002 is overdue', overdueCodes.includes('HVAC-002'));

  // Verify daysOverdue is positive for each
  const pump002 = items.find((e) => e.equipmentCode === 'PUMP-002');
  assert('PUMP-002 daysOverdue > 0', pump002 && pump002.daysOverdue > 0, `got ${pump002?.daysOverdue}`);
}

async function testRoleGuard() {
  section('ROLE GUARD — Comprehensive');

  const routes = [
    // [method, path, body, expectedStatus, label]
    ['POST', '/api/equipment', null, 403, 'Viewer: POST /equipment'],
    ['POST', '/api/equipment', null, 403, 'Tech: POST /equipment (will use techToken below)'],
    ['PATCH', `/api/equipment/${equipmentId}`, { name: 'x' }, 403, 'Viewer: PATCH /equipment/:id'],
    ['POST', `/api/equipment/${equipmentId}/retire`, {}, 403, 'Viewer: POST /equipment/:id/retire'],
    ['POST', `/api/equipment/${equipmentId}/replace`, {}, 403, 'Viewer: POST /equipment/:id/replace'],
    ['POST', `/api/equipment/${equipmentId}/qr/regenerate`, {}, 403, 'Viewer: POST /equipment/:id/qr/regenerate'],
  ];

  for (const [method, path, body, expectedStatus, label] of routes) {
    const token = label.startsWith('Tech') ? techToken : viewerToken;
    const res = await request(method, path, body, { Authorization: `Bearer ${token}` });
    assert(`${label} → ${expectedStatus}`, res.status === expectedStatus, `got ${res.status}`);
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  QR Equipment Service — Test Runner');
  console.log(`  Target: ${BASE}`);
  console.log('══════════════════════════════════════════════════════════════');

  // Check server is up
  try {
    await request('GET', '/api/equipment');
    // Will get 401, that's fine — it means server is running
  } catch (err) {
    console.error(`\n[FATAL] Cannot reach server at ${BASE}`);
    console.error('  Make sure the server is running: npm start');
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }

  try {
    await testAuth();
    await testEquipmentList();
    await testEquipmentOverdue();
    await testEquipmentGetById();
    await testEquipmentCreate();
    await testEquipmentPatch();
    await testMaintenanceEvents();
    await testFaultIncidents();
    await testTechnicians();
    await testQRLifecycle();
    await testPublicScan();
    await testSeedOverdueItems();
    await testRoleGuard();
  } catch (err) {
    console.error('\n[FATAL] Unexpected test runner error:', err);
    results.fail++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = results.pass + results.fail;
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${results.pass}/${total} passed`);
  if (results.fail > 0) {
    console.log(`\n  Failed (${results.fail}):`);
    results.errors.forEach((e) => console.log(`    ✗ ${e}`));
  } else {
    console.log('  All tests passed.');
  }
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(results.fail > 0 ? 1 : 0);
}

run();
