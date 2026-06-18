import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { updateActiveChallengeAnnouncement } from "@/app/lib/supabase/admin-dashboard";

const maxAnnouncementLength = 240;

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const announcement =
    typeof body?.announcement === "string" ? body.announcement.trim() : null;

  if (announcement === null) {
    return Response.json(
      { error: "Expected announcement string." },
      { status: 400 },
    );
  }

  if (announcement.length > maxAnnouncementLength) {
    return Response.json(
      { error: `Announcement must be ${maxAnnouncementLength} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    await updateActiveChallengeAnnouncement(announcement);

    return Response.json({ ok: true, eventAnnouncement: announcement });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update announcement.";

    return Response.json({ error: message }, { status: 500 });
  }
}
