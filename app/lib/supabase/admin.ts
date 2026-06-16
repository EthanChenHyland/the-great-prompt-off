import "server-only";

import { createClient } from "@supabase/supabase-js";

function getRequiredServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required to create the server/admin Supabase client. This value must stay server-only and must not use the NEXT_PUBLIC_ prefix.`,
    );
  }

  return value;
}

export function createSupabaseAdminClient() {
  const supabaseUrl = getRequiredServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
