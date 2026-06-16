import {
  fallbackLeaderboard,
  getSupabaseLeaderboard,
} from "@/app/lib/supabase/submission-workflow";

export async function GET() {
  try {
    return Response.json(await getSupabaseLeaderboard());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(fallbackLeaderboard(message));
  }
}
