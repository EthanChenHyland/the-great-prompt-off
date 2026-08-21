import type { AdminModeReadiness as AdminModeReadinessRow } from "@/app/lib/supabase/admin-challenge-schema";

const activationLabels: Record<
  AdminModeReadinessRow["activationStatus"],
  string
> = {
  active: "Active",
  allowlisted: "Allowlisted",
  dormant: "Dormant",
};

function statusClasses(status: AdminModeReadinessRow["statusMessage"]) {
  switch (status) {
    case "Active mode":
    case "Ready for activation":
      return "bg-emerald-50 text-emerald-800";
    case "Missing answer keys":
      return "bg-amber-50 text-amber-800";
    case "Validation failed":
      return "bg-rose-50 text-rose-800";
    case "Dormant / not allowlisted":
      return "bg-slate-100 text-slate-700";
  }
}

export function AdminModeReadiness({
  modes,
  configurationLocked,
}: {
  modes: readonly AdminModeReadinessRow[];
  configurationLocked: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Mode readiness
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Can this mode be safely activated yet?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Readiness validates version-matched answer keys for every public and
            private report. Activation also requires an allowlisted mode and an
            unlocked challenge configuration.
          </p>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
            configurationLocked
              ? "bg-amber-50 text-amber-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          Configuration {configurationLocked ? "locked" : "unlocked"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Mode</th>
              <th className="px-4 py-3">Activation</th>
              <th className="px-4 py-3">Schema</th>
              <th className="px-4 py-3">Reports</th>
              <th className="px-4 py-3">Answer keys</th>
              <th className="px-4 py-3">Validation</th>
              <th className="px-5 py-3">Readiness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {modes.map((mode) => {
              const totalReports = mode.publicReportCount + mode.privateReportCount;

              return (
                <tr key={`${mode.modeId}:${mode.schemaVersion}`} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{mode.title}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {mode.modeId}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {activationLabels[mode.activationStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p>Version {mode.schemaVersion}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {mode.fieldCount} fields
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p>{mode.publicReportCount} public</p>
                    <p className="mt-1">{mode.privateReportCount} private</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold text-slate-900">
                      {mode.answerKeyCoverageCount} / {totalReports}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {mode.missingAnswerKeyCount} missing
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`font-semibold ${
                        mode.validationPasses ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {mode.validationPasses ? "Pass" : "Fail"}
                    </span>
                    {mode.issues.length > 0 ? (
                      <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">
                        {mode.issues.map((issue) => `${issue.count}: ${issue.message}`).join(" ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(
                        mode.statusMessage,
                      )}`}
                    >
                      {mode.statusMessage}
                    </span>
                    {mode.provenanceNotice ? (
                      <p className="mt-2 max-w-72 text-xs leading-5 text-amber-800">
                        {mode.provenanceNotice}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
