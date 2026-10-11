# Working together on SOVT Attendance

The repository contains the college attendance website, its Vercel API, and ESP32 + PN532 firmware. Keep the role boundaries and attendance rules in [README.md](README.md) intact when changing a workflow.

## Join and make a change

The repository owner invites teammates under **GitHub → repository Settings → Collaborators → Add people**, with write access for contributors. Accept the invitation, clone the repository, and create a branch from `main`:

```sh
git switch main
git pull --ff-only
git switch -c feature/your-change
npm ci
```

Open a pull request after pushing your branch. Describe what changes for the faculty or student, and include the verification results. Have another teammate review authentication, attendance transactions, or schema changes before merging. Avoid editing the same files simultaneously; agree on ownership of the UI, API/database, and firmware for larger work.

## Run a separate demo locally

Use Node.js 22.13 or newer. Copy `.env.example` to the ignored `.env.local` and set `DATABASE_URL` to a local SQLite file, for example `file:./.local/attendance.db`. Create the parent directory first. A private development Turso database is also supported using its URL and `DATABASE_AUTH_TOKEN`.

Set fresh setup and reader tokens and a demo password. Do not use the deployed database or credentials for development.

```sh
mkdir -p .local
npm run db:migrate
npm run dev
```

In another terminal, run `npm run demo:seed`, then open `http://localhost:3000`. The synthetic demo has ten students and two faculty; use the simulator when you do not have a physical reader.

Before opening a pull request:

```sh
npm run typecheck
npm run lint
npm run test:database
npm run build
```

Database tests exercise a disposable SQLite database. A successful API or simulator test does not prove that the reader scanned an RFID card. Firmware contributors follow [the hardware guide](docs/hardware.md), compile with the pinned PlatformIO dependencies, and record board/card checks separately.

## Preserve attendance records

Append a new migration when changing the schema; never rewrite an applied migration. Opening a session snapshots its active enrollment. A first tap determines present or late, duplicate taps preserve that mark, and closing fills missing roster entries as absent. Keep these operations transactional. Manual corrections require a reason and an audit entry. Test role access whenever an API response changes.

## Keep credentials out of source

Environment files, local databases, `.demo-credentials.md`, and completed `firmware/include/secrets.h` belong only on your machine or in the owner's deployment settings. Commit example placeholders, never passwords, database tokens, setup tokens, or reader credentials. Do not publish compiled firmware containing credentials. If a secret is accidentally committed, rotate it immediately; deleting the file in a later commit does not remove it from history.

## Preview and production access

GitHub write access and Vercel project access are separate. The owner manages any Vercel team invitations and deployment permissions. Preview deployments need their own database and secrets; do not attach production write credentials to previews. Merging code is not evidence that the deployed attendance workflow or physical reader has been verified. Record the production checks after a release.
