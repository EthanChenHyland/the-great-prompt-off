# Supabase Notes

This folder contains the database schema, migrations, and seed workflow for the Supabase-backed version of The Great Prompt-Off. For the overall system explanation, read `PROJECT_ARCHITECTURE.md`. For live event steps, read `DEMO_CHECKLIST.md`.

## Client setup

The app has two Supabase client helpers:

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
- `ADMIN_SECRET` protects `/admin` and admin-only API routes. Use a strong value locally and in Vercel; do not commit a real secret.
- `PARTICIPANT_SESSION_SECRET` is optional but recommended. It signs the lightweight participant session token returned after access-code validation. If omitted, the server falls back to `SUPABASE_SERVICE_ROLE_KEY`.

The seed script loads `data/mock-report-manifest.json`, `data/mock-answer-keys.json`, and report text files from `seed-data/mock-reports/`. It upserts one active challenge, all reports, all answer keys, and mock participants `P001` through `P050`, so it is safe to run more than once.

Local report text files are seed/dev assets only. They should not live under `public/`, because files under `public/` are directly browser-accessible.

Seeded participants have two identifiers:

- `participant_code`: friendly workshop label, such as `P001`.
- `access_code`: unique entry code distributed privately by the organizer, formatted as `GPO-XXXX-XXXX` with uppercase letters/numbers.

For an existing database created before access codes existed, or one with older long access codes such as `GPO-8768DC-8966CB`, run `supabase/access-code-migration.sql`. This updates missing or old-format codes to the current `GPO-XXXX-XXXX` format. For Admin v1.5 participant status/email fields, also run `supabase/admin-v1-5-migration.sql`. Then run:

```bash
npm run seed:supabase
```

The seed script preserves existing access codes only when they already match `GPO-XXXX-XXXX`; missing or old-format codes are replaced with new random codes.

Export access codes for organizer distribution from the Supabase SQL editor:

```sql
select participant_code, display_name, access_code
from participants
order by participant_code;
```

Do not expose this query or the full `access_code` values to participant-facing UI.

Verify access-code coverage and uniqueness with:

```sql
select count(*) as missing_access_codes
from participants
where access_code is null or access_code = '';
```

```sql
select
  count(*) as total_participants,
  count(distinct access_code) as unique_access_codes
from participants;
```

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

- `GET /api/submissions/status?participantCode=...&participantToken=...`
- `POST /api/submissions/public`
- `POST /api/submissions/final`
- `GET /api/leaderboard`

These routes use the server-only service role client. Public/Test Attempt and final submissions can use real OpenRouter evaluation when `USE_REAL_LLM=true`. Successful Supabase-mode submissions create `prompt_runs` and `submissions` rows. If Supabase is unavailable or unseeded, the frontend falls back to the existing browser `localStorage` submission store.

## Admin Dashboard

`/admin` is organizer-only and protected by `ADMIN_SECRET`. The login route checks the secret server-side and sets an httpOnly admin session cookie. The secret and Supabase service role key are never exposed to the frontend.

Admin v1 shows:

- Total participants and participants with access codes.
- Test and final submission counts.
- Participants who completed final.
- Latest run timestamp.
- Participant table with access code, test attempts used, latest/best test score, final status, and final score.
- Results table ranked primarily by final score.

CSV exports require the admin session:

- `/api/admin/export/access-codes`: `participant_code`, `display_name`, `email`, `access_code`, `is_active`
- `/api/admin/export/results`: `participant_code`, `display_name`, `email`, `test_attempts_used`, `latest_test_score`, `best_test_score`, `final_score`, `final_submitted_at`, `final_model_name`

Admin v1.5 participant tools:

- Regenerate one participant access code from that participant row. This requires confirming the participant code and invalidates the old access code.
- Clear one participant's run/submission data. This requires confirming the participant code and deletes only that participant's `prompt_run_items`, `submissions`, `prompt_runs`, and extra Test Attempt override.
- Deactivate/reactivate one participant. Inactive participants cannot log in or submit, but existing submissions remain stored.
- Email is currently a nullable metadata field shown/exported by Admin v1.5. Email/password auth is not implemented.

The admin reset requires typing `RESET` and deletes only:

- `prompt_run_items`
- `submissions`
- `prompt_runs`
- `participant_attempt_overrides`

It does not delete:

- `participants`
- access codes
- `reports`
- `answer_keys`
- `challenges`

Future admin tools may include regenerating all access codes at once, adding/removing participants, editing participant metadata, and clearing selected runs. Those are intentionally not implemented in Admin v1.5.

## Tables

- `participants`: Workshop identities and roles. `participant_code` is the friendly label; `access_code` is the unique workshop entry code.
- `challenges`: Challenge configuration, instructions, output schema, legacy model metadata, optional admin-selected evaluation model, active state, and submission limits.
- `reports`: Synthetic report text for each challenge. The current participant workflow uses `public` for reports `001`-`005` and `private` for reports `006`-`050`; `sample` remains a legacy-compatible split value.
- `answer_keys`: Structured adjudicated labels for each report.
- `prompt_runs`: One prompt execution against public test or final/private reports.
- `prompt_run_items`: Per-report model output, parsed JSON, validation details, and score.
- `submissions`: Public and final submissions tied to prompt runs. Final submissions power the leaderboard.

Finding values are strict controlled labels: `present`, `absent`, `uncertain`, and `not_reported`. Run `supabase/not-reported.sql` on an existing database before storing the new value. The migration does not rewrite existing answer keys; review those keys manually if unmentioned findings should be scored as `not_reported`.

The active challenge's optional `evaluation_model` is the model override used
for new real submissions and admin calibration. When it is null, the server
uses the `OPENROUTER_MODEL` environment fallback. Run
`supabase/evaluation-model.sql` before using the admin selector. The seed script
does not set this column, so an organizer override survives later seed runs.
The admin API accepts only the approved IDs in `app/lib/model-options.ts`; it
does not accept arbitrary custom model IDs. The approved list includes
lightweight Llama, Qwen, and Phi options for calibration; Gemma was removed
because it was unreliable in this setup. An unsupported legacy value is
ignored for new calls and should be replaced or cleared from `/admin`.

## Replacing localStorage later

Today:

- `great-prompt-off-participant-id` stores the active participant ID.
- `great-prompt-off-participant-session-token` stores the signed participant session token created after access-code validation.
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
