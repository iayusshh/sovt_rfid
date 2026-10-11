# SOVT RFID Attendance

A college attendance application with admin, faculty, and student accounts, a persistent database, and a portable ESP32 + PN532 Wi-Fi reader. The iPhone runs the faculty dashboard; it does not scan cards. Sample students are fictional.

## What works in version 1

- Admin: create/edit/deactivate students, assign card UIDs, create faculty and courses, manage enrollment, provision/disable readers, rotate reader credentials.
- Faculty: open assigned course sessions, pass the reader around, monitor the live roster, close sessions, and correct marks with an audit reason.
- Students: view their own attendance and download their own records.
- Monitoring: live scan outcomes, reader heartbeats, duplicate protection, closed-session attendance percentages, below-75% alerts, and downloadable CSV reports.
- Reader firmware: Type A 13.56 MHz UID reading, authenticated HTTPS, NTP and trusted root certificates, LED feedback, and stable transport retry IDs. No offline queue or false success indicator.

A session snapshots the enrolled active students when opened. A scan within ten minutes is present; at or after ten minutes it is late. Present and late both count as attended. Closing marks everyone still missing absent. Only completed session rosters count toward the percentage. A repeated tap preserves the first mark. Changed enrollment does not rewrite past rosters. Manual corrections retain actor, before/after status, and reason.

## Hosted demonstration

Site: https://sovt-attendance.iayusshh.chatgpt.site

The Site stays **owner-private**. Sign in with the owning ChatGPT account first, then use an application demo account. This outer access boundary is preserved for the assignment demo; granting other faculty/students access is a separate hosting-access change. A physical reader uses both the Sites service bearer and its own reader bearer. Device credentials do not grant a user account.

Demo accounts:

| Role | Email |
|---|---|
| Admin | admin@demo.sovt.test |
| Faculty 1 | faculty1@demo.sovt.test |
| Faculty 2 | faculty2@demo.sovt.test |
| Student | student01@demo.sovt.test through student10@demo.sovt.test |

The password is supplied in the ignored local `.demo-credentials.md` file; it is never bundled into the website or committed. The deployed database is separate from the local database. The hosting acceptance session is explicitly labeled as an HTTP check of synthetic cards, not a physical card read.

## Local setup

Node.js 22.13+ and npm are required. Install dependencies with `npm ci`. Copy `.env.example` to `.dev.vars` and replace its values. Generate tokens with a cryptographic random generator; `DEMO_READER_TOKEN` must be 64 lowercase hexadecimal characters. Use a password of 10–128 characters.

```sh
npm run db:generate  # only after a deliberate schema change
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_bumpy_tana_nile.sql
npm run dev
```

Apply the migration only once on a new local database; it is already applied in this checkout. In another terminal, run `node scripts/bootstrap-demo.mjs`. It creates the 10 students, 2 faculty, two courses, and reader without creating historical attendance. Repeated bootstrap preserves existing records. Open the printed local preview URL, then sign in with the configured demo password. Browser-local storage is not the attendance database.

Use `npm start` to preview the built Worker. It shares the persistent local D1 state with development. Secrets stay in ignored `.dev.vars`; hosted secrets are configured through Sites runtime settings. Do not commit completed firmware `secrets.h` or publish firmware binaries containing secrets.

## Demonstration sequence

1. Sign in as admin. Review Students, Courses and enrollment. Replace a student's synthetic UID with a discovered physical card UID when hardware is available.
2. Provision a reader or use the demo reader with its configured key. Follow [the hardware guide](docs/hardware.md), including discovery mode and the private Sites service credential.
3. Sign in as Faculty 1 and open a Database Systems session on that reader.
4. Tap an enrolled card. The roster updates every three seconds. For a hardware-free demonstration, use the clearly labeled **Synthetic scan simulator**; its marks retain `simulated` as their source.
5. Retap the same card to observe duplicate preservation; try an unregistered card to observe rejection.
6. Close the session, inspect absent marks, make a correction with a reason, and download CSV.
7. Sign in as a student to see only that student's records. Review below-75% attention and audit history as admin.

## Verification and limitations

See [independent audit](docs/audit.md) for the fresh executed results. Local API lifecycle/security, restart persistence, exact late boundary and actual late HTTP behavior were verified independently. TypeScript, production build, browser session workflow, and firmware compilation were checked. Physical board/card, wiring, LED, Wi-Fi/TLS operation on the board, and compatibility with your existing college ID require hardware acceptance using the checklist in [docs/hardware.md](docs/hardware.md). A compiled firmware or an HTTP submission is not proof of an RF read.

The private Site service token must be provisioned securely to the reader. This repo intentionally has no actual credentials in tracked source. Without network access the reader reports failure; remove the card and retap online, checking the roster if a response was lost. Faculty can repair attendance with an audited reason.

This assignment identifies students by a card UID. It does not prevent card lending or UID cloning. Use authenticated cards and stronger identity checks if extending it beyond an assignment demonstration.

Run the destructive synthetic-data audit only against a disposable/local demonstration:

```sh
AUDIT_URL=http://127.0.0.1:5173 DEMO_PASSWORD='<configured password>' node tests/independent-audit.mjs
npx tsc --noEmit
npm run build
```

It creates clearly named test students/courses/readers and does not erase historical records. Never run it against real college records. The test reads secrets from the environment; do not put real credentials into shell history. An ignored environment file or stdin-driven wrapper is preferable.

## Version 2

Student profile and management portal, parent contact details, and a single action to email the student and parent together. External messaging is intentionally not implemented in version 1.

## Source map

- `app/page.tsx`, `app/globals.css`: role-aware responsive workspace.
- `app/api/[...path]/route.ts`, `lib/attendance-api.ts`: authenticated API and attendance transactions.
- `db/schema.ts`, `drizzle/`: versioned D1 schema and migration.
- `firmware/`: PlatformIO ESP32 firmware with secure configuration example.
- `docs/research-attendance.md`, `.claude/context/rfid-attendance.md`: decisions and API contract.
- `tests/independent-audit.mjs`, `docs/audit.md`: independent verification.

Future schema changes append migrations. Do not rewrite an applied migration. Deployment uses the installed Sites workflow to push exact source, package the matching build, and publish that saved version.
