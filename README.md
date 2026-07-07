# The Great Prompt-Off

The Great Prompt-Off is a Next.js/Supabase workshop app for testing prompts on synthetic, non-PHI knee MRI reports.

Participants write prompts, use counted Test Attempts on public reports, and submit one locked Final Submission on hidden reports. Organizers run the event from a protected admin dashboard.

## Start Here

- `PROJECT_ARCHITECTURE.md`: how the whole system works.
- `DEMO_CHECKLIST.md`: rehearsal and live event run-of-show checklist.
- `SUPABASE_MIGRATIONS_GUIDE.md`: beginner-friendly database/SQL migration guide.
- `REPORT_IMPORT_GUIDE.md`: how to add or import synthetic reports.
- `supabase/README.md`: Supabase schema, seeding, and admin/database notes.

## Main Routes

- `/`: participant access-code login.
- `/challenge`: participant workspace.
- `/admin`: organizer dashboard.
- `/admin/participants`: participant management.
- `/admin/results`: results and leaderboard monitoring.
- `/admin/cases`: admin-only Case Manager.
- `/admin/help`: concise organizer help.
- `/display/leaderboard`: projector leaderboard display.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` with the required local values. Do not commit real secrets.

Run the dev server:

```bash
npm run dev
```

Quality checks:

```bash
npm run test
npm run lint
npm run build
```

## Required Environment Variables

Server/Vercel:

```txt
USE_REAL_LLM=true
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_CONCURRENCY=3
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SECRET=
PARTICIPANT_SESSION_SECRET=
```

Keep these server-only values secret:

- `OPENROUTER_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
- `PARTICIPANT_SESSION_SECRET`

## Supabase Setup

For a fresh database:

1. Run `supabase/schema.sql`.
2. Run required migration SQL files documented in `SUPABASE_MIGRATIONS_GUIDE.md`.
3. Seed the database:

```bash
npm run seed:supabase
```

Before a live event, verify:

- active challenge exists
- participant/access-code count is correct
- public/private report counts are correct
- answer keys cover the reports
- reset RPC functions exist
- run/submission counts are zero after reset

Local report `.txt` files live in `seed-data/mock-reports/` for seeding and development fallback only. Do not put private/final report text under `public/`.

Use `DEMO_CHECKLIST.md` for the full rehearsal sequence.

## Deployment

For Vercel:

1. Set all required environment variables.
2. Redeploy after any environment variable change.
3. Log in to `/admin`.
4. Confirm Health Check values.
5. Run a participant smoke test.
6. Reset run/submission data before the real event.

## Security Boundaries

- Reports are synthetic and non-PHI.
- Participants should not see answer keys.
- Participants should not see private report text.
- Participants should not see raw final model outputs.
- Participants should not see access code lists.
- Admin-only routes require an admin session.
- OpenRouter and Supabase service-role calls happen server-side.

For the fuller data-flow and privacy explanation, read `PROJECT_ARCHITECTURE.md`.
