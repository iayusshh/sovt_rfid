# Vercel + GitHub collaboration

Target: Next.js UI + Node attendance API on Vercel, hosted Turso SQLite-compatible database, private GitHub repo. Owner will invite collaborators himself. Retain existing UI and attendance authorization/atomic invariants. No proxy to Cloudflare. Read docs/research-vercel.md before edits.

Each worker uses its own branch/worktree; don't revert others. Shared context location is /Users/iayusshh/Projects/sovt_rfid/.claude/context/vercel-collaboration.md; append concise progress here.

Ownership: backend worker lib/attendance-api.ts and new lib/database.ts + database migration runner/tests. Collaboration worker .github and CONTRIBUTING.md only. Root package/runtime/deploy/docs/integration and verification.

Collaboration worker: added project-specific contributor guide, compact PR template, and GitHub CI for Node 22 install/typecheck/lint/database tests/build. No collaborator invitations or deployment secrets included. CI depends on root providing typecheck and test:database scripts; guide refers to root README for migration/seed commands.

Backend worker: replaced Cloudflare runtime binding with lazy hosted libSQL client and the existing parameterized statement operations. All multi-statement attendance writes retain write transactions. Production refuses local-file URLs; hosted URLs require auth token. Setup configuration uses process.env and login throttling uses Vercel's trusted forwarding header. Checked migration runner applies schema + checksum record atomically, detects changed applied migrations, and safely skips existing migrations. Three focused tests pass (migration repeatability/checksum/failure rollback, FK/write rollback/first/all/exact late boundary, production guard); owned files also pass ESLint and strict Node-only TypeScript. Test entry is tests/database.test.mjs.

Root integration verification: Next.js Node build/types/lint pass; three focused libSQL tests pass; fresh 32 API assertions pass local and hosted. Independent auditor found contributor env-name mismatch, corrected. GitHub CI 38152136009 succeeded. Live admin browser open/simulate/close showed one present and nine absent; student view scoped correctly. Turso connected to production only; setup token removed post-seed. GitHub repo private, Git connection enabled; owner handles collaborator invitations. Final Git deployment/persistence smoke pending.
