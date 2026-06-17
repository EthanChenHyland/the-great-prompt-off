import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
} from "@/app/lib/supabase/admin-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName, "", {
    ...adminSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
