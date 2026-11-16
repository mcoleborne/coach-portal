import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseUrl } from "@/lib/env";

export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days on this device

/** A client acting as the signed-in person. Row-level security applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookieOptions: { maxAge: SESSION_COOKIE_MAX_AGE },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  });
}
