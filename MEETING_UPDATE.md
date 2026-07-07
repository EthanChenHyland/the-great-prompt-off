# Meeting Update

This document summarizes progress since the doctor meeting and frames the current state for the next discussion.

## 1. What Changed Since The Meeting

- Scoring was tightened so accepted output values are only:
  - `present`
  - `absent`
  - `uncertain`
- Clinical phrases such as `intact`, `partial tear`, `trace`, `yes`, or `no` are now invalid values rather than being silently mapped to controlled labels.
- The participant prompt editor was split into two editable sections:
  - Clinical extraction instructions
  - Output formatting instructions
- The Output formatting instructions box is prefilled with a concise default that tells the model to return JSON with the six required fields and allowed values.
- A shorter participant reminder now appears near the formatting box instead of a large tutorial.
- Scoring regression tests were added with Vitest.
- `PROJECT_ARCHITECTURE.md` was rewritten as the main system/data-flow explanation.
- `DEMO_CHECKLIST.md` was expanded into the live rehearsal and run-of-show checklist.
- Supabase is documented as the live source of truth after seeding.
- Local synthetic report `.txt` files were moved out of `public/` into `seed-data/mock-reports/`.
- Local report fallback is gated behind `ALLOW_LOCAL_FALLBACK=true`.
- Security hardening was added:
  - prompt length limit
  - generic participant-facing model/provider errors
  - CSV formula-injection protection

## 2. How Changes Map To The Doctor's Feedback

### Stricter Data Structure

The scoring system now enforces the controlled output contract more honestly. Only `present`, `absent`, and `uncertain` receive credit. This directly addresses the concern that the system was too forgiving of medically reasonable but incorrectly formatted outputs.

### Separating Clinical Reasoning From Formatting

The two-section prompt editor reflects the meeting point that the task has two parts:

- deciding what findings are present
- getting the model to return the exact machine-readable format

Participants can work on both without the app adding hidden rescue instructions.

### Better Software Discipline

The new architecture/data-flow documentation explains where reports, answer keys, prompts, outputs, scores, submissions, and admin controls live. This makes the project easier to reason about without relying on Codex.

### Edge Cases And Security

Several edge-case/security issues were addressed:

- oversized prompts are blocked before evaluation
- model/provider errors are shown as safe generic messages to participants
- CSV exports are protected against spreadsheet formula injection
- private/final local report files are no longer browser-accessible static assets

### Rehearsal Readiness

The run-of-show checklist gives a practical event sequence:

- setup
- reset
- practice round
- final round
- reveal/end
- exports
- failure checks

## 3. Current System Status

The app currently supports:

- participant access-code login
- public Test Attempts
- locked Final Submission
- strict scoring values
- two-section prompt editor
- public Test Attempt diagnostics
- sanitized Final Submission feedback
- event phases
- leaderboard visibility controls
- projector leaderboard
- admin progress monitor
- admin participant management
- extra Test Attempt override
- reset tools
- Supabase-backed reports, answer keys, prompt runs, run items, and submissions
- OpenRouter-backed evaluation when configured
- local seed/dev report files outside `public/`
- scoring regression tests

Current intended data source:

- Supabase `reports` table for live report text
- Supabase `answer_keys` table for hidden labels
- Supabase `prompt_runs`, `prompt_run_items`, and `submissions` for run/results storage
- `seed-data/mock-reports/` only for seeding or explicitly enabled local fallback

## 4. Rehearsed Or Still Need To Rehearse

Already covered in code/docs:

- scoring regression tests for strict values and recovery behavior
- build/lint/test checks
- run-of-show checklist
- documentation for architecture and migrations

Still important to rehearse manually:

- fresh deployment on Vercel
- admin login
- Supabase Health Check
- full reset before rehearsal
- participant login with a test access code
- practice phase with Test Attempts
- final phase with one Final Submission
- ended phase and projector leaderboard
- over-length prompt rejection
- invalid value diagnostics during a Test Attempt
- simulated model/provider failure
- final failure not locking submission
- export access codes and results CSV
- `/mock-reports/...` public URLs no longer resolving
- seed script still populating Supabase from `seed-data/mock-reports/`

## 5. Questions For The Next Meeting

- Should the challenge continue to require participants to handle output formatting, or should we later add a separate formatting helper/system instruction mode?
- Is the strict `present` / `absent` / `uncertain` label set clinically sufficient for this workshop?
- Should public Test Attempt feedback show more or less detail?
- Should final feedback show only score, or also aggregate format diagnostics?
- Are five public Test Attempts the right number?
- Are five public reports and forty-five hidden final reports the right split?
- Should the app eventually support configurable finding definitions beyond knee MRI?
- Should report/answer-key management remain admin-live editable, or should bulk file-based import be the preferred workflow?
- What level of participant identity/security is appropriate for the next version?
- Should real final evaluations move to an async queue if the report set grows?
