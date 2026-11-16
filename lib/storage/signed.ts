import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNED_URL_SECONDS, UPLOAD_BUCKET } from "./paths";

/** Expiring links for private objects, signed as the viewer so storage RLS applies. */
export async function signPaths(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}
