import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card } from "./types";

const CARD_COLUMNS =
  "id, engagement_id, title, question, context_md, document_md, document_pdf_path, options, recommendation_md, size, due_at, status, fibery_ref, published_at, opened_at, answered_at, actioned_at";

export async function listCards(supabase: SupabaseClient, engagementId: string): Promise<Card[]> {
  const { data } = await supabase
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("engagement_id", engagementId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("published_at", { ascending: false });
  return (data ?? []) as Card[];
}

export async function getCard(supabase: SupabaseClient, id: string): Promise<Card | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("cards").select(CARD_COLUMNS).eq("id", id).maybeSingle();
  return (data as Card | null) ?? null;
}

export async function memberNames(supabase: SupabaseClient, engagementId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from("members").select("user_id, display_name").eq("engagement_id", engagementId);
  return Object.fromEntries((data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
}
