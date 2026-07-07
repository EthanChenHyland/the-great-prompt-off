# Project Architecture

This is the main "how the system works" document for The Great Prompt-Off. It explains the data, pages, APIs, and safety boundaries without trying to be the live event checklist.

For rehearsal and event steps, use `DEMO_CHECKLIST.md`.

## What The App Is

The Great Prompt-Off is a live prompt-engineering challenge.

Participants write prompts that ask an evaluation model to read synthetic, non-PHI knee MRI reports and return six structured findings:

- `acl_tear`
- `mcl_injury`
- `meniscus_tear`
- `fracture`
- `osteoarthritis`
- `effusion`

The only accepted output values are:

- `present`
- `absent`
- `uncertain`

The app has two participant workflows:

- **Test Attempts**: counted practice submissions on public reports.
- **Final Submission**: one locked submission on hidden/private reports.

## What Participants Do

Participants:

- enter a unique access code on the home page
- see a friendly participant label such as `P001`
- write two prompt sections:
  - clinical extraction instructions
  - output formatting instructions
- use Test Attempts while practice is open
- submit one Final Submission when final is open
- see sanitized feedback

Participants do not manage accounts, passwords, databases, or report data.

## What Organizers/Admins Do

Organizers use `/admin` with `ADMIN_SECRET`.

Admins can:

- check readiness and health
- set event phase
- set leaderboard visibility
- set live announcement text
- set a display-only timer
- monitor participant progress
- review read-only workshop analytics
- export access codes and results
- grant one extra Test Attempt
- deactivate/reactivate participants
- regenerate one participant access code
- clear one participant's run data
- reset all run/submission/leaderboard data
- manage reports and answer keys in the admin-only Case Manager

The main admin pages are:

- `/admin`
- `/admin/participants`
- `/admin/results`
- `/admin/analytics`
- `/admin/cases`
- `/admin/help`
- `/display/leaderboard`

## Where Data Lives

Supabase/Postgres is the main live database.

After seeding, Supabase is the live source of truth for reports and answer keys. Local report text files live in `seed-data/mock-reports/` only as seed/dev data. They should not be placed under `public/`, because public files are browser-accessible.

### `challenges`

Stores the active challenge configuration:

- title/slug
- locked evaluation model
- Test Attempt limit
- Final Submission limit
- event phase
- leaderboard visibility
- live announcement
- timer label/end time

### `participants`

Stores participant identities:

- friendly participant code, such as `P001`
- private access code
- display name/email metadata
- active/inactive status

Participants type the access code, but the UI shows the friendly label.

### `reports`

Stores synthetic report text and split:

- `public`: visible public test reports
- `private`: hidden final reports

Public report text can be shown to participants. Private report text should stay server-side/admin-only.

### `answer_keys`

Stores hidden expected labels for each report.

Participants should never see answer key contents.

### `prompt_runs`

Stores one model evaluation run:

- participant
- challenge
- prompt text
- run type
- model/mode
- aggregate score fields
- timestamps

### `prompt_run_items`

Stores per-report output and score details:

- report id
- raw model output
- parsed output
- valid JSON / missing / invalid diagnostics
- per-report score fields

Public Test Attempt details may be shown in sanitized form. Private/final raw outputs should not be shown to participants.

### `submissions`

Stores counted submissions:

- public Test Attempts
- Final Submissions

Each submission points back to a `prompt_runs` row.

### `participant_attempt_overrides`

Stores admin-granted extra Test Attempts. These are event-run data and are cleared by reset tools.

## Where Prompts And Outputs Are Stored

Participants write prompts in `/challenge`.

The frontend combines the two visible sections into one prompt:

```text
Clinical extraction instructions:
{clinicalInstructions}

Output formatting instructions:
{formattingInstructions}
```

That combined prompt is sent to the submission API and stored in `prompt_runs.prompt_text`.

Model outputs are stored in `prompt_run_items.raw_model_output`.

Scores are stored in both:

- `prompt_runs` for aggregate run metrics
- `submissions` for counted leaderboard/result entries

## Public Test Attempt Flow

1. Participant logs in with an access code.
2. Workspace loads public reports, event settings, participant status, and leaderboard status.
3. Participant writes/edit prompts.
4. Participant clicks `Use test attempt`.
5. Frontend posts to `POST /api/submissions/public`.
6. Server checks participant session, event phase, prompt length, and remaining attempts.
7. Server loads public reports and hidden answer keys.
8. If real LLM mode is on, the server sends the participant prompt plus one report at a time to OpenRouter.
9. The model output is scored by `app/lib/scoring.ts`.
10. The run/items/submission are saved in Supabase.
11. Participant sees safe Test Attempt feedback.

