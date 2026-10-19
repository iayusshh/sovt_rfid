# SOVT RFID Attendance

A college attendance application with admin, faculty, and student accounts, a persistent database, and an Android phone as the card reader: the class roster page uses Web NFC in Chrome to read the college ID's NFC serial number and records attendance. No app is needed. Whether a given college ID is readable must be checked first ([setup guide](docs/android-reader.md)). An iPhone could not read the owner's ID through Shortcuts and was dropped. Sample students are fictional.

## What works in version 1

- Admin: create/edit/deactivate students, assign card UIDs (including one click from the Unassigned cards list of recent unregistered taps), create faculty and courses, manage enrollment, provision/disable readers, rotate reader credentials.
- Faculty: open assigned course sessions, pass the reader around, monitor the live roster, close sessions, and correct marks with an audit reason.
- Students: view their own attendance and download their own records.
- Monitoring: live scan outcomes, reader heartbeats, duplicate protection, closed-session attendance percentages, below-75% alerts, and downloadable CSV reports.
- Android reader: the browser posts each serial to `/api/sessions/:id/tap` as the signed-in faculty; the server normalizes `aa:bb:..` serials, answers with a clear outcome, and never confirms offline taps. `/api/device/*` reader-token endpoints remain for dedicated readers.

A session snapshots the enrolled active students when opened. A scan within ten minutes is present; at or after ten minutes it is late. Present and late both count as attended. Closing marks everyone still missing absent. Only completed session rosters count toward the percentage. A repeated tap preserves the first mark. Changed enrollment does not rewrite past rosters. Manual corrections retain actor, before/after status, and reason.

## Hosted demonstration

Live app: https://sovt-rfid.vercel.app

Vercel project `sovt-rfid`, with both the Next.js website and attendance API running on Vercel. Persistence is a separate hosted Turso database. The migration does not proxy requests to the old Sites app. The original Sites source remains on `archive/sites-deployment`; its database and test records are independent.

Source: [private GitHub repository](https://github.com/iayusshh/sovt_rfid). The owner adds teammates under **Settings → Collaborators**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and review workflow. GitHub Actions runs checks on pull requests. Teammates need their own development database; preview deployments never receive production database credentials.

Demo accounts:

| Role | Email |
|---|---|
| Admin | admin@demo.sovt.test |
| Faculty 1 | faculty1@demo.sovt.test |
| Faculty 2 | faculty2@demo.sovt.test |
| Student | student01@demo.sovt.test through student10@demo.sovt.test |

The password is supplied in the ignored local `.demo-credentials.md` file; it is never bundled into the website or committed. The deployed database is separate from the local database. The hosting acceptance session is explicitly labeled as an HTTP check of synthetic cards, not a physical card read.

## Local setup

Node.js 24 and npm are required. Install with `npm ci`. Copy `.env.example` to `.env.local`, replace tokens/password, and keep the `file:./.local/attendance.db` URL for local development. Create `.local` before migration. `DEMO_READER_TOKEN` must be 64 lowercase hexadecimal characters; the demo password must contain 10–128 characters.

```sh
mkdir -p .local
npm run db:migrate
npm run dev
# In another terminal:
npm run demo:seed
```

Open http://localhost:3000. The migration runner tracks checksums and is safe to repeat. Seed creates ten synthetic students, two faculty, two courses and one reader; it preserves existing demo records. `npm run build` and `npm start` run the production Node build. Database records persist across application restarts. Production rejects local database files and requires `TURSO_DATABASE_URL` plus `TURSO_AUTH_TOKEN` in Vercel's production environment.

The setup endpoint requires the secret `SETUP_TOKEN`. Remove that environment variable after provisioning to disable further bootstrap access. Keep database and device credentials server-side or in ignored local files. Never commit `.env.local`, `.dev.vars`or reader tokens.

## Demonstration sequence

1. Sign in as admin. Review Students, Courses and enrollment. Replace a student's synthetic UID with a discovered physical card UID when hardware is available.
2. Create a reader (the class's scanner) or use the demo reader, and check your ID with [the Android reader guide](docs/android-reader.md) first.
3. Sign in as Faculty 1 and open a Database Systems session on that reader.
4. Tap an enrolled card. The roster updates every three seconds. For a hardware-free demonstration, use the clearly labeled **Synthetic scan simulator**; its marks retain `simulated` as their source.
5. Retap the same card to observe duplicate preservation; try an unregistered card to observe rejection.
6. Close the session, inspect absent marks, make a correction with a reason, and download CSV.
7. Sign in as a student to see only that student's records. Review below-75% attention and audit history as admin.

## Verification and limitations

See [independent audit](docs/audit.md) for the fresh executed results. Local API lifecycle/security, restart persistence, exact late boundary and actual late HTTP behavior were verified independently. TypeScript, production build, browser session workflow were checked (the original ESP32 firmware build is no longer in this repo). Reading the owner's college ID with one Samsung Android phone in Chrome was observed working on 19 October 2026; other phones/cards are unverified. See [docs/android-reader.md](docs/android-reader.md). An HTTP submission is not proof of an NFC read.

Dedicated hardware readers authenticate with a reader bearer token; the phone uses the faculty's session. This repo contains no actual credentials in tracked source. Without network access the phone shows "Not recorded"; retap online, checking the roster if a response was lost. Faculty can repair attendance with an audited reason.

This assignment identifies students by a card UID. It does not prevent card lending or UID cloning. Use authenticated cards and stronger identity checks if extending it beyond an assignment demonstration.

Run the destructive synthetic-data audit only against a disposable/local demonstration:

```sh
AUDIT_URL=http://localhost:3000 DEMO_PASSWORD='<configured password>' node tests/independent-audit.mjs
npm run typecheck
npm run lint
npm run test:database
npm run build
```

It creates clearly named test students/courses/readers and does not erase historical records. Never run it against real college records. The test reads secrets from the environment; do not put real credentials into shell history. An ignored environment file or stdin-driven wrapper is preferable.

## Version 2

Student profile and management portal, parent contact details, and a single action to email the student and parent together. External messaging is intentionally not implemented in version 1.

## Source map

- `app/page.tsx`, `app/globals.css`: role-aware responsive workspace.
- `app/api/[...path]/route.ts`, `lib/attendance-api.ts`: authenticated API and attendance transactions.
- `db/schema.ts`, `drizzle/`: versioned SQLite-compatible schema and migration.
- `app/nfc-scanner.tsx`, `docs/android-reader.md`, `docs/research-android-web-nfc.md`: Web NFC reader, setup and research.
- `docs/research-attendance.md`, `.claude/context/rfid-attendance.md`: decisions and API contract.
- `tests/independent-audit.mjs`, `docs/audit.md`: independent verification.

For read-only hosted release checks, run `ATTENDANCE_URL=https://sovt-rfid.vercel.app node --env-file=.env.local scripts/smoke-vercel.mjs`.

Future schema changes append migrations. Do not rewrite an applied migration. Deployment uses Vercel with GitHub source. Main is production; pull requests are reviewed before merging. Provision an isolated database before enabling writable previews.

### Delivery status — 11 October 2026

Vercel production deployment succeeded. All 32 fresh hosted API lifecycle/privacy checks, three database tests, TypeScript, lint, Next.js build, and GitHub Actions passed. Live administrator login and synthetic card attendance were observed in the browser. See docs/audit.md for scope and evidence. A real Samsung Android phone in Chrome read the owner's college ID (MIFARE Classic 1K) on the live site: unregistered tap, assignment, present, and duplicate preservation were observed on 19 October 2026. Other phones, cards and a full class remain untested.
