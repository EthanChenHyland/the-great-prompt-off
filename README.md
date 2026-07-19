# The Great Prompt-Off

The Great Prompt-Off is a prototype workshop platform for a live prompt-engineering challenge. Participants write prompts that ask an evaluation model to extract structured findings from synthetic, non-PHI knee MRI reports.

The project is built as both a usable event tool and a learning project for understanding AI evaluation pipelines, data structure, scoring, security boundaries, and live-event operations.

## What It Does

Participants compete by writing prompts that produce a structured output with six findings:

- `acl_tear`
- `mcl_injury`
- `meniscus_tear`
- `fracture`
- `osteoarthritis`
- `effusion`

The accepted output values are:

- `present`
- `absent`
- `uncertain`
- `not_reported`

Participants get counted Test Attempts on public reports, then one locked Final Submission on hidden reports. Organizers control the event from an admin dashboard.

## Why It Exists

The goal is to make prompt engineering concrete for a clinical/medical imaging workshop:

- participants use clinical reasoning to design extraction prompts
- the app evaluates whether the model returns a consistent machine-readable output
- organizers can run the event live with phases, timers, progress monitoring, and a projector leaderboard
- the codebase demonstrates how prompts, reports, model outputs, answer keys, scores, and submissions move through a real system

## Key Features

- Access-code participant login with friendly participant labels.
- Participant clinical extraction prompt editor with platform-controlled output formatting.
- Strict scoring against controlled values: `present`, `absent`, `uncertain`, `not_reported`.
- Public Test Attempts with sanitized feedback and format diagnostics.
- One locked Final Submission with private/sanitized feedback.
- Supabase-backed reports, answer keys, prompt runs, run items, and submissions.
- OpenRouter-backed model evaluation when configured.
- Admin event phases: not started, practice, final, ended.
- Admin leaderboard visibility controls.
- Live announcement banner and display-only timer.
- Participant progress monitor.
- Projector leaderboard at `/display/leaderboard`.
- Admin Case Manager for controlled report/answer-key edits.
- Reset tools and one-participant rescue tools.
- Scoring regression tests with Vitest.
- Seed report `.txt` files stored outside `public/`.
- Security hardening for prompt length, provider errors, and CSV exports.

## Participant Flow

1. Participant enters an organizer-provided access code.
2. The app shows a friendly label such as `P001`.
3. Participant writes clinical extraction instructions. Output formatting is handled by the platform.
4. During practice, participant uses counted Test Attempts on public reports.
5. Participant reviews score feedback and format diagnostics.
6. During final, participant submits once on hidden reports.
7. Participant sees only sanitized final feedback.

## Organizer/Admin Flow

Organizers log in at `/admin`.

Admin tools include:

- health/readiness check
- event phase controls
- leaderboard visibility controls
- announcement and timer controls
- participant progress monitor
- workshop analytics dashboard
- admin-only baseline difficulty calibration on public reports
- participant management
- extra Test Attempt override
- CSV exports
- reset workshop run data
- live Case Manager
- projector leaderboard link

Main routes:

- `/` participant login
- `/challenge` participant workspace
- `/admin` organizer dashboard
- `/admin/participants` participant management
- `/admin/results` results and leaderboard monitoring
- `/admin/analytics` read-only workshop analytics
- `/admin/cases` admin-only Case Manager
- `/admin/help` organizer help
- `/display/leaderboard` projector leaderboard

## Data And Privacy Model

Reports are synthetic and non-PHI.

After seeding, Supabase is the live source of truth:

- `reports` stores report text and public/private split
- `answer_keys` stores hidden expected labels
- `prompt_runs` stores prompt evaluation runs
- `prompt_run_items` stores per-report outputs and diagnostics
- `submissions` stores counted Test Attempts and Final Submissions
- `participants` stores participant labels, access-code records, and admin metadata

Local report `.txt` files live in `seed-data/mock-reports/` for seeding and development fallback only. They are intentionally not under `public/`, because files under `public/` are directly browser-accessible.

Participants should not see:

- answer keys
- private report text
- raw final model outputs
- access code lists
- server secrets

Admins can see report text and answer keys through protected admin tools.

## Tech Stack

- Next.js app router
- React
- TypeScript
- Supabase/Postgres
- OpenRouter model evaluation
- Vitest for scoring regression tests
- Vercel-oriented deployment

## Scoring At A High Level

The scorer compares the model output against the hidden answer key for each report.

The output must use exactly the six required fields and one of the controlled labels:

- `present`
- `absent`
- `uncertain`
- `not_reported` when the report does not provide enough information to determine a finding.