Test Attempt feedback may show:

- score
- fields correct / total
- valid JSON count
- missing/invalid/extra field diagnostics
- public per-report numeric scores
- raw model output for public reports

It should not show answer key labels.

## Final Submission Flow

1. Event phase must be `final_open`.
2. Participant clicks `Submit final`.
3. Frontend posts to `POST /api/submissions/final`.
4. Server checks participant session, event phase, prompt length, and whether final was already used.
5. Server loads private reports and hidden answer keys.
6. OpenRouter evaluates the prompt against private reports when real LLM mode is on.
7. Scoring uses the same strict scorer.
8. The run/items/submission are saved in Supabase only after evaluation completes.
9. Participant sees sanitized aggregate final feedback.

Final feedback should not show:

- private report text
- private per-report breakdown
- raw final model outputs
- answer key labels

## Leaderboard Behavior

Leaderboard data comes from `GET /api/leaderboard`.

It respects the active challenge's event phase and leaderboard visibility setting.

During `practice_open`:

- leaderboard rows use each participant's best public Test Attempt score
- one row per participant
- not every attempt

During `final_open` or `ended`:

- leaderboard rows use Final Submission scores only
- one row per participant with a final submission

If the organizer hides the leaderboard, participants and the projector page see a hidden message instead of scores.

## Event Phases

Event phase is stored on the active `challenges` row.

- `not_started`: participants can log in, but reports and submissions are gated.
- `practice_open`: public reports and Test Attempts are open; Final Submission is closed.
- `final_open`: Final Submission is open; Test Attempts are closed.
- `ended`: all submissions are closed.

The UI responds to phase changes, and submission APIs enforce phase rules server-side.

## Leaderboard Visibility

Leaderboard visibility is stored on the active `challenges` row.

- `hidden`: never visible to participants
- `practice`: visible during `practice_open`
- `final`: visible during `final_open` and `ended`
- `ended`: visible only during `ended`
- `always`: visible in all phases

Admin result pages remain visible to admins regardless of participant leaderboard visibility.

## Participant Access Codes

Participants do not log in with predictable `P001` labels.

Each participant has:

- `participant_code`: friendly label such as `P001`
- `access_code`: private organizer-distributed code

Access-code validation happens server-side against Supabase. The participant workspace displays the friendly label, not the full access code.

## Supabase Role In The App

Supabase stores live challenge data and event results.

Server-side code uses the service-role key only on the server. Client-side code should not import the service-role client or receive private database records.

For SQL and migration setup, read `SUPABASE_MIGRATIONS_GUIDE.md`.

## OpenRouter Role In The App

OpenRouter is used server-side for real model evaluation when `USE_REAL_LLM=true`.

The server sends:

- the participant's visible prompt
- one synthetic report text

The server does not send:

- API keys
- admin secrets
- Supabase service-role keys
- answer key labels as part of the model prompt

The app does not add hidden extraction rescue prompts and does not force JSON response format. Participants are responsible for prompting the model to produce the required structured output.

## What Is Public vs Private

Participant-visible:

- public report text
- their friendly participant label
- their own remaining attempts/status
- Test Attempt score feedback
- public Test Attempt model output details
- leaderboard rows when visible
- aggregate final status/score

Participant-hidden:

- answer keys
- private report text
- raw final model outputs
- private per-report final details
- access code lists
- admin controls
- secrets/env vars

Admin-visible:

- participant roster and access codes
- reports and answer keys
- progress/results
- case manager report text
- operational health settings

## Important Files And Docs

System overview:

- `PROJECT_ARCHITECTURE.md`

Live event steps:

- `DEMO_CHECKLIST.md`

Database and SQL:

- `SUPABASE_MIGRATIONS_GUIDE.md`
- `supabase/README.md`
- `supabase/schema.sql`
- `supabase/*.sql`

Report import:

- `REPORT_IMPORT_GUIDE.md`

Main code paths:

- participant workspace: `app/components/ChallengeWorkspace.tsx`
- public submission route: `app/api/submissions/public/route.ts`
- final submission route: `app/api/submissions/final/route.ts`
- shared submission workflow: `app/lib/supabase/submission-workflow.ts`
- OpenRouter helper: `app/lib/openrouter.ts`
- scoring: `app/lib/scoring.ts`
- scoring tests: `app/lib/scoring.test.ts`
