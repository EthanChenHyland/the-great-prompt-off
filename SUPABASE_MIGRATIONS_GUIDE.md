# Supabase Migrations Guide

This guide explains the database SQL files for The Great Prompt-Off and what must be run in Supabase before production.

## What Supabase/Postgres Is

Supabase is the hosted Postgres database used by this app. Postgres stores the live workshop data that should survive page reloads and Vercel redeploys.

In this project, Supabase stores:

- challenges
- participants and access codes
- synthetic MRI reports
- hidden answer keys
- prompt runs
- per-report run items
- public/final submissions
- admin event settings, such as phase, leaderboard visibility, announcements, and timers

## What SQL Is

SQL is the language used to create, change, and query database tables.

Changing the Next.js app code does not automatically add new database columns or database functions. When the app needs a new database field, the matching SQL migration file must be run in the Supabase SQL Editor for the correct project.

Git rollback also does not undo Supabase database changes. Database changes live in Supabase until you intentionally alter them with SQL.

## Important Tables

- `challenges`: Stores challenge configuration, locked model, submission limits, active event phase, leaderboard visibility, live announcement, and display timer settings.
- `participants`: Stores participant identities, friendly codes such as `P001`, private access codes, roles, active/inactive state, display names, and email metadata.
- `reports`: Stores synthetic MRI report text and split values such as `public` and `private`.
- `answer_keys`: Stores the hidden structured labels for each report. This table must not be exposed to participants.
- `prompt_runs`: Stores one model evaluation run for a participant prompt.
- `prompt_run_items`: Stores per-report model outputs, parsed values, validation details, and scores for a prompt run.
- `submissions`: Stores counted Test Attempts and Final Submissions tied to prompt runs.

## Migration Files

Run these SQL files in the Supabase SQL Editor for the production Supabase project before the matching app code is deployed.

### `supabase/admin-atomic-clears.sql`

What it adds:

- `admin_reset_workshop_run_data()`
- `admin_clear_participant_run_data(target_participant_code text)`

Why it exists:

These RPC functions let the admin reset run/submission data in one database transaction instead of deleting from multiple tables one step at a time.

Required before production:

Yes. Admin reset and per-participant clear actions expect these RPC functions.

