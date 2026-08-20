import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createSupabaseAdminClient } from "@/app/lib/supabase/admin";
import { prepareAdminAnswerKeyImport } from "@/app/lib/supabase/admin-challenge-schema-route";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);

  try {
    const result = await prepareAdminAnswerKeyImport(
      createSupabaseAdminClient(),
      payload,
    );
    return Response.json({ ...result, writesPerformed: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare answer-key import.";
    const safeMessage =
      message.includes("challenge mode") ||
      message.includes("schema version") ||
      message.includes("preparation path") ||
      message.includes("answer key") ||
      message.includes("import")
        ? message
        : "Could not prepare answer-key import.";
    if (safeMessage === "Could not prepare answer-key import.") {
      console.error("[admin-answer-key-preparation] Preparation failed", message);
    }
    return Response.json({ error: safeMessage }, { status: safeMessage === message ? 400 : 500 });
  }
}

