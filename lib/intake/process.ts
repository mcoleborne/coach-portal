import type { SupabaseClient } from "@supabase/supabase-js";
import { describeEvent, type IntakeEvent } from "./describe";
import type { FiberyWriter } from "./fibery";
import { ROUTINE_DEBOUNCE_MS, type RoutineFirer } from "./routine";

export type ProcessResult = {
  leased: boolean;
  filed: number;
  failed: number;
  routine: "fired" | "debounced" | "not_configured" | "nothing_new" | "failed";
};

const BATCH = 20;
const LEASE_SECONDS = 50;

/** Keeps only a short, credential-free reason. Error text is ours, never a response body. */
export function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg
    .replace(/(token|bearer|authorization|apikey|api_key|secret)[^\s,;]*[\s:=]+\S+/gi, "$1 [removed]")
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, "[removed]")
    .slice(0, 300);
}

/**
 * Files every unfiled intake event to Fibery, one at a time, under a lease so
 * a webhook poke and the 15-minute retry never file concurrently. Then fires
 * the AG-095 routine once for whatever has been filed but not yet sent to it.
 */
export async function processIntake(opts: {
  admin: SupabaseClient;
  fibery: FiberyWriter;
  routine: RoutineFirer | null;
  appUrl: string;
  holder?: string;
  now?: () => Date;
  maxRounds?: number;
}): Promise<ProcessResult> {
  const { admin, fibery, routine, appUrl } = opts;
  const holder = opts.holder ?? crypto.randomUUID();
  const now = opts.now ?? (() => new Date());
  const result: ProcessResult = { leased: false, filed: 0, failed: 0, routine: "nothing_new" };

  const { data: leased, error: leaseErr } = await admin.rpc("acquire_intake_lease", {
    p_holder: holder,
    p_seconds: LEASE_SECONDS,
  });
  if (leaseErr) throw new Error(`lease: ${leaseErr.message}`);
  if (!leased) {
    result.routine = "debounced";
    return result;
  }
  result.leased = true;

  try {
    for (let round = 0; round < (opts.maxRounds ?? 10); round++) {
      const { data: events, error } = await admin.rpc("claim_intake_events", { p_limit: BATCH });
      if (error) throw new Error(`claim: ${error.message}`);
      // File in the order things happened. RETURNING does not keep claim order.
      const batch = ((events ?? []) as IntakeEvent[]).sort((x, y) => x.created_at.localeCompare(y.created_at));
      if (batch.length === 0) break;
      let filedThisRound = 0;
      for (const e of batch) {
        try {
          const filing = await describeEvent(admin, e, appUrl);
          await fibery.appendWikiLine(filing.wikiLine);
          let ref: string | null = null;
          if (filing.horizon) {
            const h = await fibery.createHorizon(filing.horizon);
            ref = h.publicId ? `H#${h.publicId}` : h.id;
          }
          await admin
            .from("intake_events")
            .update({ filed_at: now().toISOString(), fibery_ref: ref, last_error: null })
            .eq("id", e.id);
          result.filed++;
          filedThisRound++;
        } catch (err) {
          await admin
            .from("intake_events")
            .update({ attempts: e.attempts + 1, last_error: safeError(err) })
            .eq("id", e.id);
          result.failed++;
        }
      }
      // Failures wait for the next retry; only keep looping while making progress.
      if (filedThisRound === 0) break;
    }
  } finally {
    await admin.rpc("release_intake_lease", { p_holder: holder });
  }

  result.routine = await maybeFireRoutine(admin, routine, now());
  return result;
}

async function maybeFireRoutine(
  admin: SupabaseClient,
  routine: RoutineFirer | null,
  at: Date,
): Promise<ProcessResult["routine"]> {
  if (!routine) return "not_configured";
  const { data: pending } = await admin
    .from("intake_events")
    .select("id, kind, engagement_id")
    .not("filed_at", "is", null)
    .is("routine_fired_at", null)
    .is("judged_at", null)
    .order("created_at")
    .limit(100);
  if (!pending?.length) return "nothing_new";
  const since = new Date(at.getTime() - ROUTINE_DEBOUNCE_MS).toISOString();
  const { count } = await admin
    .from("intake_events")
    .select("id", { count: "exact", head: true })
    .gt("routine_fired_at", since);
  if ((count ?? 0) > 0) return "debounced";

  const text = [
    `Coach portal intake: ${pending.length} new event(s) filed and waiting for judgement.`,
    ...pending.map((p) => `${p.id} ${p.kind}`),
  ].join("\n");
  try {
    await routine.fire(text);
  } catch {
    return "failed";
  }
  await admin
    .from("intake_events")
    .update({ routine_fired_at: at.toISOString() })
    .in(
      "id",
      pending.map((p) => p.id),
    );
  return "fired";
}
