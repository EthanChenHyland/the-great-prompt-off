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

## Read-only challenge data API

`GET /api/challenge-data` reads seeded challenge metadata from Supabase with the server-only admin client. It returns the active challenge, report counts by split, sample report metadata, participant count, and answer key count. It does not return answer key contents.

If Supabase environment variables are missing, Supabase is unavailable, or the database has not been seeded, the route returns the same shape from local mock files with `source: "mock-file-fallback"` and a `fallbackReason`.

## Tables

- `participants`: Workshop identities and roles. The current participant ID maps to `participant_code`.
- `challenges`: Challenge configuration, instructions, output schema, locked model, active state, and submission limits.
- `reports`: Synthetic report text for each challenge, with `sample`, `public`, or `private` split.
- `answer_keys`: Structured adjudicated labels for each report.
- `prompt_runs`: One prompt execution against sample, public, or final/private reports.
- `prompt_run_items`: Per-report model output, parsed JSON, validation details, and score.
- `submissions`: Public and final submissions tied to prompt runs. Final submissions power the leaderboard.

## Replacing localStorage later

Today:

- `great-prompt-off-participant-id` stores the active participant ID.
- `great-prompt-off-submissions` stores local public/final submission history and leaderboard data.

Later:

- `participants` replaces the participant ID session/profile record.
- `prompt_runs` and `prompt_run_items` replace local sample run state.
- `submissions` replaces local public/final submission history.
- Final leaderboard rows should query `submissions` where `submission_type = 'final'`.

## Participant-facing vs admin-only

Participant-facing:

- Their own `participants` row.
- Their own `prompt_runs`.
- Their own `prompt_run_items`.
- Their own `submissions`.
- Sample reports for active challenges.
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
- `reports`: participants can read sample reports; public/private report access should happen only through server-controlled challenge flows.
- `answer_keys`: admin-only.
- `prompt_runs` and `prompt_run_items`: participants can access only their own records; admins can inspect all.
- `submissions`: participants can read their own submissions; admins can read all; final leaderboard should expose only safe aggregate fields.

No RLS policies are included yet. Add them when Supabase auth and real server-side access patterns are designed.
