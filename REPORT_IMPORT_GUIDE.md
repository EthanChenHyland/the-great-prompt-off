# Report Import Guide

This project imports reports from local files and seeds them into Supabase. A live admin Case Manager also exists under `/admin/cases` for small report/answer-key edits, but file-based import remains safer for bulk changes.

## Repo Paths

- Report text files: `seed-data/mock-reports/`
- Report manifest: `data/mock-report-manifest.json`
- Answer keys: `data/mock-answer-keys.json`
- Seed script: `scripts/seed-supabase.ts`
- Field/constants file: `app/lib/challenge-constants.ts`
- Type definitions: `app/lib/types.ts`
- Supabase schema: `supabase/schema.sql`

## Naming Convention

Current reports use:

```txt
seed-data/mock-reports/synthetic_report_001.txt
seed-data/mock-reports/synthetic_report_002.txt
...
seed-data/mock-reports/synthetic_report_050.txt
```

Manifest IDs use:

```txt
synthetic-report-001
synthetic-report-002
...
synthetic-report-050
```

If adding reports beyond 50, continue the same pattern:

```txt
synthetic_report_051.txt
synthetic-report-051
```

## Public/Private Split

Current participant workflow:

- Reports `001` through `005` are `public`.
- Reports `006` through `050` are `private`.
- Test Attempts use the `public` split.
- Final Submission uses the `private` split.

If the counts change, update participant-facing text in:

- `app/lib/challenge-constants.ts`
- `app/components/ChallengeWorkspace.tsx`
- `README.md`
- `DEMO_CHECKLIST.md`

More private reports also means more OpenRouter calls during Final Submission.

Changing public/private counts may require updating participant-facing text and docs. The current UI assumes 5 public Test Attempt reports and 45 private Final Submission reports.

## Live Admin Case Manager

Logged-in admins can use `/admin/cases` to create, view, edit, and delete individual reports and answer keys. The main `/admin` page links to the Case Manager from the organizer dashboard.

Live editing notes:

- Report text and answer-key labels are visible only in the admin dashboard.
- Deleting a report requires typing the exact filename.
- Deleting is blocked when `prompt_run_items` exist for that report.
- Blocked deletes preserve participant data, prompt runs, submissions, and results.
- Live editing is higher-risk than file-based import because it changes the active database immediately.
- File-based import remains the recommended path for bulk additions or large dataset revisions.

## Adding Reports

1. Add each synthetic report text file to `seed-data/mock-reports/`.
2. Add each report to `data/mock-report-manifest.json`.
3. Add a matching answer-key entry to `data/mock-answer-keys.json`.
4. Run:

```bash
npm run seed:supabase
```

The seed script reads `data/mock-report-manifest.json`, `data/mock-answer-keys.json`, and `seed-data/mock-reports/`, then upserts reports and answer keys into Supabase.

## Manifest Entry Shape

```json
{
  "id": "synthetic-report-051",
  "filename": "synthetic_report_051.txt",
  "split": "private"
}
```

Allowed `split` values are defined by the schema/type compatibility:

- `public`
- `private`
- `sample` legacy-compatible, not participant-facing in the current workflow

## Answer Key Entry Shape

```json
{
  "id": "synthetic-report-051",
  "filename": "synthetic_report_051.txt",
  "split": "private",
  "answer_key": {
    "acl_tear": "absent",
    "mcl_injury": "absent",
    "meniscus_tear": "present",
    "fracture": "absent",
    "osteoarthritis": "uncertain",
    "effusion": "present"
  },
  "notes": "Optional internal note."
}
```

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

The seed script validates that each answer key has allowed values and that manifest metadata agrees with answer-key metadata.

## Dormant Twelve-Field Preparation

The `knee_mri_12_basic` schema is currently dormant and cannot be activated by
the admin mode selector. You can validate future answer-key preparation with
the admin-only endpoint:

```text
POST /api/admin/challenge-schema/validate
```

Send only the target mode and registry version:

```json
{
  "modeId": "knee_mri_12_basic",
  "schemaVersion": 1
}
```

Future twelve-field entries should use `answer_values` with exactly these keys:

```text
acl_tear, mcl_tear, medial_meniscus_tear, lateral_meniscus_tear,
fracture, bone_contusion, medial_osteoarthritis,
lateral_osteoarthritis, patellofemoral_osteoarthritis, effusion,
synovitis, bakers_cyst
```

Every value must be one of `present`, `absent`, `uncertain`, or
`not_reported`. The validation response contains only report counts and issue
counts; it does not return answer-key values or report text. Validation does
not activate the mode, create submissions, or change production data.

## SQL Verification

Report counts by split:

```sql
select split, count(*) from reports group by split order by split;
```

First/last filenames:

```sql
select filename, split from reports order by filename limit 10;
select filename, split from reports order by filename desc limit 10;
```

Missing answer keys:

```sql
select r.external_id, r.filename, r.split
from reports r
left join answer_keys ak on ak.report_id = r.id
where ak.id is null
order by r.filename;
```

Answer keys without reports should not normally happen because `answer_keys.report_id` references `reports.id`, but this query can confirm current totals:

```sql
select
  (select count(*) from reports) as report_count,
  (select count(*) from answer_keys) as answer_key_count;
```

Current expected counts after seeding:

- `reports = 50`
- `answer_keys = 50`
- `public = 5`
- `private = 45`

## Warnings

- Use synthetic, non-PHI report text only.
- Do not commit or seed protected health information.
- Do not put report text files under `public/`; anything under `public/` can be served directly by browser URL.
- Do not expose `data/mock-answer-keys.json` or Supabase answer-key contents to participants.
- Do not expose private report text to participants.
- More private reports means more OpenRouter calls and more latency/cost for Final Submission.
- If public/private counts change, update UI and docs so participants understand the workflow.
- Live Case Manager exists under `/admin/cases`, but report changes can still be file-based plus `npm run seed:supabase`.
