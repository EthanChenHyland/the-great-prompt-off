# Project Architecture

This document explains how The Great Prompt-Off is organized: where the data lives, how prompts move through the system, and which files act like the model, view, and controller layers. It is meant for the project maintainer, not as participant-facing copy.

## 1. High-Level Purpose

The Great Prompt-Off is a prompt engineering challenge platform.

Participants write prompts that make an AI model extract six structured findings from synthetic, non-PHI knee MRI reports:

- `acl_tear`
- `mcl_injury`
- `meniscus_tear`
- `fracture`
- `osteoarthritis`
- `effusion`

The expected output values are strict controlled labels:

- `present`
- `absent`
- `uncertain`

The event has two counted workflows:

- Public Test Attempts: participants evaluate prompts on public reports and receive sanitized feedback.
- Final Submission: participants submit once against hidden/private reports and receive limited final feedback.

## 2. Current Technology Stack

- Next.js app: participant workspace, admin dashboard, API routes, and projector display.
- Vercel deployment: intended production host for the Next.js app.
- Supabase/Postgres: persistent database for challenges, reports, participants, prompt runs, per-report outputs, submissions, and event settings.
- OpenRouter: server-side model evaluation provider when `USE_REAL_LLM=true`.
- Local/mock fallback: development fallback for challenge metadata and submissions when explicitly allowed. Production/event mode should rely on Supabase.
- Git/GitHub: source control and deployment workflow.

## 3. Model / View / Controller Framing

Using the doctor meeting framing:

### Model

The model is the data structure: database tables, local mock data, and TypeScript types that define what the app stores.

Important model files:

- `supabase/schema.sql`
- `supabase/*.sql` migration files
- `app/lib/types.ts`
- `app/lib/challenge-data.ts`
- `app/lib/supabase/*`
- `data/mock-answer-keys.json`
- `data/mock-report-manifest.json`
- `public/mock-reports/`

### View

The view is what participants, admins, and organizers see.

Important view files:

- Participant home: `app/components/LandingPage.tsx`
- Participant workspace: `app/components/ChallengeWorkspace.tsx`
- Admin pages: `app/admin/*`
- Admin components: `app/components/Admin*.tsx`
- Projector leaderboard: `app/display/leaderboard/page.tsx` and `app/components/LeaderboardDisplay.tsx`

### Controller

The controller is the logic that moves data between the view, database, model provider, and scoring engine.

Important controller files:

- `app/api/submissions/public/route.ts`
- `app/api/submissions/final/route.ts`
- `app/api/submissions/status/route.ts`
- `app/api/leaderboard/route.ts`
- `app/api/challenge-data/route.ts`
- `app/api/admin/*`
- `app/lib/supabase/submission-workflow.ts`
- `app/lib/openrouter.ts`
- `app/lib/scoring.ts`

## 4. Data Model

### `participants`

Stores workshop identities.

Important fields include:

- friendly participant label, such as `P001`
- access code used for participant login
- display name and optional email for organizer use
- active/inactive status

Participants log in with access codes, but participant-facing screens show friendly participant labels.

### `challenges`

Stores the active challenge configuration.

Important fields include:

- title and slug
- locked model
- public and final submission limits
- event phase
- leaderboard visibility
- announcement text
- timer label and end time

### `reports`

Stores report text and split information.

Important split values:

- `public`: reports visible to participants for Test Attempts.
- `private`: hidden reports used for Final Submission.
- `sample`: legacy/older split value; participant workflow currently focuses on public/private.

### `answer_keys`

Stores the hidden expected labels for each report.

Participants should never see answer key contents.

### `prompt_runs`

Stores one evaluation run for a participant prompt.

It records:

- participant
- challenge
- run type
- prompt text
- model name/mode
- aggregate score fields
- timestamps

### `prompt_run_items`

Stores per-report evaluation details for a prompt run.

It can include:

- report id
- model output
- parsed prediction
- per-report score
- validation details

Public/Test Attempt feedback can expose safe diagnostics. Final/private raw outputs and private per-report details should remain hidden from participants.

### `submissions`

Stores counted Test Attempts and Final Submissions.

Each submission points to a `prompt_runs` row. Public submissions track Test Attempts. Final submissions are one-time and power final leaderboards during final/ended states.

### `participant_attempt_overrides`

Stores narrow admin rescue overrides for extra public Test Attempts.

This is event-run data and is cleared by the workshop reset RPCs. It does not affect Final Submission.

## 5. Data Flow: Public Test Attempt

1. Participant enters a unique access code on the home page.
2. Server validates the access code against Supabase when available.
3. Participant reaches `/challenge`.
4. The workspace loads challenge metadata, public report text, participant submission status, event phase, leaderboard visibility, announcement, and timer.
5. Participant sees public reports when the event phase allows it.
6. Participant writes two visible prompt sections:
   - clinical extraction instructions
   - output formatting instructions
7. The frontend combines those sections into one prompt string:

   ```text
   Clinical extraction instructions:
   {clinicalInstructions}

   Output formatting instructions:
   {formattingInstructions}
   ```

