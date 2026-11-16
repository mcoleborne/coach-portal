"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Lands the emailed link. Handles the implicit flow (tokens in the URL hash),
 * the PKCE flow (?code=) and a token-hash template (?token_hash=&type=), then
 * stores the session in cookies for this device.
 */
export function ConfirmClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const supabase = createClient();
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      let ok = false;
      if (hash.get("access_token") && hash.get("refresh_token")) {
        const { error } = await supabase.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        ok = !error;
      } else if (params.get("code")) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.get("code")!);
        ok = !error;
      } else if (params.get("token_hash")) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: params.get("token_hash")!,
          type: (params.get("type") ?? "email") as EmailOtpType,
        });
        ok = !error;
      }
      // Clear tokens from the address bar and history.
      window.history.replaceState(null, "", "/auth/confirm");
      if (ok) {
        router.replace("/");
        router.refresh();
      } else {
        setFailed(true);
      }
    })();
  }, [params, router]);

  if (failed) {
    return (
      <section className="panel flex flex-col gap-3">
        <h1 className="m-0 text-lg font-bold">That link did not work</h1>
        <p className="m-0 text-sm">It may have expired or already been used. Ask for a fresh one.</p>
        <a className="btn-primary self-start" href="/sign-in?reason=link-expired">
          Back to sign in
        </a>
      </section>
    );
  }
  return <p className="muted">Signing you in...</p>;
}
