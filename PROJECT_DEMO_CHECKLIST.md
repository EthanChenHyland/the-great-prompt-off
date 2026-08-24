# Project Demo And Staging Rehearsal Checklist

Use this checklist for a short advisor demo or a staging rehearsal. For full
event operations, use [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md). For migration
details and exact application order, use
[SUPABASE_MIGRATIONS_GUIDE.md](SUPABASE_MIGRATIONS_GUIDE.md).

## 1. Supabase Readiness

- [ ] Confirm the deployment points to the intended staging Supabase project.
- [ ] For a fresh database, confirm `supabase/schema.sql` was applied first.
- [ ] For an upgraded database, confirm any applicable historical migrations,
      including `access-code-migration.sql` and `admin-v1-5-migration.sql`.
- [ ] Confirm these current feature migrations are applied:
  - [ ] `supabase/admin-atomic-clears.sql`
  - [ ] `supabase/event-controls.sql`
  - [ ] `supabase/leaderboard-visibility.sql`
  - [ ] `supabase/event-announcement.sql`
  - [ ] `supabase/event-timer.sql`
  - [ ] `supabase/participant-attempt-overrides.sql`
  - [ ] `supabase/not-reported.sql`
  - [ ] `supabase/evaluation-model.sql`
  - [ ] `supabase/jsonb-schema-storage.sql`
  - [ ] `supabase/challenge-config-lock.sql`
  - [ ] `supabase/versioned-answer-keys.sql`
  - [ ] `supabase/future-mode-answer-keys.sql`
  - [ ] `supabase/answer-key-provenance.sql`
  - [ ] `supabase/challenge-schema-update.sql`
  - [ ] `supabase/simulation-storage.sql`
  - [ ] `supabase/simulation-reference-batches.sql`
- [ ] Confirm one active challenge exists and uses `knee_mri_6_basic` v1.
- [ ] Confirm public/private report counts and active-mode answer-key coverage.
- [ ] Confirm staging run/submission counts are appropriate before rehearsing.

Do not blindly rerun migrations on production. Check the migration guide and
database state first.

## 2. Admin Pages To Show

- [ ] `/admin`: health, event controls, model selector, schema/lock status,
      mode readiness, activation preflight, and participant progress.
- [ ] `/admin/analytics`: workshop analytics and the public-report calibration ladder.
- [ ] `/admin/simulations`: deterministic batches, analytics, comparisons,
      exports, reproducibility summaries, and reference regression checks.
- [ ] `/admin/participants`: participant status and controlled rescue actions.
- [ ] `/admin/results`: admin-only results and CSV export.
- [ ] `/admin/cases`: Supabase-backed report and active-mode answer-key management.
- [ ] `/display/leaderboard`: projector view that follows leaderboard visibility.

## 3. Participant Flow

- [ ] Set `not_started`; log in and show the automatic waiting state.
- [ ] Set `practice_open`; confirm public reports and Test Attempts are available.
- [ ] Show the clinical-strategy editor and explain that formatting is enforced by
      a hidden platform contract without displaying the hidden instruction.
- [ ] Submit a public Test Attempt and show strict labels:
      `present`, `absent`, `uncertain`, and `not_reported`.
- [ ] Confirm feedback never reveals answer keys or private reports.
- [ ] Set `final_open`; confirm Test Attempts close and Final opens once.
- [ ] Submit Final only in staging if intended; confirm private report text and raw
      final model output remain hidden.
- [ ] Set `ended`; confirm submissions close and the final participant state appears.

## 4. Calibration Flow

- [ ] On `/admin/analytics`, confirm the approved evaluation model.
- [ ] Run the four-profile ladder on public reports only:
  - [ ] Blank prompt
  - [ ] Nonsense prompt
  - [ ] Partial ACL-only strategy
  - [ ] Basic all-findings strategy
- [ ] Confirm calibration creates no participant submissions and consumes no attempts.
- [ ] Explain the expected pattern: blank/nonsense low, partial intermediate, and
      basic all-findings higher when model and reports are well calibrated.
- [ ] Rerun calibration after changing the evaluation model or report set.

## 5. Mode Readiness And Preflight

- [ ] On `/admin`, show the active `knee_mri_6_basic` mode and configuration lock status.
- [ ] Show aggregate readiness for `knee_mri_6_basic`, `knee_mri_12_basic`, and
      `shoulder_mri_basic` without displaying answer values or report text.
- [ ] Run activation preflight for a dormant mode.
- [ ] Review structural coverage, provenance, lock state, allowlist state, and
      `activatable if allowlisted` status.
- [ ] Confirm staging/demo provenance does not count as clinician-adjudicated readiness.
- [ ] Confirm only activation-allowlisted modes appear in the mode selector.

## 6. Deterministic Simulation Flow

- [ ] Open `/admin/simulations` and repeat the disclaimer: deterministic simulation
      is synthetic regression testing, not a real LLM benchmark or clinical validation.