8. The participant clicks `Use test attempt`.
9. The frontend posts to `POST /api/submissions/public` with the existing `{ participantCode, participantToken, prompt }` shape.
10. The API validates participant session and event phase.
11. Server-side workflow loads public reports and answer keys.
12. If real LLM mode is enabled, the server sends the participant-visible prompt plus each report text to OpenRouter.
13. Model output is scored by `app/lib/scoring.ts`.
14. The system saves:
    - `prompt_runs`
    - `prompt_run_items`
    - `submissions`
15. Participant sees sanitized public feedback:
    - overall score
    - fields correct / total
    - valid JSON status
    - missing/invalid/extra field diagnostics
    - public per-report numeric scores
    - public raw model output details for Test Attempts only
16. During `practice_open`, `/api/leaderboard` ranks participants by best public Test Attempt score, one row per participant.

## 6. Data Flow: Final Submission

1. Event phase must be `final_open`.
2. Participant submits from the same workspace.
3. The frontend posts the combined prompt to `POST /api/submissions/final`.
4. Server validates participant session and confirms final has not already been used.
5. Server loads private reports and answer keys.
6. If real LLM mode is enabled, OpenRouter evaluates the prompt against private reports.
7. Scoring uses the same scoring engine.
8. The system stores:
   - `prompt_runs`
   - `prompt_run_items`
   - `submissions`
9. Participant sees sanitized final feedback only:
   - aggregate final score
   - fields correct / total fields
   - format counts such as valid JSON / missing / invalid values
   - no private per-report breakdown
   - no private report text
   - no raw final model outputs
   - no answer key labels
10. During `final_open` or `ended`, `/api/leaderboard` shows Final Submission scores only, one row per final-submitting participant.

## 7. Admin / Organizer Controls

Admin pages require admin session protection. Service-role Supabase access and secrets remain server-only.

Organizer tools include:

- Event phases:
  - `not_started`
  - `practice_open`
  - `final_open`
  - `ended`
- Leaderboard visibility:
  - `hidden`
  - `practice`
  - `final`
  - `ended`
  - `always`
- Live announcement banner.
- Display-only event timer.
- Participant progress monitor.
- Participant management:
  - edit display name/email
  - regenerate one access code
  - deactivate/reactivate
  - clear one participant's run/submission data
  - grant `+1` public Test Attempt
- Reset tools:
  - clear leaderboard/submissions/run data
  - clear prompt run items, submissions, prompt runs, and attempt overrides
  - preserve participants, access codes, reports, answer keys, and challenges
- Results exports.
- Access code exports.
- Admin-only Case Manager:
  - create/edit/view/delete report cases
  - view answer keys
  - block unsafe delete when run history exists
- Projector leaderboard:
  - `/display/leaderboard`
  - public display page using safe leaderboard data and visibility rules

## 8. Scoring Behavior

Scoring is implemented in `app/lib/scoring.ts`.

Required fields:

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

Current scoring intentionally uses strict controlled labels. Clinical phrases are not accepted as values. For example, these should be invalid:

- `intact`
- `normal`
- `no tear`
- `partial tear`
- `sprain`
- `trace`
- `yes`
- `no`
- `positive`
- `negative`

The scorer still performs structural recovery:

- JSON inside markdown code fences.
- JSON object embedded in surrounding prose.
- Single-object arrays.
- Nested single-report objects.
- Field-name aliases.
- Ignored extra field diagnostics.

This means the scorer helps with recoverable structure, but it does not translate clinical phrases into labels. The participant prompt must make the model output the controlled values.

## 9. Privacy and Safety Boundaries

- Reports are synthetic and non-PHI.
- Participants must not see answer keys.
- Participants must not see private report text.
- Participants must not see raw Final Submission model outputs.
- Participants must not see access code lists.
- API keys, service role keys, and admin secrets must stay server-side.
- Admin pages can show operational diagnostics, but participant pages should stay polished and safe.
- Public Test Attempt feedback may show safe diagnostics and public model outputs to help participants improve prompts.
- Final feedback must stay aggregate/sanitized.
- Legacy routes such as `POST /api/submit-public` and `POST /api/submit-final` are disabled. `POST /api/run-sample` exists as legacy/sample infrastructure and should not be part of the main participant workflow.

## 10. Known Limitations / Future Directions

Meeting-driven future directions:

- More generalizable data model for finding definitions.
- Configurable challenges/tasks beyond knee MRI.
- Better formal unit tests and regression tests.
- Security and edge-case audit before wider deployment.
- Optional admin model selection with fairness locking.
- Possible formatting-helper or system-instruction mode that separates clinical reasoning from output formatting.
- Async queue/background job model if final evaluations grow large.
- Mobile view improvements as a future view-only change.
- Clearer data import and validation flow for larger report sets.
- Stronger database transaction model for full submission persistence if scale increases.

## 11. Operational Checklist Pointers

Use these documents for running and maintaining the app:

- `README.md`: project overview, setup, and deployment notes.
- `DEMO_CHECKLIST.md`: event-day checklist.
- `SUPABASE_MIGRATIONS_GUIDE.md`: beginner-friendly SQL and migration guide.
- `supabase/README.md`: Supabase schema and seeding notes.
- `REPORT_IMPORT_GUIDE.md`: adding/importing synthetic reports.

