# Demo Checklist

## Environment

- Set `NEXT_PUBLIC_SUPABASE_URL`.
- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Set `SUPABASE_SERVICE_ROLE_KEY`.
- Set `ADMIN_SECRET`.
- Set `PARTICIPANT_SESSION_SECRET` if using a dedicated participant-session signing secret.
- Set `USE_REAL_LLM=true` for live OpenRouter evaluation.
- Set `OPENROUTER_MODEL`.
- Set `OPENROUTER_API_KEY`.
- Optionally set `OPENROUTER_CONCURRENCY=3` to limit simultaneous report evaluations.

## Database Prep

- Run `supabase/access-code-migration.sql` if updating older access codes.
- Run `supabase/admin-v1-5-migration.sql`.
- Run `npm run seed:supabase`.
- Verify report split counts:

```sql
select split, count(*) from reports group by split order by split;
```

Expected: `public = 5`, `private = 45`.

## Organizer Prep

- Export participant access codes:

```sql
select participant_code, display_name, access_code
from participants
order by participant_code;
```

- Log in to `/admin` with `ADMIN_SECRET`.
- Confirm the Health Check panel shows Supabase connected, expected report counts, and the intended OpenRouter model.

## Participant Smoke Test

- Test one participant login with an access code.
- Run one Test Attempt.
- Run one Final Submission.
- Confirm the participant sees only safe aggregate feedback.
- Check OpenRouter usage/cost after the test.

## Before The Event

- In `/admin`, reset workshop run data by typing `RESET`.
- Confirm participants and access codes remain.
- Confirm test/final submission counts return to zero.
