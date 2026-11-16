import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Action, Decision, Session } from "./types";

export type Week = {
  next: Session | null;
  last: Session | null;
  lastActions: Action[];
  sessions: Session[];
  decisions: Decision[];
};

/** The next session (still to come or under way), the last held one and its actions. */
export async function loadWeek(supabase: SupabaseClient, engagementId: string, now = new Date()): Promise<Week> {
  const [{ data: sessions }, { data: decisions }] = await Promise.all([
    supabase.from("sessions").select("*").eq("engagement_id", engagementId).order("starts_at", { ascending: true }),
    supabase
      .from("decisions")
      .select("id, card_id, session_id, question, coach_view, decision, decided_at")
      .eq("engagement_id", engagementId)
      .order("decided_at", { ascending: false }),
  ]);
  const all = (sessions ?? []) as Session[];
  const next =
    all.find(
      (s) =>
        (s.status === "scheduled" || s.status === "reschedule_requested") &&
        new Date(s.starts_at).getTime() + s.duration_min * 60_000 > now.getTime(),
    ) ?? null;
  const last = [...all].reverse().find((s) => s.status === "held" && new Date(s.starts_at) <= now) ?? null;
  let lastActions: Action[] = [];
  if (last) {
    const { data } = await supabase
      .from("actions")
      .select("id, session_id, owner_role, text, done_at")
      .eq("session_id", last.id)
      .order("created_at");
    lastActions = (data ?? []) as Action[];
  }
  return { next, last, lastActions, sessions: all, decisions: (decisions ?? []) as Decision[] };
}
