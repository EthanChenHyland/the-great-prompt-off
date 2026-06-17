import Link from "next/link";
import type { ReactNode } from "react";
import { AdminLoginForm } from "../components/AdminLoginForm";
import {
  AdminLogoutButton,
  AdminParticipantActions,
  AdminResetPanel,
} from "../components/AdminActions";
import { hasAdminSession } from "../lib/supabase/admin-auth";
import { getAdminDashboardData } from "../lib/supabase/admin-dashboard";

const adminBuildMarker = "admin-health-v1";

export default async function AdminPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  const data = await getAdminDashboardData();

  return (
    <main className="min-h-screen bg-[#f7f9f8] px-6 py-6 text-slate-950">
      <div className="mx-auto grid w-full max-w-[1500px] gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-teal-700">
              The Great Prompt-Off
            </Link>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950">
              Organizer dashboard
            </h1>
            <p className="mt-2 w-fit rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
              Build: {adminBuildMarker}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/admin/export/access-codes"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Export access codes CSV
            </a>
            <a
              href="/api/admin/export/results"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Export results CSV
            </a>
            <AdminLogoutButton />
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Participants" value={data.overview.totalParticipants} />
          <MetricCard
            label="With access codes"
            value={data.overview.participantsWithAccessCodes}
          />
          <MetricCard
            label="Test submissions"
            value={data.overview.testSubmissionsCount}
          />
          <MetricCard
            label="Final submissions"
            value={data.overview.finalSubmissionsCount}
          />
          <MetricCard
            label="Completed final"
            value={data.overview.participantsCompletedFinal}
          />
          <MetricCard
            label="Latest run"
            value={formatDate(data.overview.latestRunTimestamp)}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Health check
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Admin readiness
          </h2>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <HealthItem
              label="Supabase connected"
              value={data.health.supabaseConnected ? "Yes" : "No"}
            />
            <HealthItem
              label="USE_REAL_LLM"
              value={data.health.useRealLlm ? "true" : "false"}
            />
            <HealthItem label="OpenRouter model" value={data.health.openRouterModel} />
            <HealthItem
              label="Report split"
              value={`${data.health.reportCounts.public} public / ${data.health.reportCounts.private} private`}
            />
            <HealthItem
              label="Participants"
              value={String(data.health.participantCount)}
            />
            <HealthItem
              label="Test submissions"
              value={String(data.health.testSubmissionsCount)}
            />
            <HealthItem
              label="Final submissions"
              value={String(data.health.finalSubmissionsCount)}
            />
            <HealthItem
              label="Latest run"
              value={formatDate(data.health.latestRunTimestamp) || "-"}
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-5">
            <AdminTable
              title="Participants"
              columns={[
                "Participant",
                "Display name",
                "Email",
                "Access code",
                "Status",
                "Tests",
                "Final",
                "Latest test",
                "Best test",
                "Final score",
                "Actions",
              ]}
              rows={data.participants.map((participant) => [
                participant.participantCode,
                participant.displayName || "",
                participant.email || "",
                participant.accessCode,
                participant.isActive ? "Active" : "Inactive",
                String(participant.testAttemptsUsed),
                participant.finalSubmitted ? "Yes" : "No",
                score(participant.latestTestScore),
                score(participant.bestTestScore),
                score(participant.finalScore),
                <AdminParticipantActions
                  key={participant.participantCode}
                  isActive={participant.isActive}
                  participantCode={participant.participantCode}
                />,
              ])}
            />
            <AdminTable
              title="Results"
              columns={[
                "Participant",
                "Display name",
                "Email",
                "Best test",
                "Latest test",
                "Final score",
                "Final submitted",
                "Final model",
              ]}
              rows={data.leaderboard.map((participant) => [
                participant.participantCode,
                participant.displayName || "",
                participant.email || "",
                score(participant.bestTestScore),
                score(participant.latestTestScore),
                score(participant.finalScore),
                formatDate(participant.finalSubmittedAt),
                participant.finalModelName || "",
              ])}
            />
          </div>
          <AdminResetPanel />
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function HealthItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function AdminTable({
  columns,
  rows,
  title,
}: {
  columns: string[];
  rows: ReactNode[][];
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-3">
                    {cell || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function score(value: number | null) {
  return value === null ? "" : `${Math.round(value)}%`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
