# Before the Click

Before the Click is a human approval and verified-action platform for AI-assisted work.

**Production:** https://before-the-click.vercel.app
**Stack:** Next.js 15, React 19, TypeScript, App-managed username accounts, Postgres RLS, Supabase Storage, Gemini, Vercel.

## Live product paths

- / — landing page
- /login — username signup, password sign-in and code-based recovery
- /console — authenticated workflow dashboard
- /guide — process documentation
- /auth/callback — redirects legacy sign-in links
- /auth/reset — password reset
- /join — reviewer invitations

Previous workspace, review and studio URLs redirect to the authenticated application.

## Real workflows

1. Create a workspace and invite reviewers.
2. Write a proposal, or use optional Gemini drafting and edit its exact content.
3. Submit an immutable version to ordered reviewers.
4. Approve, reject or request changes. A revision always resets previous approvals.
5. Apply administrator policies separately from the AI.
6. Execute the approved action on the server, then verify and audit it.

Approved workspace-record actions are stored in Supabase and read back before reporting success. Private team documents use a membership-restricted bucket. Google Gmail, Calendar and Drive connectors contain real OAuth and API execution paths, but REQUIRE Google Cloud OAuth credentials, user consent, scoped access and separate end-to-end verification before being considered operational.

## Environment

Copy `.env.example` to `.env.local` and configure the settings. Keep secrets out of Git. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public. `BTC_SERVER_SECRET` is server-only and must match the singleton in `btc_private.server_configuration`. Generate and provision that value privately for a new database.

- Drafting uses `GEMINI_API_KEY` on the server. `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` enable a fallback. The default is `openrouter/free`. An optional `:free` model must support structured output and the configured provider data policy.
- Google OAuth requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in Vercel. Register `https://before-the-click.vercel.app/api/integrations/google/callback` with the OAuth client. Enable the Gmail, Calendar and Drive APIs in its Google Cloud project.
- The application owns username accounts, stores salted password hashes and hashed session tokens in private Postgres tables, and issues HTTP-only session cookies. Users save their recovery code at signup. Recovery rotates the code and revokes older sessions. Deploy `supabase/functions/btc-data` with gateway JWT checks disabled. The function authenticates each server request with a short-lived HMAC and applies existing RLS under the account UUID. Supabase Auth and SMTP are unnecessary.
- Redeploy Vercel after adding production environment variables.

## Run and test

Requires Node.js 22.x. Run npm ci, npm run dev, npm test, npm run typecheck, and npm run build.

The SQL under `supabase/migrations` matches the applied migration versions in the dedicated Supabase project. It includes governance, published records, private attachments, and administrator file removal. Apply in order for a new deployment. The migration files do not contain the signing secret.

See [Release verification](docs/release-verification.md) for the checks run against the production database and the external setup still required.

## Security

Authenticated routes protect personal data. SQL row-level security isolates workspaces. Sensitive credentials are encrypted in a private database schema. Each execution is guarded by a policy-checked, version-matched database claim. A provider result that cannot be independently verified is not recorded as completed; do not automatically retry ambiguous external actions.
