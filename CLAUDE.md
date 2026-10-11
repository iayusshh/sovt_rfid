# SOVT attendance project guidance

Read README.md, docs/research-attendance.md and .claude/context/rfid-attendance.md before changing behavior. Keep API and UI contracts aligned. Large independent changes use separate agent branches/worktrees and a shared append-only context; verify each phase before the next.

## Current contract

College class attendance only; no campus entry/exit or occupancy. Faculty explicitly opens/closes a course session. ESP32+PN532 Type A 13.56MHz Wi-Fi reader; iPhone dashboard only. Snapshot active enrolled students on open; >=10 minutes is late. Closing marks pending roster absent. Duplicate card taps preserve original mark. Present+late divided by closed roster sessions; no denominator means null, no low-attendance alert. Below75% threshold uses the exact ratio. Corrections require a reason and audit history.

Authorization belongs in the server on every request. Admin manages records; faculty only assigned courses; student only self. Keep Sites outer private sign-in/service access and application role login distinct. Reader keys are hashed, rotate immediately revokes them; reader event IDs provide exact replay responses. D1 batches keep open/snapshot and close/absent transitions atomic. Never confirm offline attendance. Runtime secrets and completed firmware credentials remain untracked.

## Verification and release

Run meaningful fresh lifecycle/privacy/idempotency tests against synthetic data, TypeScript and production build, and rendered desktop/mobile checks. Firmware compile is necessary but does not verify RF or real hardware. Keep docs/audit.md honest about live/local/physical boundaries. Update README and this file after verified behavior changes. Check current deployment before making deployment claims. Schema migrations are immutable once applied; append new migrations and update the generated journal.

## Deferred

Version2 only: student profile portal and combined parent/student email. No external notification integration in version1. Do not add generic CRUD/features outside the attendance workflow. Never add AI coauthor trailers to commits.