The scorer allows structural recovery, such as JSON inside markdown fences or a single nested report object, but it does not translate clinical phrases into labels. For example, phrases like `intact`, `partial tear`, `trace`, `yes`, or `no` are invalid values.

The participant controls the clinical extraction strategy. The server supplies a hidden formatting/task-contract instruction to the evaluation model so formatting is consistent without giving the participant a medical answer strategy. This hidden instruction does not contain report-specific answers or clinical reasoning hints.

`OPENROUTER_MODEL` remains the fallback model. Admins can optionally select a
challenge-specific evaluation model from `/admin`; the override is used for
new real submissions and calibration until it is cleared. Admin Health Check
shows the resolved model, the environment fallback, and the challenge override.
Previous runs retain their recorded model. Calibration does not create
submissions or affect attempts. Compare candidate models with the same public
report set before an event; if weak baselines score high, use a weaker model or
plan a harder report set.

The current six-field challenge is temporary and may later be replaced with a
harder 12-finding challenge. The no-assumption rule remains important:
`not_reported` means the report is silent or insufficient, `absent` requires
explicit negative evidence, and `uncertain` is reserved for ambiguous evidence.
The hidden server instruction enforces this contract without solving the
clinical task.

Admin calibration includes blank and nonsense baselines. With the current
evaluation contract, these should score low because a usable participant
strategy is required. If they remain high, use a weaker approved model or a
harder report set.

The admin selector intentionally limits challenge overrides to these approved
models, ordered from lighter/weaker calibration options to stronger baselines:

- `meta-llama/llama-3.2-1b-instruct` (Very lightweight)
- `meta-llama/llama-3.2-3b-instruct` (Lightweight)
- `qwen/qwen3-4b` (Lightweight / reasoning-focused)
- `microsoft/phi-4-mini-instruct` (Lightweight / reasoning-focused)
- `qwen/qwen-2.5-7b-instruct` (Lightweight-medium)
- `google/gemini-2.5-flash-lite` (Lightweight)
- `mistralai/mistral-small-3.2-24b-instruct` (Medium-low)
- `google/gemini-2.5-flash` (Strong)

Custom model IDs cannot be saved through the admin UI. Availability and pricing
depend on the OpenRouter account, so run calibration after changing models.
Gemma was removed from the approved list because it was unreliable in this
setup. Future 12-finding reports may require retuning this list.

Regression tests in `app/lib/scoring.test.ts` help prevent accidental return to overly lenient scoring.

## Run Locally

Install dependencies:

```bash
npm install
```

Create `.env.local` for local development. Do not commit real secrets.

Start the dev server:

```bash
npm run dev
```

Seed Supabase after applying the required SQL migrations:

```bash
npm run seed:supabase
```

## Checks

Run:

```bash
npm run test
npm run lint
npm run build
```

## Supabase Keep-Alive Health Check

The app includes a lightweight read-only endpoint at
`/api/health/supabase`. It performs a tiny active-challenge metadata read from
Supabase and returns only safe status JSON. It does not read reports, answer
keys, prompts, raw model outputs, access codes, secrets, or environment values.
It does not write to the database and does not call OpenRouter.

`vercel.json` schedules this endpoint once per day as a low-frequency
development convenience. This is not a replacement for the real pre-event
Supabase readiness checks in `DEMO_CHECKLIST.md`.

Optional protection: set `KEEPALIVE_SECRET` and send it as
`x-keepalive-secret: <secret>`. The endpoint also accepts
`Authorization: Bearer <secret>` for schedulers that use bearer tokens.

## More Documentation

- `PROJECT_ARCHITECTURE.md`: how the whole system works and where data lives.
- `DEMO_CHECKLIST.md`: rehearsal and live event run-of-show checklist.
- `MEETING_UPDATE.md`: progress summary since the doctor meeting.
- `SUPABASE_MIGRATIONS_GUIDE.md`: database migration and verification guide.
- `REPORT_IMPORT_GUIDE.md`: how to add/import synthetic reports.
- `supabase/README.md`: Supabase schema, seeding, and admin database notes.

## Current Status And Future Directions

Current status: event-ready prototype with live admin controls, Supabase-backed storage, OpenRouter evaluation, strict scoring, regression tests, and operational documentation.

Likely future improvements:

- formal rate limiting for login, validation, and expensive evaluation routes
- configurable challenge definitions beyond knee MRI
- admin model selection with fairness locking
- optional formatting-helper mode
- stronger automated tests around submission workflows
- async/background evaluation if final report sets grow
- fuller security review before broader deployment
