# Vercel migration research

The requested target moves both the UI and attendance API to Vercel. Source collaboration means a private GitHub repository where the owner adds teammates; no invitations are sent automatically.

## Findings
- Vercel CLI is authenticated as iayusshh in Ayush Anand's projects. GitHub CLI is authenticated with repository permissions.
- Next.js App Router Route Handlers run the existing request/response API on the Node.js runtime. Cloudflare-specific imports must be removed from its runtime dependency graph.
- Turso's Vercel marketplace offers a Starter database at $0/month, with Mumbai (bom1) available. The existing SQLite schema and parameterized queries can be retained using the supported libSQL client.
- libSQL batch with write mode executes statements in a transaction. Preserve the original atomic scan/session-close batches; do not replace them with separate requests.
- DATABASE credentials remain server-side Vercel environment variables. Preview deployments must not share production write credentials.
- The old Sites deployment remains a separate snapshot, not a fallback API. Fresh synthetic seed on the new database is acceptable; old demonstration records are not migrated.

## Sources
- https://docs.turso.tech/sdk/ts/reference (client, local files, batch transactions)
- https://vercel.com/docs/projects/deploy-from-cli
- https://vercel.com/docs/cli/env
- https://nextjs.org/docs/app/guides/backend-for-frontend
- Authenticated Vercel CLI marketplace help: tursocloud/database, starter, bom1.

## FAQ
**Does Vercel proxy the old backend?** No. The application API executes on Vercel and connects to a separate hosted database.
**Can teammates edit it?** Yes, once the owner invites them to the private GitHub repository. Pull requests are the review path.
**Are reader credentials in GitHub?** No. Configure them locally and keep secrets in ignored environment files.
**Are previews safe to test?** They need an isolated database and secrets; production credentials are never attached to previews.
**Does this prove physical NFC works?** No. Reading a real ID on an iPhone still needs the probe in docs/iphone-reader.md.
