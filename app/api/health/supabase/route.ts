import { createSupabaseAdminClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ChallengeHealthRow = {
  id: string;
  slug: string;
  title: string;
};

export async function GET(request: Request) {
  const checkedAt = new Date().toISOString();
  const keepaliveSecret = process.env.KEEPALIVE_SECRET;

  if (keepaliveSecret) {
    const providedSecret = request.headers.get("x-keepalive-secret");
    const bearerToken = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (providedSecret !== keepaliveSecret && bearerToken !== keepaliveSecret) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized health check request.",
          checkedAt,
        },
        { status: 401 },
      );
    }
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("challenges")
      .select("id, slug, title")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ChallengeHealthRow>();

    if (error) {
      console.warn("Supabase health check failed.");

      return Response.json(
        {
          ok: false,
          source: "supabase",
          error: "Supabase health check failed.",
          checkedAt,
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: true,
      source: "supabase",
      checkedAt,
      activeChallenge: data
        ? {
            id: data.id,
            slug: data.slug,
            title: data.title,
          }
        : null,
    });
  } catch {
    console.warn("Supabase health check could not run.");

    return Response.json(
      {
        ok: false,
        source: "supabase",
        error: "Supabase health check could not run.",
        checkedAt,
      },
      { status: 503 },
    );
  }
}
