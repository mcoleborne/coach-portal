"use client";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { useState } from "react";

/**
 * Requests an emailed sign-in link. The link uses the implicit flow so it
 * works when it is opened on a different device or browser from the one that
 * asked for it (ask on the laptop, tap the link on the phone).
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createPlainClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    // Do not reveal whether an address has access. Only a rate limit is shown.
    if (error && error.status === 429) {
      setState("error");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <section className="panel flex flex-col gap-3" aria-live="polite">
        <h2 className="m-0 text-lg font-bold">Check your email</h2>
        <p className="m-0 text-sm leading-relaxed">
          If <strong>{email}</strong> has access, a sign-in link is on its way. Tap it on this phone or computer and
          you stay signed in on that device for 30 days.
        </p>
        <button type="button" className="btn-quiet self-start" onClick={() => setState("idle")}>
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          className="field min-h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary min-h-12 text-base" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Email me a sign-in link"}
      </button>
      {state === "error" ? (
        <p role="alert" className="m-0 text-sm text-warn-ink">
          Too many links asked for just now. Wait a minute and try again.
        </p>
      ) : null}
      <p className="m-0 text-sm leading-relaxed text-muted">
        No password and no Claude account. Tap the link in the email and you stay signed in on this device for 30
        days.
      </p>
    </form>
  );
}
