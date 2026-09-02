# Industrial QR Demo — Implementation and Handoff

## Delivered flow

1. Every equipment record receives a cryptographically random 64-character token.
2. The QR PNG encodes `/equipment/<token>` and remains stable until an admin explicitly rotates or retires it.
3. The mobile page calls `/api/public/scan/<token>` and renders current condition, service dates, maintenance/fault history, technician ownership, and installation data.
4. Retired, replaced, rotated, restricted, malformed, and unknown labels have deliberate non-active screens.

## User-facing surfaces

- `/equipment/<token>` — mobile-first equipment passport.
- `/demo` — controlled QR Label Lab with printable 80 × 50 mm labels and realistic acceptance states.
- `/admin` — authenticated equipment administration, QR issue/download/print, editing, regeneration and retirement.
- `/api/public/scan/<token>` — public-safe profile JSON.
- `/api/public/demo-equipment` — label-lab directory; disabled in production unless `ENABLE_DEMO_DIRECTORY=true`.

## Administration workflow

The seeded Admin account signs in at `/admin`. The portal loads up to 100
tenant-scoped equipment records and active technicians from the authenticated
API. Creating an asset shows a live label preview while typing, then calls
`POST /api/equipment`. Only after the equipment is persisted does the portal
show the real QR with download, print and profile-test actions.

Existing labels are retrieved through Admin-only
`GET /api/equipment/:id/qr`. Editing descriptive or assignment fields keeps
the same token. QR regeneration requires a confirmation because it revokes the
old printed label. Retirement also requires confirmation and changes the old
label into a lifecycle tombstone.

## Shared UI contract for Zaid

The profile UI is intentionally component-shaped even though it is framework-free:

- `profile-header` — asset identity, site location, share action, condition banner.
- `summary-grid` — last maintenance, next maintenance, open fault count.
- `history-panel` — accessible Maintenance/Fault tabs and timelines.
- `technician-panel` — name, initials, specialty; never public contact details.
- `details-panel` — manufacturer, model, serial, installation date, interval.
- `system-state` — retired, replaced, revoked, restricted, invalid, and unavailable states.

Shared colors, spacing, typography, borders, and state semantics live in `public/app/styles.css` under `:root`. A React frontend can reuse the API field names and these state rules without changing the backend.

Condition priority is: Faulty/Critical → Under Maintenance → Overdue → open High/Medium fault → Operational. This prevents a green operational badge from masking overdue work or an active fault.

## Public data boundary

The public profile includes the latest ten maintenance and fault records plus aggregate counts. It includes technician name/specialty because ownership is a product requirement. It never exposes database IDs, tenant IDs, tokens, technician contact information, user identities, attachments, or internal notes.

## QR and print verification

Run:

```bash
npm run seed
npm run test:qr
```

`test:qr` reads the generated PNG pixels and decodes every current and historical label. It fails if an image is missing, unreadable, or contains anything other than its expected `/equipment/<token>` URL.

Physical acceptance procedure:

1. Open `/demo`, choose **Print test sheet**, use A4 at 100% scale, and disable browser header/footer output.
2. Verify the QR itself is at least 30 mm wide with a clear white quiet zone.
3. Scan with one current iOS phone and one current Android phone at 20 cm, 50 cm, and 80 cm in normal installation light.
4. Confirm the printed asset code and phone profile code/name match.
5. Confirm status and maintenance urgency appear before scrolling.
6. Repeat with a lightly scuffed copy and a label under a clear protective laminate.
7. Verify PUMP-005 opens Retired and PUMP-006 opens Replaced with PUMP-007 as successor.

The software-side PNG decode, API, lifecycle, and responsive browser checks are automated. The two-phone/physical-media step requires real devices and the intended printer/label stock before production sign-off.

## Deployment notes

- Set `BASE_URL` to the public HTTPS origin before creating production QR images.
- Re-run the QR seed/generation only for demo data; production labels should be issued through the equipment API.
- Keep `ENABLE_DEMO_DIRECTORY=false` in ordinary production environments.
- Serve behind HTTPS so phone cameras open the record without an insecure-site warning.
- Local filesystem QR storage is suitable for this demo. Use shared object storage if the service runs on multiple instances.
