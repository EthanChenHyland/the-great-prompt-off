# Demo Checklist

Short event-focused checklist. See `README.md` for setup details and `REPORT_IMPORT_GUIDE.md` for report data changes.

## Environment

- Confirm Vercel env vars are set:
  - `USE_REAL_LLM=true`
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL=google/gemini-2.5-flash`
  - `OPENROUTER_CONCURRENCY=3`
  - Supabase URL/anon/service-role vars
  - `ADMIN_SECRET`
- Redeploy Vercel after env var changes.

## Supabase

- Run required SQL/migrations for the target database.
- Run `supabase/event-controls.sql`.
- Run `supabase/leaderboard-visibility.sql`.
- Run `supabase/event-announcement.sql`.
- Run `supabase/event-timer.sql`.
- Run `supabase/admin-atomic-clears.sql`.
- Run `npm run seed:supabase`.
- Verify split counts:

```sql
select split, count(*) from reports group by split order by split;
```

Expected: `5 public / 45 private`.

## Admin Readiness

Log in to `/admin`.

Before the event, Health Check should show:

- Supabase connected: `Yes`
- `USE_REAL_LLM`: `true`
- OpenRouter model: `google/gemini-2.5-flash`
- Report split: `5 public / 45 private`
- Participants: `50`
- Test submissions: `0`
- Final submissions: `0`
- Latest run: `-`

## Access Codes

- Export access codes CSV from `/admin`.
- Distribute only each participant's assigned access code.

## Smoke Test

- Log in as one participant.
- Run one Test Attempt.
- Confirm public feedback is sanitized and numeric.
- Run one Final Submission only if intentionally testing final evaluation.
- Warning: a final smoke test uses about 45 OpenRouter calls.
- Confirm real LLM failures do not count/store final submissions.
- Check OpenRouter usage/cost.

## Before Participants Start

- In `/admin`, reset workshop run data by typing `RESET`.
- Confirm participants/access codes remain.
- Confirm Test submissions and Final submissions are `0`.
- Set the event phase to `practice_open` when the challenge begins.
- Set the event phase to `final_open` for the final round.
- Set the event phase to `ended` when submissions should close.
- Set participant leaderboard visibility from `/admin` before or during the event.
- Use the Event Announcement panel in `/admin` to set or clear a short live participant banner.
- Use the Event Timer panel in `/admin` to set or clear a display-only participant countdown.
- Participant status and leaderboard panels update automatically during the event.
- Open `/display/leaderboard` on the projector if you want a big-screen leaderboard display.
- `/admin` and `/admin/results` auto-refresh for monitoring; use manual refresh on pages with edit forms.

## Post-Event

- Export results CSV from `/admin`.
- Export access codes CSV if needed for records.
