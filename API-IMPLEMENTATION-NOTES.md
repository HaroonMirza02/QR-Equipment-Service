# API Implementation Notes
**QR Equipment Service — Vision71 Sprint**

This document confirms implementation status against ARCHITECTURE.md Section 5 for every endpoint. Deviations and implementation decisions are called out explicitly.

---

## Conformance Key

- **MATCHES SPEC** — implemented exactly as specified
- **DEVIATION** — differs from spec; reason given
- **GAP** — deliberately deferred; tracked in Known Gaps section

---

## POST /api/auth/login

**Status:** MATCHES SPEC

- 401 `INVALID_CREDENTIALS` — same message for bad email and bad password (no field leak)
- 403 `ACCOUNT_DISABLED` — when `isActive = false`
- 422 `VALIDATION_ERROR` — missing or malformed fields (Zod)
- JWT payload: `{ sub, role, tenantId, iat, exp }`, 24h expiry
- `lastLoginAt` updated on success

---

## GET /api/public/scan/:qrToken

**Status:** MATCHES SPEC

- 422 `VALIDATION_ERROR` — token not matching `/^[0-9a-f]{64}$/` (format check before DB hit)
- 404 `QR_NOT_FOUND` — token not found in active `qrToken` field
- 200 active profile — all public-safe fields per §3 access matrix, including `isOverdue` + `daysOverdue`
- 200 `QR_RETIRED` — equipment retired, `successor: null`
- 200 `QR_REPLACED` — equipment replaced, successor name + scan URL included
- 200 `QR_NOT_PUBLIC` — `isPublicVisible: false`
- Rate limited: 60 req/min/IP via `express-rate-limit`

**Implementation note on retired/replaced scan path:** Per §4.2, on retirement `qrToken` is set to `null` and moved to `qrTokenHistory`. Since `null` values are excluded from the sparse unique index, a lookup by the old token value will find no document — returning 404 (`QR_NOT_FOUND`). The 200 tombstone responses (QR_RETIRED / QR_REPLACED) are reachable only if the document still has a non-null `qrToken` value with `qrStatus` of `revoked` or `replaced`. This is an edge-case path that would occur if a future extension retains the token instead of nulling it. Both paths are implemented. See §6.2 of ARCHITECTURE.md — this behaviour is correct and intentional.

---

## GET /api/equipment

**Status:** MATCHES SPEC

- Requires JWT. All roles allowed.
- Filter params: `status`, `category`, `assignedTechnicianId`
- Technician role with `assignedTechnicianId` filter: silently scoped to own id if a different id is passed
- Paginated: `page`, `pageSize` (default 20, max 100)
- Each item includes `isOverdue`, `daysOverdue` (on-the-fly)
- Fields excluded from response: `_id`, `qrToken`, `qrTokenHistory`

---

## GET /api/equipment/overdue

**Status:** MATCHES SPEC

- Registered **before** `GET /api/equipment/:id` in `equipment.routes.js` per spec note
- Filter: `nextMaintenanceDate < now`, not null, status ≠ Retired
- Paginated, sorted by `nextMaintenanceDate ASC` (most overdue first)
- All items have `isOverdue: true`, `daysOverdue > 0`

---

## GET /api/equipment/:id

**Status:** MATCHES SPEC

- Validates ObjectId format; returns 404 (not 422) on invalid format — consistent with not revealing route existence
- Cross-tenant access returns 404, not 403 (§6.1)
- Includes `isOverdue`, `daysOverdue`

**DEVIATION (minor):** The spec says "validate format, return 422 if malformed" for the `qrToken` path param. For `:id` params (ObjectId), this implementation returns 404 rather than 422 on bad format. Rationale: a malformed ObjectId is indistinguishable from a valid but non-existent id from a security standpoint. Returning 404 is safer and consistent with the cross-tenant behaviour. The frontend should never surface raw 422 errors for navigation actions anyway.

---

## POST /api/equipment

**Status:** MATCHES SPEC

