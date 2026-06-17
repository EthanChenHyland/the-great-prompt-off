import { AdminLoginForm } from "../../components/AdminLoginForm";
import { AdminAutoRefresh } from "../../components/AdminAutoRefresh";
import { AdminParticipantActions } from "../../components/AdminActions";
import {
  AdminHeader,
  AdminPageFrame,
  AdminSectionNav,
  AdminTable,
  score,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";
import { getAdminDashboardData } from "../../lib/supabase/admin-dashboard";

export default async function AdminParticipantsPage() {
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
        backHref="/admin"
        title="Participants"
        subtitle="Manage participant identity, access code status, activation, and participant-specific run clears."
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin/participants" />
        <AdminAutoRefresh />
      </div>

      <AdminTable
        title="Participant management"
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
            displayName={participant.displayName}
            email={participant.email}
            isActive={participant.isActive}
            participantCode={participant.participantCode}
          />,
        ])}
      />
    </AdminPageFrame>
  );
}