How to verify:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'admin_clear_participant_run_data',
  'admin_reset_workshop_run_data'
)
order by n.nspname, p.proname;
```

You should see both function names in the `public` schema.

### `supabase/event-controls.sql`

What it adds:

- `challenges.event_phase`
- A check constraint requiring one of:
  - `not_started`
  - `practice_open`
  - `final_open`
  - `ended`

Why it exists:

This lets the organizer control whether participants are waiting, practicing, submitting final entries, or finished.

Required before production:

Yes. Participant submission APIs and the admin dashboard expect `event_phase`.

How to verify:

```sql
select id, slug, title, event_phase, is_active
from challenges
where is_active = true;
```

### `supabase/leaderboard-visibility.sql`

What it adds:

- `challenges.leaderboard_visibility`
- A check constraint requiring one of:
  - `hidden`
  - `practice`
  - `final`
  - `ended`
  - `always`

Why it exists:

This lets the organizer choose when participants can see the leaderboard. Admin result pages remain visible to organizers.

Required before production:

Yes, if the deployed app includes leaderboard visibility controls.

How to verify:

```sql
select id, slug, title, leaderboard_visibility, is_active
from challenges
where is_active = true;
```

### `supabase/event-announcement.sql`

What it adds:

- `challenges.event_announcement`

Why it exists:

This stores a short admin-controlled live announcement banner shown to participants.

Required before production:

Yes, if the deployed app includes the live announcement panel.

How to verify:

```sql
select id, slug, title, event_announcement, is_active
from challenges
where is_active = true;
```

### `supabase/event-timer.sql`

What it adds:

- `challenges.event_timer_ends_at`
- `challenges.event_timer_label`

Why it exists:

This stores a display-only organizer countdown timer. The timer does not automatically change event phase or submission rules.

Required before production:

Yes, if the deployed app includes the event timer panel.

How to verify:

```sql
select id, slug, title, event_timer_label, event_timer_ends_at, is_active
from challenges
where is_active = true;
```

## Event-Control Columns on `challenges`

### `event_phase`

Controls participant workspace behavior and server-side submission gates.

- `not_started`: login allowed, public reports hidden, submissions closed.
- `practice_open`: Test Attempts open, Final Submission closed.
- `final_open`: Final Submission open, Test Attempts closed.
- `ended`: all submissions closed.

### `leaderboard_visibility`

Controls participant leaderboard visibility.

- `hidden`: participants never see the leaderboard.
- `practice`: visible only during `practice_open`.
- `final`: visible during `final_open` and `ended`.
- `ended`: visible only during `ended`.
- `always`: always visible.

### `event_announcement`

Short plain-text organizer message shown in the participant workspace. Empty string means no announcement.

### `event_timer_label`

Optional plain-text label for the display-only countdown timer.

### `event_timer_ends_at`

Timestamp for when the display-only countdown ends. `null` means no active timer.

## Reset RPC Functions

### `admin_reset_workshop_run_data()`

Deletes:

- `prompt_run_items`
- `submissions`
- `prompt_runs`
- `participant_attempt_overrides`

Preserves:

- `participants`
- access codes
- `reports`
- `answer_keys`
- `challenges`
- admin event settings

### `admin_clear_participant_run_data(target_participant_code text)`

Deletes the same run/submission data and Test Attempt override, but only for one participant.

Preserves:

- the participant row
- the participant access code
- reports
- answer keys
- challenges
- other participants' runs and submissions
- other participants' Test Attempt overrides

These RPC functions are safer than app-side deletes because the related deletes happen inside the database. That reduces the chance of a partial reset where one table is cleared but a later table fails.

## Production Setup Checklist

- Run all required SQL migration files in the production Supabase SQL Editor:
  - `supabase/schema.sql` for a fresh database, or the incremental migration files for an existing database.
  - `supabase/admin-atomic-clears.sql`
  - `supabase/event-controls.sql`
  - `supabase/leaderboard-visibility.sql`
  - `supabase/event-announcement.sql`
  - `supabase/event-timer.sql`
- Run `npm run seed:supabase` with production Supabase environment variables.
- Verify the active challenge has `event_phase`, `leaderboard_visibility`, `event_announcement`, `event_timer_label`, and `event_timer_ends_at`.
- Verify reset RPC functions exist and were updated from `supabase/admin-atomic-clears.sql`.
- Verify report counts.
- Verify answer-key coverage.
- Verify participants and access codes.
- Verify run/submission counts are `0` before the real event.

## Verification SQL

Active challenge and event settings:

```sql
select id, slug, title, event_phase, leaderboard_visibility, event_announcement, event_timer_label, event_timer_ends_at, is_active
from challenges
where is_active = true;
```

All columns on `challenges`:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'challenges'
order by ordinal_position;
```

Reset RPC functions:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'admin_clear_participant_run_data',
  'admin_reset_workshop_run_data'
)
order by n.nspname, p.proname;
```

Report split counts:

```sql
select split, count(*)
from reports
group by split
order by split;
```

Answer-key coverage:

```sql
select
  count(*) as total_reports,
  count(answer_keys.id) as reports_with_answer_keys,
  count(*) - count(answer_keys.id) as reports_missing_answer_keys
from reports
left join answer_keys on answer_keys.report_id = reports.id;
```

Participants and access codes:

```sql
select
  count(*) as total_participants,
  count(access_code) as participants_with_access_codes,
  count(distinct access_code) as unique_access_codes
from participants;
```

Run/submission counts before the event:

```sql
select
  (select count(*) from prompt_runs) as prompt_runs,
  (select count(*) from prompt_run_items) as prompt_run_items,
  (select count(*) from submissions) as submissions;
```

## Warnings

- Do not run reset during the event unless you intentionally want to clear Test Attempts, Final Submissions, leaderboard results, run history, and extra Test Attempt grants.
- Do not expose `answer_keys` to participants.
- Do not edit private reports during live submissions unless absolutely necessary.
- SQL changes affect the live Supabase database.
- Git rollback does not undo Supabase database changes.
- Run SQL in the correct Supabase project. It is easy to update a staging database while production remains unchanged, or vice versa.