- [ ] Select mode, schema version, report scope, and built-in profiles.
- [ ] Review the evaluation estimate, confirm, and run one persistent batch.
- [ ] Show per-profile aggregate scores, JSON validity, missing fields, and invalid values.
- [ ] Show simulation-only trends and compare two compatible batches.
- [ ] Export aggregate simulation CSV and show the reproducibility summary/hash.
- [ ] Mark a completed deterministic batch as the reference baseline.
- [ ] Compare another batch to the reference and show warnings for:
  - [ ] score movement greater than 5 percentage points;
  - [ ] lower JSON validity;
  - [ ] increased missing fields; or
  - [ ] increased invalid values.
- [ ] Demonstrate delete/clear confirmations only if staging data may be removed.
- [ ] Confirm simulation actions do not affect real attempts, submissions,
      leaderboards, event locks, participant progress, or real analytics.

## 7. Must Remain Dormant

- [ ] `knee_mri_6_basic` remains the active/default live mode.
- [ ] `knee_mri_12_basic` remains outside the activation allowlist.
- [ ] `shoulder_mri_basic` remains dormant and unselectable for activation.
- [ ] No participant mode selector is available.
- [ ] No severity mode is active.
- [ ] Simulation remains deterministic mock only; no real-LLM simulation exists.

## 8. Privacy And Safety

- [ ] Admin routes reject unauthenticated requests.
- [ ] Participant APIs enforce phase, attempt, and final-submission limits server-side.
- [ ] Participants cannot access answer keys, private report text, hidden prompts,
      raw final outputs, access-code lists, secrets, or environment values.
- [ ] Public leaderboard/projector data contains only approved aggregate identity/score data.
- [ ] Simulation APIs/UI/CSV contain no answer values, report text, strategy
      snapshots, raw outputs, participant data, or secrets.
- [ ] `/api/run-sample` returns `410 Gone`.
- [ ] Local report files are outside `public/`; Supabase is the live report source.
- [ ] Reset and simulation cleanup actions are clearly distinguished before use.

## 9. Manual SQL Checks

Run these in the Supabase SQL Editor. They return configuration and counts only.

```sql
-- Active challenge configuration.
select id, slug, mode_id, schema_version, evaluation_model,
       event_phase, leaderboard_visibility, is_active
from challenges
where is_active = true;

-- Public/private report counts for the active challenge.
select r.split, count(*) as report_count
from reports r
join challenges c on c.id = r.challenge_id
where c.is_active = true
group by r.split
order by r.split;

-- Versioned answer-key coverage and provenance, without answer values.
select ak.mode_id, ak.schema_version, ak.provenance, count(*) as key_count
from answer_keys ak
join reports r on r.id = ak.report_id
join challenges c on c.id = r.challenge_id
where c.is_active = true
group by ak.mode_id, ak.schema_version, ak.provenance
order by ak.mode_id, ak.schema_version, ak.provenance;

-- Missing answer keys for the active mode/version.
select count(*) as missing_active_mode_answer_keys
from reports r
join challenges c on c.id = r.challenge_id and c.is_active = true
left join answer_keys ak
  on ak.report_id = r.id
 and ak.mode_id = c.mode_id
 and ak.schema_version = c.schema_version
where ak.id is null;

-- Real event and simulation counts remain separate.
select
  (select count(*) from prompt_runs) as real_prompt_runs,
  (select count(*) from submissions) as real_submissions,
  (select count(*) from simulation_batches) as simulation_batches,
  (select count(*) from simulation_runs) as simulation_runs,
  (select count(*) from simulation_run_items) as simulation_run_items;

-- At most one simulation reference per challenge.
select challenge_id, count(*) as reference_count
from simulation_batches
where is_reference = true
group by challenge_id
having count(*) > 1;
```

## 10. Known Limitations

- Real clinician-adjudicated 12-field data is not available yet.
- `knee_mri_12_basic` is not activation-allowlisted.
- `shoulder_mri_basic` is dormant.
- Real-LLM simulation is not implemented.
- Deterministic simulation validates software behavior and reproducibility, not
  clinical correctness or model-provider performance.

## Suggested 10-Minute Demo

- [ ] **0:00-1:00:** Explain the six-field challenge, strict labels, and privacy boundary.
- [ ] **1:00-2:30:** Show `/admin` health, phase controls, model selector, and mode status.
- [ ] **2:30-4:30:** Run the participant practice flow and show safe feedback/leaderboard behavior.
- [ ] **4:30-5:30:** Show the calibration ladder and why participant strategy quality matters.
- [ ] **5:30-6:30:** Show mode readiness/preflight and explain why dormant modes cannot activate.
- [ ] **6:30-9:00:** Run or open a deterministic simulation batch, analytics, export,
      reproducibility summary, and reference regression comparison.
- [ ] **9:00-10:00:** Show privacy checks, current limitations, and the path to
      clinician-adjudicated 12-field data.
