import { createClient } from "@supabase/supabase-js";

function getRequiredPublicEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required to create the browser Supabase client. Add it to your environment before using Supabase from the frontend.`,
    );
  }

  return value;
}

export function createBrowserSupabaseClient() {
  const supabaseUrl = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getRequiredPublicEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );

  return createClient(supabaseUrl, supabaseAnonKey);
}
