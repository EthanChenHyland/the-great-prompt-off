import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createSupabaseAdminClient } from "@/app/lib/supabase/admin";
import { isApprovedEvaluationModel } from "@/app/lib/model-options";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const clear =
    typeof body === "object" && body !== null && "clear" in body && body.clear === true;

  let evaluationModel: string | null = null;

  if (!clear) {
    const model =
      typeof body === "object" && body !== null && "model" in body
        ? body.model
        : typeof body === "object" && body !== null && "evaluation_model" in body
          ? body.evaluation_model
          : null;

    if (typeof model !== "string") {
      return Response.json(
        { error: "Choose a model or clear the challenge override." },
        { status: 400 },
      );
    }

    if (!isApprovedEvaluationModel(model)) {
      return Response.json(
        { error: "Choose one of the approved evaluation models." },
        { status: 400 },
      );
    }

    evaluationModel = model;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("challenges")
      .update({ evaluation_model: evaluationModel })
      .eq("is_active", true)
      .select("evaluation_model")
      .single<{ evaluation_model: string | null }>();

    if (error) {
      console.error("[admin-evaluation-model] Update failed", error.message);
      return Response.json(
        { error: "Could not update the evaluation model. Verify the model migration is installed." },
        { status: 500 },
      );
    }

    return Response.json({ evaluationModel: data.evaluation_model });
  } catch (error) {
    console.error(
      "[admin-evaluation-model] Request failed",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      { error: "Could not update the evaluation model. Please try again." },
      { status: 500 },
    );
  }
}
