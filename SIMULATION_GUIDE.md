# Simulation Rehearsal

## Phase 9B: Deterministic Dry-Run

The admin-only endpoint `POST /api/admin/simulations/dry-run` rehearses schema-driven scoring with fixed synthetic simulation profiles.

This phase is intentionally limited:

- It is deterministic mock output, not a real LLM benchmark.
- It makes no OpenRouter calls.
- It writes no database rows.
- It creates no participants, attempts, prompt runs, submissions, or leaderboard entries.
- It does not activate or allowlist dormant challenge modes.

The endpoint defaults to public reports. Admins may explicitly request `public`, `private`, or `all`, but the response contains aggregate scores and diagnostics only. It never returns report text, answer-key values, hidden instructions, or raw model output.

Example request body:

```json
{
  "modeId": "knee_mri_6_basic",
  "schemaVersion": 1,
  "reportScope": "public",
  "profileIds": [
    "blank",
    "nonsense",
    "vague",
    "partial_first_field",
    "basic_all_fields",
    "strong_all_fields"
  ]
}
```

Dormant modes such as `knee_mri_12_basic` can be dry-run only when matching versioned answer keys exist for the requested reports. A dry-run does not imply that provenance requirements or activation readiness have passed.

Future phases may add isolated simulation tables, an admin GUI, optional real-model rehearsal, and simulation-only analytics. Those features should remain separate from real event storage.

## Phase 9C: Isolated Storage

`supabase/simulation-storage.sql` adds three dedicated tables for future
persistent simulations:

- `simulation_batches`
- `simulation_runs`
- `simulation_run_items`

These tables have no relationship to real participants, attempts, prompt runs,
submissions, leaderboards, event locks, or event analytics. They intentionally
contain no answer-key values, report text, or raw model-output column.

The migration also adds two service-role-only cleanup functions:

- `admin_delete_simulation_batch(target_batch_id uuid)` deletes one batch and
  cascades to its simulation runs and items.
- `admin_clear_simulation_data(target_challenge_id uuid)` deletes all
  simulation batches for one challenge and cascades to their runs and items.

Future API routes must require an admin session before calling either RPC.
Participant and anonymous database roles have no direct simulation-table or
cleanup-function access.

Phase 9B dry-runs still do not write to these tables. Persistence begins only
after a later application phase deliberately adds dual-tested simulation writes.

### Manual Verification

```sql
-- Confirm the isolated tables exist.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'simulation_batches',
    'simulation_runs',
    'simulation_run_items'
  )
order by table_name;

-- Simulation rows should remain zero until a later persistence phase.
select
  (select count(*) from simulation_batches) as simulation_batches,
  (select count(*) from simulation_runs) as simulation_runs,
  (select count(*) from simulation_run_items) as simulation_run_items;

-- Applying this migration or running Phase 9B must not create real event rows.
select
  (select count(*) from prompt_runs) as prompt_runs,
  (select count(*) from prompt_run_items) as prompt_run_items,
  (select count(*) from submissions) as submissions;

-- Confirm both simulation-only cleanup RPCs exist.
select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_delete_simulation_batch',
    'admin_clear_simulation_data'
  )
order by p.proname;
```
