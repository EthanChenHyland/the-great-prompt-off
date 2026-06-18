import { AdminLoginForm } from "../../components/AdminLoginForm";
import {
  AdminHeader,
  AdminPageFrame,
  AdminSectionNav,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";

const helpSections = [
  {
    title: "Event-day workflow",
    items: [
      "Run the demo checklist before participants arrive.",
      "Confirm the health check is green and export access codes.",
      "Reset workshop run data before the real event starts.",
      "Export results after the event for scoring and archive.",
    ],
  },
  {
    title: "Access codes",
    items: [
      "Participants enter unique access codes on the home page.",
      "The participant-facing UI shows friendly labels like P001, not secret codes.",
      "Use Participants to edit names/emails, regenerate one code, or deactivate/reactivate a participant.",
    ],
  },
  {
    title: "Admin Health Check expected values",
    items: [
      "Supabase connected: Yes.",
      "USE_REAL_LLM: true for production events.",
      "Report split: 5 public / 45 private.",
      "Participants: 50 unless the workshop roster changed.",
      "Test and Final submissions should be 0 before the real event.",
    ],
  },
  {
    title: "Participant management",
    items: [
      "Participant edits preserve access codes, run history, reports, answer keys, and challenges.",
      "Clear one participant only when intentionally resetting that participant's attempts and final submission.",
      "Deactivated participants cannot log in or submit, but their existing data remains stored.",
    ],
  },
  {
    title: "Results/export workflow",
    items: [
      "Results ranks prefer final score when available.",
      "Exports are admin-only and do not expose answer keys or private report text.",
      "Use the results CSV after the event for scoring and archival review.",
    ],
  },
  {
    title: "Case Manager usage",
    items: [
      "Use Cases for small live report or answer-key fixes.",
      "Report text and answer-key labels are admin-only.",
      "Deleting cases with run history is blocked to protect existing results.",
    ],
  },
  {
    title: "File-based report import",
    items: [
      "Use REPORT_IMPORT_GUIDE.md for bulk additions or larger dataset revisions.",
      "File-based import remains safer than live editing for coordinated report set changes.",
      "Changing public/private counts may require participant-facing text and documentation updates.",
    ],
  },
  {
    title: "Resetting workshop data",
    items: [
      "The full reset deletes prompt run items, submissions, prompt runs, and extra Test Attempt grants.",
      "The reset preserves participants, access codes, reports, answer keys, and challenges.",
      "Atomic reset functions should exist in Supabase before relying on reset tools.",
    ],
  },
  {
    title: "OpenRouter / real LLM notes",
    items: [
      "Real evaluation uses server-side OpenRouter calls; keys are never exposed to the frontend.",
      "Test Attempts evaluate 5 public reports.",
      "Final Submission evaluates 45 hidden private reports and may take longer.",
      "OPENROUTER_CONCURRENCY controls how many report evaluations run at once.",
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      "Vercel environment variable changes require a redeploy.",
      "If health check counts look wrong, verify the Supabase seed and report split SQL.",
      "If reset fails, verify supabase/admin-atomic-clears.sql was run in the correct project.",
      "If real LLM runs fail, check OpenRouter key, model, quota, and concurrency.",
    ],
  },
];

export default async function AdminHelpPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  return (
    <AdminPageFrame>
      <AdminHeader
        backHref="/admin"
        title="Organizer Help"
        subtitle="Quick admin reference for running and troubleshooting a workshop."
      />

      <AdminSectionNav currentHref="/admin/help" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Documentation
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Project docs
        </h2>
        <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
          <p>
            <span className="font-semibold text-slate-800">README.md</span>{" "}
            covers full setup, deployment, security, and project overview.
          </p>
          <p>
            <span className="font-semibold text-slate-800">
              REPORT_IMPORT_GUIDE.md
            </span>{" "}
            explains adding and importing synthetic reports.
          </p>
          <p>
            <span className="font-semibold text-slate-800">
              DEMO_CHECKLIST.md
            </span>{" "}
            is the event-day readiness checklist.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {helpSections.map((section) => (
          <article
            key={section.title}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-950">
              {section.title}
            </h2>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </AdminPageFrame>
  );
}
