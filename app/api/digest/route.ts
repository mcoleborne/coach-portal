import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest";
import { emailSenderFromEnv } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by pg_cron at 20:30 and 21:30 UTC. Sends only inside the 7:30am
 * Sydney window and only once a day per engagement, so a stray call sends
 * nothing extra.
 */
export async function POST() {
  if (!hasAdminKey()) return NextResponse.json({ ok: false, error: "not_configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 503 });
  const sender = emailSenderFromEnv();
  if (!sender) return NextResponse.json({ ok: false, error: "not_configured", missing: ["RESEND_API_KEY", "DIGEST_FROM"] }, { status: 503 });
  try {
    const outcomes = await runDigest({
      admin: createAdminClient(),
      sender,
      appUrl: appUrl(),
      replyTo: process.env.DIGEST_REPLY_TO || undefined,
    });
    return NextResponse.json({ ok: true, outcomes });
  } catch {
    return NextResponse.json({ ok: false, error: "digest_failed" }, { status: 500 });
  }
}

export const GET = POST;
