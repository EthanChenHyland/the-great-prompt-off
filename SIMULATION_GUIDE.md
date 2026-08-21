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
