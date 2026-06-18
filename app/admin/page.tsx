import { AdminLoginForm } from "../components/AdminLoginForm";
import { AdminAutoRefresh } from "../components/AdminAutoRefresh";
import {
  AdminEventAnnouncementControls,
  AdminEventControls,
  AdminEventTimerControls,
  AdminLeaderboardVisibilityControls,
  AdminLogoutButton,
  AdminResetPanel,
} from "../components/AdminActions";
import {
  AdminHeader,
  AdminNavigationCards,
  AdminPageFrame,
  AdminSectionNav,
  formatDate,
  HealthItem,
  MetricCard,
  score,
} from "../components/AdminLayout";
import { AdminProgressMonitor } from "../components/AdminProgressMonitor";
import { hasAdminSession } from "../lib/supabase/admin-auth";
import { getAdminDashboardData } from "../lib/supabase/admin-dashboard";

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
    <AdminPageFrame>
      <AdminHeader
        title="Organizer dashboard"
        subtitle="Command center for event readiness, exports, and admin tools."
        actions={
          <>
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
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin" />
        <AdminAutoRefresh intervalSeconds={15} />
      </div>

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

      <AdminNavigationCards />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Active participants"
          value={data.progressSummary.activeParticipants}
        />
        <MetricCard
          label="With test attempt"
          value={data.progressSummary.participantsWithTestAttempt}
        />
        <MetricCard
          label="Final submitted"
          value={data.progressSummary.participantsWithFinalSubmitted}
        />
        <MetricCard
          label="No activity"
          value={data.progressSummary.participantsWithNoActivity}
        />
        <MetricCard
          label="Average final"
          value={score(data.progressSummary.averageFinalScore) || "-"}
        />
        <MetricCard
          label="Best final"
          value={score(data.progressSummary.bestFinalScore) || "-"}
        />
      </section>

      <div className="grid gap-3">
        {data.progressSummary.participantsWithTestAttempt === 0 &&
        data.progressSummary.participantsWithFinalSubmitted === 0 ? (
          <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 shadow-sm">
            No participant run activity yet. This monitor will update as
            participants submit Test Attempts and Final Submissions.
          </p>
        ) : null}
        <AdminProgressMonitor participants={data.participants} />
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Health check
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Admin readiness
          </h2>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
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
        </div>
        <div className="grid gap-5">
          <AdminEventControls currentPhase={data.overview.eventPhase} />
          <AdminEventAnnouncementControls
            currentAnnouncement={data.overview.eventAnnouncement}
          />
          <AdminEventTimerControls
            currentEndsAt={data.overview.eventTimerEndsAt}
            currentLabel={data.overview.eventTimerLabel}
          />
          <AdminLeaderboardVisibilityControls
            currentVisibility={data.overview.leaderboardVisibility}
          />
          <AdminResetPanel />
        </div>
      </section>
    </AdminPageFrame>
  );
}
