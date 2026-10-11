## Change

Describe the attendance workflow affected and the resulting behavior.

## Verification

- [ ] Typecheck, lint, database tests, and production build pass.
- [ ] Relevant admin, faculty, or student workflow checked in a browser.
- [ ] Secrets and generated firmware binaries are excluded.

For attendance changes, record the relevant checks: duplicate taps, ten-minute late boundary, closing absences, enrollment snapshot, or audited correction. For firmware changes, distinguish compilation and HTTP tests from an actual ESP32 + PN532 card read; list any hardware checks still pending.

## Database / deployment

List new migrations and any required environment changes. State whether preview testing used an isolated database. Leave this section empty if there are none.
