# Before the Click

Before the Click is a human approval and verified-action platform for AI-assisted work.

**Production:** https://before-the-click.vercel.app
**Stack:** Next.js 15, React 19, TypeScript, Supabase Auth, Postgres RLS, Supabase Storage, Gemini, Vercel.

## Live product paths

- / — landing page
- /login — signup, login, password recovery
- /console — authenticated workflow dashboard
- /guide — process documentation
- /auth/callback — sign-up verification
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

Copy .env.example to .env.local and configure the settings; never commit secrets. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are public. BTC_SERVER_SECRET is server-only and must match the secret configured in the dedicated Supabase database. GEMINI_API_KEY is optional and server-only. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI are required for Google integrations.

## Run and test

Requires Node.js 22.x. Run npm ci, npm run dev, npm test, npm run typecheck, and npm run build.

The Supabase project already has existing governance and workspace_records migrations. The private-attachments migration is checked into supabase/migrations. Preserve those existing database objects during deploys.

The eight existing regression tests cover the original deterministic workflow logic. A successful build does not establish that external Google actions or email verification have been tested. Each Google integration must be verified with authorized test accounts before being advertised as available.

## Security

Authenticated routes protect personal data. SQL row-level security isolates workspaces. Sensitive credentials are encrypted in a private database schema. Each execution is guarded by a policy-checked, version-matched database claim. A provider result that cannot be independently verified is not recorded as completed; do not automatically retry ambiguous external actions.
