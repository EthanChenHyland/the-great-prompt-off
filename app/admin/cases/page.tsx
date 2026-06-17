import { AdminCaseManager } from "../../components/AdminCaseManager";
import { AdminLoginForm } from "../../components/AdminLoginForm";
import { AdminHeader, AdminPageFrame } from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";
import { getAdminCaseManagerData } from "../../lib/supabase/admin-cases";

export default async function AdminCasesPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  const caseData = await getAdminCaseManagerData();

  return (
    <AdminPageFrame>
      <AdminHeader
        backHref="/admin"
        title="Case Manager"
        subtitle="Admin-only live editing for synthetic reports and answer keys."
      />
      <AdminCaseManager data={caseData} />
    </AdminPageFrame>
  );
}
