# Supabase Schema Draft

This folder is a draft for the future database-backed version. The current app still uses local mock data and localStorage.

## Client setup

The app now has Supabase client helpers available for future work, but they are not wired into the current UI, API routes, scoring, or submission flow.

- `app/lib/supabase/browser.ts` creates a browser-safe client with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `app/lib/supabase/admin.ts` creates a server-only admin client with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Do not import the admin client from client components. The service role key must remain server-only.

## Seeding local mock data

After applying `supabase/schema.sql` to a Supabase project, seed the local mock challenge data with:

```bash
npm run seed:supabase
```

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The seed script loads `data/mock-report-manifest.json`, `data/mock-answer-keys.json`, and report text files from `public/mock-reports/`. It upserts one active challenge, all reports, all answer keys, and mock participants `P001` through `P050`, so it is safe to run more than once.

Current workshop split:

- Reports `001` through `005` are `public` and power the five counted Test Attempts.
- Reports `006` through `050` are `private` and are reserved for the hidden final set.
- The schema still allows the older `sample` split for compatibility, but the participant UI no longer exposes a separate Sample workflow.

After reseeding, verify the database split with:

```sql
select split, count(*) from reports group by split order by split;
```

Expected current result: `public = 5`, `private = 45`, and no active `sample` reports.

```sql
select filename, split from reports order by filename limit 10;
```

Expected current result: `synthetic_report_001.txt` through `synthetic_report_005.txt` are `public`; `synthetic_report_006.txt` onward are `private`.

## Read-only challenge data API

`GET /api/challenge-data` reads seeded challenge metadata from Supabase with the server-only admin client. It returns the active challenge, report counts by split, public test report metadata, participant count, and answer key count. It does not return answer key contents.

If Supabase environment variables are missing, Supabase is unavailable, or the database has not been seeded, the route returns the same shape from local mock files with `source: "mock-file-fallback"` and a `fallbackReason`.

## Submission APIs

The app has Supabase-backed submission routes for future database mode:

- `GET /api/submissions/status?participantCode=...`
- `POST /api/submissions/public`
- `POST /api/submissions/final`
- `GET /api/leaderboard`

These routes use the server-only service role client. Public/Test Attempt submissions can use real OpenRouter evaluation when `USE_REAL_LLM=true`; final submissions still use the mock scoring behavior for now. Successful Supabase-mode submissions create `prompt_runs` and `submissions` rows. If Supabase is unavailable or unseeded, the frontend falls back to the existing browser `localStorage` submission store.

## Tables

- `participants`: Workshop identities and roles. The current participant ID maps to `participant_code`.
- `challenges`: Challenge configuration, instructions, output schema, locked model, active state, and submission limits.
- `reports`: Synthetic report text for each challenge. The current participant workflow uses `public` for reports `001`-`005` and `private` for reports `006`-`050`; `sample` remains a legacy-compatible split value.
- `answer_keys`: Structured adjudicated labels for each report.
- `prompt_runs`: One prompt execution against public test or final/private reports.
- `prompt_run_items`: Per-report model output, parsed JSON, validation details, and score.
- `submissions`: Public and final submissions tied to prompt runs. Final submissions power the leaderboard.

## Replacing localStorage later

Today:

- `great-prompt-off-participant-id` stores the active participant ID.
- `great-prompt-off-submissions` stores local public/final submission history and leaderboard data.

Later:

- `participants` replaces the participant ID session/profile record.
- `prompt_runs` and `prompt_run_items` replace local test/final run state.
- `submissions` replaces local public/final submission history.
- Final leaderboard rows should query `submissions` where `submission_type = 'final'`.

## Participant-facing vs admin-only

Participant-facing:

- Their own `participants` row.
- Their own `prompt_runs`.
- Their own `prompt_run_items`.
- Their own `submissions`.
- Public test reports exposed through controlled API routes.
- Public/final scores exposed through controlled views or API routes.

Admin-only:

- Creating/updating `challenges`.
- Creating/updating `reports`.
- Reading/updating `answer_keys`.
- Managing participant roles.
- Inspecting all runs and submissions.

## Future Row Level Security notes

RLS should eventually protect:

- `participants`: participants can read/update only their own profile; admins can manage all.
- `reports`: participants can read public test reports; private report access should happen only through server-controlled final challenge flows.
- `answer_keys`: admin-only.
- `prompt_runs` and `prompt_run_items`: participants can access only their own records; admins can inspect all.
- `submissions`: participants can read their own submissions; admins can read all; final leaderboard should expose only safe aggregate fields.

No RLS policies are included yet. Add them when Supabase auth and real server-side access patterns are designed.
