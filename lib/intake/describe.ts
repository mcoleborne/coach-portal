import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSydneyDateTime } from "@/lib/time/sydney";
import { RAISED_KIND_LABELS, UPLOAD_KIND_LABELS } from "@/lib/labels";
import type { RaisedKind, UploadKind } from "@/lib/types";
import { toSubstrate, toSubstrateMd } from "./voice";

export type IntakeEvent = {
  id: string;
  engagement_id: string;
  kind:
    | "answer"
    | "comment"
    | "upload"
    | "voice_note"
    | "raised_item"
    | "question_back"
    | "action_ticked"
    | "reschedule_request";
  entity_table: string;
  entity_id: string;
  actor_id: string | null;
  created_at: string;
  attempts: number;
};

export type Filing = {
  wikiLine: string;
  horizon: { name: string; descriptionMd: string; source: string } | null;
};

/**
 * Turns one intake event into what is filed: one dated wiki line, and for a
 * question back or a reschedule request, a Horizons card for Matt.
 */
export async function describeEvent(admin: SupabaseClient, e: IntakeEvent, appUrl: string): Promise<Filing> {
  const [{ data: engagement }, { data: actor }] = await Promise.all([
    admin.from("engagements").select("name").eq("id", e.engagement_id).single(),
    e.actor_id
      ? admin.from("members").select("display_name").eq("engagement_id", e.engagement_id).eq("user_id", e.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const who = (actor?.display_name as string | undefined) ?? "The coach";
  const when = formatSydneyDateTime(new Date(e.created_at));
  const ref = `Coach portal event ${e.id.slice(0, 8)}`;

  async function cardTitle(cardId: string | null): Promise<{ title: string; link: string } | null> {
    if (!cardId) return null;
    const { data } = await admin.from("cards").select("title").eq("id", cardId).maybeSingle();
    return data ? { title: data.title as string, link: `${appUrl}/cards/${cardId}` } : null;
  }

  let what = "";
  let horizon: Filing["horizon"] = null;

  switch (e.kind) {
    case "answer": {
      const { data: a } = await admin.from("answers").select("card_id, option_key, reasoning_md").eq("id", e.entity_id).single();
      const card = await cardTitle(a?.card_id ?? null);
      const { data: c } = await admin.from("cards").select("options").eq("id", a?.card_id).single();
      const opt = (c?.options as { key: string; label: string }[] | undefined)?.find((o) => o.key === a?.option_key);
      const choice = a?.option_key === "other" ? "something else" : `${a?.option_key}${opt ? `, ${opt.label}` : ""}`;
      what = `${who} answered "${card?.title ?? "a card"}": ${choice}.${a?.reasoning_md ? ` Reasoning: ${a.reasoning_md}` : ""} ${card?.link ?? ""}`;
      break;
    }
    case "comment":
    case "question_back": {
      const { data: c } = await admin.from("comments").select("card_id, body_md").eq("id", e.entity_id).single();
      const card = await cardTitle(c?.card_id ?? null);
      if (e.kind === "comment") {
        what = `${who} commented on "${card?.title ?? "a card"}": ${c?.body_md ?? ""} ${card?.link ?? ""}`;
      } else {
        what = `${who} sent a question back to Matt on "${card?.title ?? "a card"}": ${c?.body_md ?? ""} ${card?.link ?? ""}`;
        horizon = {
          name: toSubstrate(`Coach question back: ${card?.title ?? "a card"}`, 200),
          descriptionMd: toSubstrateMd(
            [
              `${who} sent a question back from the coach portal on ${when}.`,
              "",
              `**Card:** ${card?.title ?? "a card"}`,
              "",
              `**Question:** ${c?.body_md ?? ""}`,
              "",
              `Answer it in the portal as a comment on the card: ${card?.link ?? appUrl}`,
              "",
              `Source: ${ref}, engagement ${engagement?.name ?? e.engagement_id}.`,
            ].join("\n"),
          ),
          source: ref,
        };
      }
      break;
    }
    case "upload":
    case "voice_note": {
      const { data: u } = await admin
        .from("uploads")
        .select("card_id, file_name, kind, raised_item_id, answer_id")
        .eq("id", e.entity_id)
        .single();
      const card = await cardTitle(u?.card_id ?? null);
      const label = UPLOAD_KIND_LABELS[(u?.kind as UploadKind) ?? "other"].toLowerCase();
      const where = card ? ` on "${card.title}"` : u?.raised_item_id ? " with a raised item" : " to the general uploads";
      what = `${who} added a ${label}${where}: ${u?.file_name ?? "file"}.${e.kind === "voice_note" ? " Transcript to follow." : ""} ${card?.link ?? `${appUrl}/log`}`;
      break;
    }
    case "raised_item": {
      const { data: r } = await admin.from("raised_items").select("kind, body_md, add_to_agenda").eq("id", e.entity_id).single();
      const kind = RAISED_KIND_LABELS[(r?.kind as RaisedKind) ?? "idea"].toLowerCase();
      what = `${who} raised a ${kind}: ${r?.body_md ?? ""}${r?.add_to_agenda ? " Asked for it on this week's agenda." : ""}`;
      break;
    }
    case "action_ticked": {
      const { data: a } = await admin.from("actions").select("text").eq("id", e.entity_id).single();
      what = `${who} ticked an action done: ${a?.text ?? ""}`;
      break;
    }
    case "reschedule_request": {
      const { data: s } = await admin
        .from("sessions")
        .select("number, starts_at, reschedule_note")
        .eq("id", e.entity_id)
        .single();
      const session = s ? `Session ${s.number ?? ""} on ${formatSydneyDateTime(new Date(s.starts_at))}`.replace("  ", " ") : "a session";
      what = `${who} asked to reschedule ${session}.${s?.reschedule_note ? ` Note: ${s.reschedule_note}` : ""}`;
      horizon = {
        name: toSubstrate(`Coach reschedule request: ${session}`, 200),
        descriptionMd: toSubstrateMd(
          [
            `${who} asked to reschedule ${session} from the coach portal on ${when}.`,
            "",
            s?.reschedule_note ? `**Note:** ${s.reschedule_note}` : "No note given.",
            "",
            "If Matt moves a session with less than 24 hours' notice, it counts as used.",
            "",
            `Source: ${ref}, engagement ${engagement?.name ?? e.engagement_id}. ${appUrl}`,
          ].join("\n"),
        ),
        source: ref,
      };
      break;
    }
  }

  return { wikiLine: `- ${toSubstrate(`${when}. ${what.trim()} (${ref})`, 900)}`, horizon };
}
