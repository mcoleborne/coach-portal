import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "@/lib/env";

/**
 * Service role client. Server only, bypasses row-level security. Used for
 * intake filing, the digest and Claude's write path, never for a person's view.
 */
export function createAdminClient(): SupabaseClient {
  const key = supabaseServiceKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function hasAdminKey(): boolean {
  return supabaseServiceKey() !== null;
}
