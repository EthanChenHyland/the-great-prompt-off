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
the admin mode selector. The admin-only readiness endpoint checks answer keys
already stored for a target mode:

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
`not_reported`. Readiness and preparation responses contain only counts and
safe issues; they do not return answer-key values or report text. Neither path
activates the mode or creates submissions. Only the preparation endpoint with
`"write": true` changes answer-key storage.

### Twelve-Field Import Preparation

Run these migrations in order before writing twelve-field answer keys:

1. `supabase/versioned-answer-keys.sql`
2. `supabase/future-mode-answer-keys.sql`
3. `supabase/answer-key-provenance.sql`

They add:

- `answer_keys.mode_id`
- `answer_keys.schema_version`
- a unique constraint on `(report_id, mode_id, schema_version)`
- nullable legacy columns for future-mode rows, with a check that keeps all six
  legacy values required for `knee_mri_6_basic` version `1`
- provenance, import-batch, and optional clinician-adjudication metadata

The migrations preserve existing six-field rows. Twelve-field rows use
`answer_values` and do not write the legacy six-field columns. The preparation
endpoint requires a complete item for every public and private report, so it
does not perform partial imports.

Start from
`seed-data/templates/knee-mri-12-answer-keys.template.json`. It is an example
of the request shape only. Its identifier and labels are deliberately
illustrative and are not adjudicated clinical truth. Keep the working import
outside `public/`, replace the placeholder, and add one reviewed item for every
public and private report before using the endpoint.

For a disposable staging rehearsal, the repository also includes
`staging-data/knee-mri-12/knee-mri-12-answer-keys.demo.json`. It covers the 50
current seed filenames with deterministic placeholder labels. Those labels are
synthetic pipeline-test data, not clinically adjudicated truth, and must never
be used for real scoring or promoted to production. The production seed script
does not read `staging-data/`.

Validate without writing:

```text
POST /api/admin/challenge-schema/prepare-answer-keys
```

```json
{
  "modeId": "knee_mri_12_basic",
  "schemaVersion": 1,
  "provenance": "staging_demo",
  "importBatchId": "knee-mri-12-rehearsal-1",
  "notes": "Staging pipeline rehearsal; not clinically adjudicated.",
  "write": false,
  "items": [
    {
      "report_id_or_filename": "report_001.txt",
      "answer_values": {
        "acl_tear": "absent",
        "mcl_tear": "absent",
        "medial_meniscus_tear": "present",
        "lateral_meniscus_tear": "absent",
        "fracture": "absent",
        "bone_contusion": "not_reported",
        "medial_osteoarthritis": "present",
        "lateral_osteoarthritis": "absent",
        "patellofemoral_osteoarthritis": "uncertain",
        "effusion": "present",
        "synovitis": "not_reported",
        "bakers_cyst": "absent"
      }
    }
  ]
}
```

After a successful validation, set `"write": true` to insert separate
`knee_mri_12_basic` version `1` rows. Existing twelve-field rows block the
entire import by default. Set `"overwrite": true` only when you intend to
replace `answer_values` for matching twelve-field rows. Overwrite does not
modify `knee_mri_6_basic` rows or their legacy columns.

Each answer key must contain exactly the 12 fields shown above. Every value
must be `present`, `absent`, `uncertain`, or `not_reported`. The response
contains only aggregate counts and safe issue messages; it never returns
answer values or report text.

`knee_mri_12_basic` remains dormant. Importing its answer keys does not add it
to the activation allowlist or change the active challenge mode.

### Provenance and Clinical Readiness

Every prepared answer-key batch is classified as `legacy`, `staging_demo`,
`clinician_adjudicated`, `imported`, or `unknown`. Existing six-field rows are
backfilled as `legacy`. The twelve-field preparation endpoint defaults to
`staging_demo`, generates an import batch ID when none is supplied, and stores
a clear non-adjudicated note. A clinician-reviewed import must explicitly use
`clinician_adjudicated` and include `adjudicatedBy`; `adjudicatedAt` defaults to
the server timestamp when omitted.

The admin readiness dashboard shows aggregate provenance counts only. Complete,
structurally valid staging data is labeled as staging/demo and does not make
`knee_mri_12_basic` clinically ready. Clinical readiness requires complete
version-matched coverage with `clinician_adjudicated` provenance. Adjudicator
identity, answer values, report text, and batch notes remain admin/server-only.

The guarded challenge-schema activation route enforces the same rule on the
server. The current `knee_mri_6_basic` mode accepts its backfilled `legacy`
provenance (and clinician-adjudicated rows). Future modes require every
version-matched answer key to be `clinician_adjudicated`; staging, imported,
unknown, or missing provenance cannot activate a mode. This enforcement does
not expand the activation allowlist.