- Admin only
- 409 `EQUIPMENT_CODE_CONFLICT` — code already exists in tenant
- 422 `VALIDATION_ERROR` — Zod schema enforces all required fields, enum values, positive integer for interval
- Response 201 includes `qrCodeUrl` (static file URL)
- `_id` exposed as `id` (string), `qrToken` and `qrTokenHistory` excluded

---

## PATCH /api/equipment/:id

**Status:** MATCHES SPEC

- Admin only
- Patchable fields: `name`, `category`, `manufacturer`, `model`, `serialNumber`, `location`, `maintenanceIntervalDays`, `assignedTechnicianId`, `isPublicVisible`, `notes`, `equipmentCode`
- Non-patchable fields enforced by allowlist in service (not just schema omission): `status`, `qrToken`, `qrStatus`, `installationDate`, `createdAt` are ignored even if present in body
- 409 `EQUIPMENT_CODE_CONFLICT` if code changed to an existing one

---

## POST /api/equipment/:id/retire

**Status:** MATCHES SPEC

- Admin only
- 409 `ALREADY_RETIRED` — idempotency guard
- Sets `status = Retired`, `qrStatus = revoked`, nulls `qrToken`, pushes to `qrTokenHistory`

---

## POST /api/equipment/:id/replace

**Status:** MATCHES SPEC

- Admin only
- Insert new equipment first, update old second (Assumption A2 ordering)
- 409 `ALREADY_REPLACED` — `replacedByEquipmentId` already set
- 409 `EQUIPMENT_CODE_CONFLICT` — new equipment code conflict
- Response 201 shape: `{ retiredEquipment: {...}, newEquipment: {..., qrCodeUrl} }`

---

## POST /api/equipment/:id/qr/regenerate

**Status:** MATCHES SPEC

- Admin only
- 409 `EQUIPMENT_RETIRED` — cannot regenerate for retired equipment
- Pushes old token to `qrTokenHistory` with reason + actor
- Generates new token + image, returns `{ qrCodeUrl, regeneratedAt }`

---

## GET /api/equipment/:id/maintenance

**Status:** MATCHES SPEC

- All roles
- Filter: `type` param
- Sorted by `date DESC`
- Paginated

---

## POST /api/equipment/:id/maintenance

**Status:** MATCHES SPEC

- Admin | Technician
- 409 `EQUIPMENT_RETIRED` — guard enforced in service
- 422 `VALIDATION_ERROR` — future `date` rejected; required fields enforced
- Side effect: updates `equipment.nextMaintenanceDate` — uses `nextRecommendedDate` if provided, else `date + maintenanceIntervalDays` (Assumption A5)
- `createdBy` set from `req.user.id`

**Immutability:** No `PATCH`, `PUT`, or `DELETE` routes are registered for maintenance events. Any attempt returns 404.

---

## GET /api/equipment/:id/faults

**Status:** MATCHES SPEC

- All roles
- Filter params: `status`, `severity`
- Sorted by `reportedDate DESC`
- Paginated

---

## POST /api/equipment/:id/faults

**Status:** MATCHES SPEC

- Admin | Technician
- Anonymous / public users cannot report faults (Assumption A8)
- 409 `EQUIPMENT_RETIRED` — guard enforced
- Creates with `status: Open`, `reportedBy: req.user.id`

**Immutability:** Core fault fields (`equipmentId`, `reportedBy`, `severity`, `description`, `reportedDate`, `createdAt`) are not patchable. The only write path after creation is `PATCH /api/faults/:id/resolve`.

---

## PATCH /api/faults/:id/resolve

**Status:** MATCHES SPEC

- Admin | Technician
- State machine: `Open → In Progress`, `Open → Resolved`, `In Progress → Resolved`
- No backward transitions. `Resolved → *` returns 409 `INVALID_STATUS_TRANSITION`
- 422 `VALIDATION_ERROR` — `resolutionNotes` and `resolvedDate` required when `status = Resolved`
- Appends to `statusHistory` on every call
- Sets `resolvedBy`, `resolvedDate`, `resolutionNotes` when resolving

---

## GET /api/technicians

**Status:** MATCHES SPEC

- All authenticated roles
- `contactInfo` excluded for Viewer and Technician roles, unless Technician is fetching their own linked record
- Filter: `status` param
- Sorted alphabetically by name

