import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { createFiberyWriter, fiberyConfigFromEnv, missingFiberyConfig } from "@/lib/intake/fibery";
import { processIntake } from "@/lib/intake/process";
import { createRoutineFirer, routineConfigFromEnv } from "@/lib/intake/routine";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The intake filing route. Called by the database webhook on every intake
 * event and by the 15-minute schedule. It takes no input: it files whatever is
 * pending, so a stray call can only file what was already waiting.
 */
async function handle() {
  const fibery = fiberyConfigFromEnv();
  if (!hasAdminKey() || !fibery) {
    const missing = [...(hasAdminKey() ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]), ...missingFiberyConfig()];
    return NextResponse.json({ ok: false, error: "not_configured", missing }, { status: 503 });
  }
  const routineCfg = routineConfigFromEnv();
  const result = await processIntake({
    admin: createAdminClient(),
    fibery: createFiberyWriter(fibery),
    routine: routineCfg ? createRoutineFirer(routineCfg) : null,
    appUrl: appUrl(),
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST() {
  try {
    return await handle();
  } catch {
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}

export const GET = POST;
