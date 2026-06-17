# The Great Prompt-Off

A workshop platform for prompt-engineering practice on synthetic knee MRI reports. Participants write extraction prompts, test them against public reports, and submit one final prompt against hidden reports. Organizers manage participants, exports, and event readiness from a protected admin dashboard.

## Participant Workflow

- Participants enter a unique access code on the home page.
- After login, the app displays the friendly participant code, such as `P001`.
- The challenge workspace shows public test reports `001` through `005`.
- Each participant gets 5 counted Test Attempts on those same 5 public reports.
- Participants use sanitized feedback to refine their prompt.
- Each participant gets one Final Submission against private reports `006` through `050`.
- Final feedback is aggregate-only and does not reveal private report text, answer keys, or per-report private details.

## Admin Workflow

Organizers use `/admin` and log in with `ADMIN_SECRET`.

Admin pages:

- `/admin` = command center, Health Check / Admin readiness, overview cards, exports, reset.
- `/admin/participants` = participant management.
- `/admin/results` = results and leaderboard.
- `/admin/cases` = live Case Manager.
- `/admin/help` = organizer help and documentation notes.

`/admin` auto-refreshes every 30 seconds, and `/admin/results` auto-refreshes
every 15 seconds for event monitoring. Monitoring pages include a secondary
Refresh now control. Participant and Case Manager pages use manual refresh only
so organizer edits are not interrupted. Secondary admin pages include a back
button and page navigation links.

The admin tools include:

- CSV export for access codes.
- CSV export for results.
- Edit participant `display_name` and `email`.
- Regenerate one participant access code.
- Activate/deactivate one participant.
- Clear one participant's run/submission data.
- Reset all workshop run/submission data.
- Live Case Manager for admin-only report/answer-key create, view, edit, and safe delete.

The reset tools preserve participants, access codes, reports, answer keys, and challenges. Atomic reset/clear RPC functions are defined in `supabase/admin-atomic-clears.sql`.

The Case Manager is convenient for small live fixes. File-based import via `REPORT_IMPORT_GUIDE.md` remains safer for bulk changes. Deleting cases with run history is blocked so prior results are not silently damaged.

## AI Pipeline

1. The participant writes a prompt in `app/components/ChallengeWorkspace.tsx`.
2. Test Attempts post to `app/api/submissions/public/route.ts`.
3. Final Submissions post to `app/api/submissions/final/route.ts`.
4. The shared workflow in `app/lib/supabase/submission-workflow.ts` selects the report split:
   - `public` for Test Attempts
   - `private` for Final Submissions
5. If `USE_REAL_LLM=true`, the server calls OpenRouter from `app/lib/openrouter.ts`.
6. The model receives the participant prompt and one synthetic report at a time.
7. The model output is scored by `app/lib/scoring.ts`.
8. Scores and raw outputs are stored in Supabase.

Default production model:

```txt
google/gemini-2.5-flash
```

The app intentionally does not add hidden extraction rescue prompts and does not force JSON response format. Good prompts should ask the model to return JSON with these fields:

- `acl_tear`
- `mcl_injury`
- `meniscus_tear`
- `fracture`
- `osteoarthritis`
- `effusion`

Allowed values:

- `present`
- `absent`
- `uncertain`

## Required Environment Variables

Vercel/server:

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

`PARTICIPANT_SESSION_SECRET` is optional if the code is configured to fall back to another secret, but a dedicated value is recommended for production.

Never expose `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `ADMIN_SECRET` to client-side code.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` with the required values.

Run the dev server:

```bash
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

## Supabase Setup

For a fresh database:

1. Run `supabase/schema.sql`.
2. Run `supabase/access-code-migration.sql` if updating old access codes.
3. Run `supabase/admin-v1-5-migration.sql` if `email` / `is_active` are missing.
4. Run `supabase/admin-atomic-clears.sql`.
5. Seed data:

```bash
npm run seed:supabase
```

Verify report splits:

```sql
select split, count(*) from reports group by split order by split;
```

Expected: `public = 5`, `private = 45`.

Verify atomic clear RPC functions:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'admin_clear_participant_run_data',
    'admin_reset_workshop_run_data'
  )
order by routine_name;
```

## Vercel Deployment

- Set all required env vars in Vercel.
- Redeploy after changing env vars.
- Confirm `/admin` loads and Health Check shows expected values.
- Run one participant smoke test before the event.

## Pre-Event Checks

Use `DEMO_CHECKLIST.md` for the event-focused checklist.

At minimum:

- Health Check shows Supabase connected.
- `USE_REAL_LLM=true`.
- Model is `google/gemini-2.5-flash`.
- Report split is `5 public / 45 private`.
- Participant count is `50`.
- Test submissions and Final submissions are `0`.
- Access codes are exported and distributed.

## Post-Event Exports

From `/admin`:

- Export access codes CSV if needed for records.
- Export results CSV for scoring/archive.

For detailed review, use `/admin/results`.

## Security Notes

- Participant login uses access codes, not email/password auth.
- Admin access uses `ADMIN_SECRET` and an HTTP-only admin session cookie.
- OpenRouter and Supabase service-role secrets are used server-side only.
- Participants do not receive answer keys, private report text, private per-report feedback, or raw private comparisons.
- Admins can edit cases live under `/admin/cases`, but participants never receive answer keys or private report text.
- File-based report import remains supported and is safer for bulk updates; see `REPORT_IMPORT_GUIDE.md`.