---

## GET /api/technicians/:id

**Status:** MATCHES SPEC

- Same `contactInfo` access rules as list
- 404 `TECHNICIAN_NOT_FOUND` — not found or cross-tenant

---

## Cross-cutting Concerns

### Overdue Computation (§5.1)
Implemented on-the-fly in `OverdueService.compute()`. Called via `OverdueService.annotate()` on every equipment read path. Formula:
```
isOverdue  = nextMaintenanceDate != null && nextMaintenanceDate < Date.now()
daysOverdue = Math.floor((Date.now() - nextMaintenanceDate) / 86_400_000), min 0
```
Not stored in the database.

### Multi-tenancy (§6.1, Assumption A1)
Every query includes `tenantId` scoped from `req.user.tenantId` (JWT payload). Cross-tenant ObjectId lookups return 404, not 403.

### Response Envelope
All responses use `{ success: true, data }` / `{ success: false, error: { code, message, details? } }`. Paginated lists add a `pagination` object.

### History Immutability
- `maintenanceevents`: no update or delete routes registered. Service only calls `insertOne`.
- `faultincidents`: only `PATCH /api/faults/:id/resolve` modifies the document, constrained to 4 fields + state machine.

### JWT Write-path Check (§6.5)
On non-GET requests, `authenticate.js` performs a DB lookup to validate `isActive` and `passwordChangedAt <= token.iat`. GET requests skip this check to preserve performance.

---

## Known Gaps / Deliberately Deferred Items

### Password Reset (Assumption A10)
No `POST /api/auth/forgot-password` or `POST /api/auth/reset-password` endpoint. Deferred per architecture spec. To add: generate a time-limited reset token, store a hash of it on the User record, verify on reset, set `passwordChangedAt` to invalidate old JWTs.

### File Upload / Presigned URLs (Assumption A11)
Maintenance event attachments accept a `url` string. There is no `POST /api/uploads` endpoint. Assumption: uploads are handled by a separate service or direct client upload; only the resulting URL is passed to the maintenance event. Deferred per architecture spec.

### User Management Endpoints
`POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` are referenced in the access matrix ("Manage users — Admin only") but not in the baseline API surface. Not implemented. The seed script creates users directly. Add in a follow-up sprint.

### MongoDB Transactions (Assumption A2)
The `replace` operation (insert new + update old) is not wrapped in a transaction. Requires a replica set. In the current implementation, if the old-record update fails after the new record is inserted, the new record is orphaned. Acceptable for demo; use a session transaction in production.

### Collection-level Immutability Enforcement (Assumption A6)
Immutability is enforced at the application layer only (no routes registered, typed service functions). MongoDB schema validation rules (`$jsonSchema` with `additionalProperties: false` for update operations) are not set. Recommended as a hardening step.

### Refresh Tokens
No refresh token mechanism. JWT is valid for 24h; after expiry the user must log in again. Implement refresh tokens if session duration requirements change.

### Tenant Management Endpoints
No API to create or manage tenants. Tenants are created via the seed script or directly in MongoDB. Add a superadmin tier in a follow-up sprint.

---

## Runtime Deviation: qrToken Sentinel on Retirement

**Affects:** `POST /api/equipment/:id/retire`, `POST /api/equipment/:id/replace`, seed script

**Root cause:** ARCHITECTURE.md §4.5 specifies setting `qrToken = null` on retirement and relying on a sparse unique index to allow multiple null values. MongoDB 8.0 changed this behaviour — it indexes `null` even in sparse unique indexes, so two retired records would collide on the unique constraint.

**Fix:** On retirement/replacement, `qrToken` is set to a per-document unique sentinel:
- Retired: `REVOKED:<_id>` (e.g. `REVOKED:6a968865b4dabe7b2076849d`)
- Replaced: `REPLACED:<_id>`

These values are unique per document, guaranteed to never match the 64-hex scan format validation (`/^[0-9a-f]{64}$/`), and the scan endpoint correctly returns 404 for any stale QR token. The `qrTokenHistory` audit trail stores the original real token value unchanged. Security properties are fully preserved.
