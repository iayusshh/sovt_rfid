# Vercel + GitHub collaboration

Target: Next.js UI + Node attendance API on Vercel, hosted Turso SQLite-compatible database, private GitHub repo. Owner will invite collaborators himself. Retain existing UI and attendance authorization/atomic invariants. No proxy to Cloudflare. Read docs/research-vercel.md before edits.

Each worker uses its own branch/worktree; don't revert others. Shared context location is /Users/iayusshh/Projects/sovt_rfid/.claude/context/vercel-collaboration.md; append concise progress here.

Ownership: backend worker lib/attendance-api.ts and new lib/database.ts + database migration runner/tests. Collaboration worker .github and CONTRIBUTING.md only. Root package/runtime/deploy/docs/integration and verification.
