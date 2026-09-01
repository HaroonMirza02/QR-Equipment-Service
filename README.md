# QR Equipment Service — Backend

Industrial "scan a machine → see its service picture" system. Every piece of equipment has a QR code. Scanning it opens a mobile-friendly profile showing installation info, maintenance history, fault history, current status, assigned technician, and next maintenance date.

Built on the MERN stack (Node.js/Express + MongoDB/Mongoose). Designed for multiple tenants — no single company is hard-coded.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18.x or higher |
| MongoDB | 6.x or higher (local or Atlas) |
| npm | 9.x or higher |

MongoDB must be running and reachable before you start the server or run the seed.

---

## Install

```bash
cd "QR Equipment Service"
npm install
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in every value:

```bash
copy .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port the server listens on. Default: `3000` |
| `BASE_URL` | Yes | Public base URL, used when constructing QR image URLs and scan links. E.g. `http://localhost:3000` |
| `MONGODB_URI` | Yes | Full MongoDB connection string. E.g. `mongodb://localhost:27017/qr_equipment` |
| `JWT_SECRET` | Yes | Long random string used to sign JWTs. Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | No | JWT lifetime in seconds. Default: `86400` (24 h) |
| `BCRYPT_ROUNDS` | No | bcrypt salt rounds. Minimum 12. Default: `12` |
| `QR_STORAGE_PATH` | No | Relative path for QR PNG files. Default: `public/qr` |
| `PUBLIC_SCAN_RATE_LIMIT` | No | Max requests/min/IP on the public scan endpoint. Default: `60` |
| `NODE_ENV` | No | `development` \| `production` \| `test` |

---

## Seed the Database

The seed script creates one tenant, four users, four technicians, and 18 realistic equipment items with maintenance and fault history. Safe to re-run — it cleans the seeded tenant's data first.

```bash
npm run seed
```

Seeded credentials:

| Email | Password | Role |
|---|---|---|
| admin@meridian.example | Admin1234! | Admin |
| tech1@meridian.example | Tech1234! | Technician |
| tech2@meridian.example | Tech1234! | Technician |
| viewer@meridian.example | View1234! | Viewer |

Equipment includes: 10 operational, 2 under maintenance, 2 faulty, 3 overdue, 1 private (not public-visible), 1 retired (no successor), 1 replaced (PUMP-006 → PUMP-007 chain).

---

## Start the Server

```bash
# Production
npm start

# Development (auto-restart on file changes, requires nodemon)
npm run dev
```

The server starts on the port specified in `.env` (default 3000).

Static QR images are served at: `GET /static/qr/<token>.png`

---

## Run the Tests

```bash
npm test
```

This runs `src/scripts/test-runner.js` — a self-contained HTTP test script. It requires a running server and a seeded database.

**Before running tests:**
1. Make sure the server is running (`npm start` in one terminal)
2. Make sure the database is seeded (`npm run seed`)
3. Run the tests in a second terminal: `npm test`

The script exercises every endpoint including all error paths. Results are printed to stdout with PASS/FAIL per test case.

---

## Project Structure

```
src/
├── app.js                    Express app (middleware + route mounting)
├── server.js                 Entry point (DB connect + listen)
├── config/
│   └── database.js           Mongoose connection
├── models/
│   ├── Tenant.js
│   ├── User.js
│   ├── Technician.js
│   ├── Equipment.js
│   ├── MaintenanceEvent.js
│   └── FaultIncident.js
├── services/
│   ├── AuthService.js        Login, JWT sign/verify, bcrypt
│   ├── QRService.js          Token generation, QR image generation, rotate/revoke/replace
│   ├── OverdueService.js     On-the-fly overdue computation
│   ├── EquipmentService.js   CRUD + lifecycle (retire, replace, regenerate QR)
│   ├── MaintenanceService.js Append-only maintenance events
│   ├── FaultService.js       Fault creation + state-machine resolution
│   ├── TechnicianService.js  Read-only, contact info access control
│   └── ScanService.js        Public QR scan resolution
├── controllers/
│   ├── AuthController.js
│   ├── EquipmentController.js
│   ├── MaintenanceController.js
│   ├── FaultController.js
│   ├── TechnicianController.js
│   └── ScanController.js
├── routes/
│   ├── public.routes.js      /api/public/* (no auth, rate limited)
│   ├── auth.routes.js        /api/auth/*
│   ├── equipment.routes.js   /api/equipment/* (JWT required)
│   ├── maintenance.routes.js /api/equipment/:id/maintenance
│   ├── fault.routes.js       /api/equipment/:id/faults
│   ├── flat-fault.routes.js  /api/faults/:id/resolve
│   └── technician.routes.js  /api/technicians/*
├── middleware/
│   ├── authenticate.js       JWT verify + write-path DB check
│   ├── roleGuard.js          Role enforcement
│   ├── validate.js           Zod schema validation
│   ├── errorHandler.js       Central error handler
│   └── notFound.js           404 handler
├── validation/
│   └── schemas.js            Zod schemas for all request bodies
├── utils/
│   ├── AppError.js           Structured error class
│   └── response.js           Response helpers (success, paginated)
└── scripts/
    ├── seed.js               Database seed script
    └── test-runner.js        Automated test script

public/
└── qr/                       Generated QR PNG files (auto-created)

architecture/
└── ARCHITECTURE.md           Authoritative architecture specification
```

---

## API Overview

All responses use the envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }
```

Paginated list responses add:
```json
{ "pagination": { "page": 1, "pageSize": 20, "totalCount": 143, "totalPages": 8 } }
```

### Public (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/api/public/scan/:qrToken` | Resolve QR code to equipment profile |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Get JWT |

### Equipment (JWT required)
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/equipment` | All | List equipment |
| GET | `/api/equipment/overdue` | All | Overdue equipment |
| GET | `/api/equipment/:id` | All | Single equipment |
| POST | `/api/equipment` | Admin | Create equipment |
| PATCH | `/api/equipment/:id` | Admin | Update equipment |
| POST | `/api/equipment/:id/retire` | Admin | Retire equipment |
| POST | `/api/equipment/:id/replace` | Admin | Replace equipment |
| POST | `/api/equipment/:id/qr/regenerate` | Admin | Regenerate QR token |

### Maintenance (JWT required)
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/equipment/:id/maintenance` | All | List maintenance events |
| POST | `/api/equipment/:id/maintenance` | Admin, Technician | Add maintenance event |

### Faults (JWT required)
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/equipment/:id/faults` | All | List fault incidents |
| POST | `/api/equipment/:id/faults` | Admin, Technician | Report fault |
| PATCH | `/api/faults/:id/resolve` | Admin, Technician | Advance fault status |

### Technicians (JWT required)
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/technicians` | All | List technicians |
| GET | `/api/technicians/:id` | All | Single technician |

Full request/response shapes, all error codes, and field-level restrictions are in `architecture/ARCHITECTURE.md` and `API-IMPLEMENTATION-NOTES.md`.
