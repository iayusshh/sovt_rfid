# SOVT attendance project guidance

Read README.md, docs/research-attendance.md and .claude/context/rfid-attendance.md before changing behavior. Keep API and UI contracts aligned. Large independent changes use separate agent branches/worktrees and a shared append-only context; verify each phase before the next.

## Current contract

College class attendance only; no campus entry/exit or occupancy. Faculty explicitly opens/closes a course session. Reader is the faculty's Android phone: Chrome Web NFC on the class roster posts each serial to /api/sessions/:id/tap using the faculty session (iPhone Shortcuts could not read the ID; ESP32 firmware removed; /api/device/* reader-token endpoints remain). The owner's ID (MIFARE Classic 1K, 4-byte UID) was read by Chrome Web NFC on a Samsung phone; other cards/phones unverified, fallback is an NTAG sticker. docs/android-reader.md has the check. Snapshot active enrolled students on open; >=10 minutes is late. Closing marks pending roster absent. Duplicate card taps preserve original mark. Present+late divided by closed roster sessions; no denominator means null, no low-attendance alert. Below75% threshold uses the exact ratio. Corrections require a reason and audit history.

Authorization belongs in the server on every request. Admin manages records; faculty only assigned courses; student only self. Vercel hosts the Next.js UI and Node API; hosted Turso persists records. App role login and reader credentials enforce access. Reader keys are hashed, rotate immediately revokes them; reader event IDs provide exact replay responses. libSQL write batches keep open/snapshot and close/absent transitions atomic. Never confirm offline attendance. Runtime secrets remain untracked.

## Verification and release

Run meaningful fresh lifecycle/privacy/idempotency tests against synthetic data, TypeScript and production build, and rendered desktop/mobile checks. An HTTP test does not verify an NFC read on a real Android phone/ID. Keep docs/audit.md honest about live/local/physical boundaries. Update README and this file after verified behavior changes. Check current deployment before making deployment claims. Schema migrations are immutable once applied; append new migrations and update the generated journal.

## Deferred

Version2 only: student profile portal and combined parent/student email. No external notification integration in version1. Do not add generic CRUD/features outside the attendance workflow. Never add AI coauthor trailers to commits.

## Vercel migration

Read docs/research-vercel.md and .claude/context/vercel-collaboration.md. Production refuses local database files; local development uses a separate SQLite file. Never attach production secrets to previews. GitHub repository is private; owner manages teammate invitations. Old Sites source and data are an independent archived deployment, not a fallback API.

Run npm run typecheck, lint, test:database, build and the fresh lifecycle audit before release. Record actual hosted/browser outcomes in docs/audit.md. Physical validation passed once (one phone, one card); broader testing remains open.

## Verified Vercel delivery

Public HTTPS alias https://sovt-rfid.vercel.app passed 32 live API assertions and observed administrator/student browser flows. Three database tests, types/lint/build and clean GitHub CI passed. Turso credentials exist only in production; previews/development have no production secrets. Setup token is removed after bootstrap. Private GitHub origin and Vercel Git connection are configured. Owner adds collaborators manually; no invites were sent.
