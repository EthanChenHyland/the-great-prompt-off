# Demo Checklist

Use this checklist before a live workshop deployment.

## Vercel Environment

Set these environment variables in Vercel, then redeploy the project:

- `USE_REAL_LLM=true`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL=google/gemini-2.5-flash`
- `OPENROUTER_CONCURRENCY=3`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
- `PARTICIPANT_SESSION_SECRET` if using a dedicated participant-session signing secret

Vercel environment variable changes do not affect an existing deployment until the app is redeployed.

## Supabase Setup

- Run the base schema in `supabase/schema.sql` if this is a fresh database.
- Run `supabase/access-code-migration.sql` if updating older long access codes.
- Run `supabase/admin-v1-5-migration.sql` if `email` / `is_active` are missing.
- Run `supabase/admin-atomic-clears.sql` so admin clear/reset operations use transaction-safe RPC functions.
- Run `npm run seed:supabase` after the schema/migrations are ready.

Verify report splits:

```sql
select split, count(*) from reports group by split order by split;
```

Expected:

- `public = 5`
- `private = 45`

Verify the first reports:

```sql
select filename, split from reports order by filename limit 10;
```

Expected: `synthetic_report_001.txt` through `synthetic_report_005.txt` are `public`; `synthetic_report_006.txt` onward are `private`.

Verify atomic admin-clear RPC functions exist:

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

Expected:

- `admin_clear_participant_run_data`
- `admin_reset_workshop_run_data`

If this query returns no rows, `supabase/admin-atomic-clears.sql` may not have been run in the correct Supabase project/database.

## Admin Readiness

Log in to `/admin` with `ADMIN_SECRET`.

Before the event, the Health Check panel should show:

- Supabase connected: `Yes`
- `USE_REAL_LLM`: `true`
- OpenRouter model: `google/gemini-2.5-flash`
- Report split: `5 public / 45 private`
- Participants: `50`
- Test submissions: `0`
- Final submissions: `0`
- Latest run: `-`

## Access Codes

Export participant access codes from `/admin`, or run:

```sql
select participant_code, display_name, access_code
from participants
order by participant_code;
```

Distribute only each participant's assigned access code. Participants should not receive the full export.

## Participant Smoke Test

- Log in as one participant using an access code.
- Run one Test Attempt.
- Confirm the result shows safe aggregate feedback and per-report numeric scores for public reports only.
- Run one Final Submission only if you are intentionally testing final evaluation.
- Confirm final feedback is aggregate-only and does not show private report details or answer keys.
- Check OpenRouter usage/cost after the test.

Warning: one Final Submission evaluates 45 hidden reports and uses about 45 OpenRouter calls. With `OPENROUTER_CONCURRENCY=3`, those calls are limited to three concurrent requests.

Real LLM failures should return a readable error and should not count/store a final submission.

## Before The Real Event

- In `/admin`, reset workshop run data by typing `RESET`.
- Confirm participants and access codes remain.
- Confirm Test submissions and Final submissions return to `0`.
- Confirm Latest run returns to `-`.

The reset should delete only:

- `prompt_run_items`
- `submissions`
- `prompt_runs`

The reset should preserve:

- participants
- access codes
- reports
- answer keys
- challenges

## Post-Event

Use `/admin` to export:

- Access codes CSV if needed for records
- Results CSV for final scoring/archive

## Troubleshooting

- Vercel env var changes require a redeploy.
- OpenRouter concurrency is controlled by `OPENROUTER_CONCURRENCY`.
- If real LLM evaluation fails, final submissions should not be counted or stored.
- If RPC verification returns no rows, run `supabase/admin-atomic-clears.sql` in the intended Supabase project/database.
- If Health Check shows unexpected report counts, reseed Supabase and rerun the split verification SQL.
