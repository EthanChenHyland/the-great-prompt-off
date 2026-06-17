import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { deleteAdminCase } from "@/app/lib/supabase/admin-cases";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      confirmationFilename?: unknown;
      reportId?: unknown;
    } | null;

    await deleteAdminCase({
      reportId: typeof body?.reportId === "string" ? body.reportId : "",
      confirmationFilename:
        typeof body?.confirmationFilename === "string"
          ? body.confirmationFilename
          : "",
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Case deletion failed." },
      { status: 400 },
    );
  }
}