Use the admin-only activation preflight before considering an allowlist change:

```text
POST /api/admin/challenge-schema/preflight
```

Send `modeId` and `schemaVersion`. The read-only response reports structural
and clinical readiness, report coverage, aggregate provenance counts, current
lock status, and whether the mode would be activatable if allowlisted. It does
not call the schema-update RPC, activate a mode, or return answer values,
report text, adjudicator details, notes, or import-batch identifiers. The same
preflight is available from the Mode readiness panel on `/admin`.

### Rehearsal Sequence

Use an authenticated admin session for every endpoint call. The browser console
on `/admin` is suitable for a local rehearsal because its requests include the
existing admin session. Do not paste answer keys into participant pages,
screenshares, logs, or documentation.

1. Apply `supabase/versioned-answer-keys.sql`,
   `supabase/future-mode-answer-keys.sql`, and then
   `supabase/answer-key-provenance.sql`.
2. Prepare a complete reviewed payload from the template. Keep `write` and
   `overwrite` set to `false`.
   For a staging-only pipeline rehearsal, you may instead use the complete demo
   payload under `staging-data/knee-mri-12/`; never use that payload against the
   production Supabase project.
3. Run validate-only against the preparation endpoint:

```js
const payload = {
  /* Paste the complete reviewed template contents here. */
};
const validateResponse = await fetch(
  "/api/admin/challenge-schema/prepare-answer-keys",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, write: false, overwrite: false }),
  },
);
console.log(validateResponse.status, await validateResponse.json());
```

4. Inspect only the safe aggregate response. Continue only when `ok` is
   `true`, `totalItems` equals the active challenge's public plus private report
   count, and `issues` is empty. Validate-only should report
   `insertedCount: 0` and `updatedCount: 0`.
5. Write the same reviewed payload once. Keep overwrite disabled for the first
   import:

```js
const writeResponse = await fetch(
  "/api/admin/challenge-schema/prepare-answer-keys",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, write: true, overwrite: false }),
  },
);
console.log(writeResponse.status, await writeResponse.json());
```

6. If matching twelve-field rows already exist, the write is rejected without
   changing the batch. Review the existing data before deliberately retrying
   with `overwrite: true`.
7. Check stored readiness with the separate validation endpoint:

```js
const readinessResponse = await fetch(
  "/api/admin/challenge-schema/validate",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modeId: "knee_mri_12_basic",
      schemaVersion: 1,
    }),
  },
);
console.log(readinessResponse.status, await readinessResponse.json());
```

8. Run the Supabase verification queries below. Do not activate the mode as
   part of this rehearsal.

Count stored twelve-field rows:

```sql
select count(*) as knee_mri_12_basic_answer_key_rows
from answer_keys
where mode_id = 'knee_mri_12_basic'
  and schema_version = 1;
```

Confirm there are no duplicate rows for a report/mode/version:

```sql
select report_id, mode_id, schema_version, count(*)
from answer_keys
where mode_id = 'knee_mri_12_basic'
  and schema_version = 1
group by report_id, mode_id, schema_version
having count(*) > 1;
```

Verify twelve-field public/private coverage for the active challenge without
selecting report text or answer values:

```sql
select
  r.split,
  count(*) as report_count,
  count(ak.id) as twelve_field_answer_key_count,
  count(*) filter (where ak.id is null) as missing_answer_key_count
from reports r
join challenges c
  on c.id = r.challenge_id
 and c.is_active = true
left join answer_keys ak
  on ak.report_id = r.id
 and ak.mode_id = 'knee_mri_12_basic'
 and ak.schema_version = 1
where r.split in ('public', 'private')
group by r.split
order by r.split;
```

Confirm the active six-field rows still exist:

```sql
select count(*) as knee_mri_6_basic_answer_key_rows
from answer_keys
where mode_id = 'knee_mri_6_basic'
  and schema_version = 1;
```

Review aggregate provenance without selecting answer values or adjudicator
details:

```sql
select mode_id, schema_version, provenance, count(*)
from answer_keys
group by mode_id, schema_version, provenance
order by mode_id, schema_version, provenance;
```

Confirm twelve-field clinical coverage by report split:

```sql
select
  r.split,
  count(*) as report_count,
  count(ak.id) filter (
    where ak.provenance = 'clinician_adjudicated'
  ) as clinician_adjudicated_count
from reports r
join challenges c
  on c.id = r.challenge_id
 and c.is_active = true
left join answer_keys ak
  on ak.report_id = r.id
 and ak.mode_id = 'knee_mri_12_basic'
 and ak.schema_version = 1
where r.split in ('public', 'private')
group by r.split
order by r.split;
```

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
