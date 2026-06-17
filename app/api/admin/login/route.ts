import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isAdminSecretConfigured,
  verifyAdminSecret,
} from "@/app/lib/supabase/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    secret?: unknown;
  } | null;
  const secret = typeof body?.secret === "string" ? body.secret : "";

  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  if (!verifyAdminSecret(secret)) {
    return NextResponse.json({ error: "Incorrect admin secret." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    adminSessionCookieName,
    createAdminSessionToken(),
    adminSessionCookieOptions(),
  );

  return response;
}
