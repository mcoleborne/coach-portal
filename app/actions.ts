"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Every person act goes through here and lands in the database, where one
 * shared trigger contract writes exactly one intake_events row per act in the
 * same transaction. No screen has a private intake path.
 */

export type ActResult = { ok: true; id?: string } | { ok: false; error: string };

const attachment = z.object({
  storage_path: z.string().min(3).max(500),
  file_name: z.string().max(300),
  mime_type: z.string().max(200),
  size_bytes: z.number().int().nonnegative(),
  kind: z.enum(["photo", "video", "pdf", "audio", "other"]),
});
const attachments = z.array(attachment).max(20);

function parseAttachments(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== "string" || raw === "") return [];
  return attachments.parse(JSON.parse(raw));
}

function fail(e: unknown): ActResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form and try again." };
  const message = e instanceof Error ? e.message : "Something went wrong";
  return { ok: false, error: message.slice(0, 200) };
}

export async function recordConsent(form: FormData) {
  const supabase = await createClient();
  const engagementId = z.uuid().parse(form.get("engagement_id"));
  const { error } = await supabase.rpc("record_consent", {
    p_engagement: engagementId,
    p_consent: form.get("consent") === "yes",
  });
  if (error) throw new Error("Could not save your answer. Try again.");
  redirect("/");
}

export async function submitAnswer(_prev: ActResult | null, form: FormData): Promise<ActResult> {
  try {
    const cardId = z.uuid().parse(form.get("card_id"));
    const optionKey = z.string().min(1).max(40).parse(form.get("option_key"));
    const reasoning = z.string().max(20000).parse(form.get("reasoning") ?? "");
    const files = parseAttachments(form.get("attachments"));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_answer", {
      p_card_id: cardId,
      p_option_key: optionKey,
      p_reasoning: reasoning,
      p_attachments: files,
    });
    if (error) return { ok: false, error: "Could not send your answer. Try again." };
    revalidatePath(`/cards/${cardId}`);
    revalidatePath("/");
    return { ok: true, id: data as string };
  } catch (e) {
    return fail(e);
  }
}

export async function askQuestionBack(_prev: ActResult | null, form: FormData): Promise<ActResult> {
  try {
    const cardId = z.uuid().parse(form.get("card_id"));
    const body = z.string().trim().min(1, "Write your question first").max(20000).parse(form.get("body"));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("comments")
      .insert({ card_id: cardId, author_id: user?.id, body_md: body, is_question_back: true });
    if (error) return { ok: false, error: "Could not send your question. Try again." };
    revalidatePath(`/cards/${cardId}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addComment(_prev: ActResult | null, form: FormData): Promise<ActResult> {
  try {
    const cardId = z.uuid().parse(form.get("card_id"));
    const body = z.string().trim().min(1, "Write a comment first").max(20000).parse(form.get("body"));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("comments").insert({ card_id: cardId, author_id: user?.id, body_md: body });
    if (error) return { ok: false, error: "Could not post your comment. Try again." };
    revalidatePath(`/cards/${cardId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Material added outside an answer: general drop zone, or attached to a card. */
export async function recordUploads(input: {
  engagementId: string;
  cardId?: string | null;
  files: z.infer<typeof attachments>;
}): Promise<ActResult> {
  try {
    const engagementId = z.uuid().parse(input.engagementId);
    const cardId = input.cardId ? z.uuid().parse(input.cardId) : null;
    const files = attachments.min(1).parse(input.files);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rows = files.map((f) => ({ ...f, engagement_id: engagementId, card_id: cardId, author_id: user?.id }));
    const { error } = await supabase.from("uploads").insert(rows);
    if (error) return { ok: false, error: "Could not save the upload. Try again." };
    revalidatePath("/");
    revalidatePath("/log");
    if (cardId) revalidatePath(`/cards/${cardId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function raiseItem(_prev: ActResult | null, form: FormData): Promise<ActResult> {
  try {
    const engagementId = z.uuid().parse(form.get("engagement_id"));
    const kind = z
      .enum(["risk", "supplier_tip", "idea", "question"], { error: "Pick what kind of thing it is" })
      .parse(form.get("kind"));
    const body = z.string().trim().min(1, "Say what you noticed").max(20000).parse(form.get("body"));
    const files = parseAttachments(form.get("attachments"));
    const supabase = await createClient();
    const { error } = await supabase.rpc("raise_item", {
      p_engagement: engagementId,
      p_kind: kind,
      p_body: body,
      p_add_to_agenda: form.get("add_to_agenda") === "yes",
      p_attachments: files,
    });
    if (error) return { ok: false, error: "Could not send it. Try again." };
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function tickAction(form: FormData) {
  const actionId = z.uuid().parse(form.get("action_id"));
  const supabase = await createClient();
  await supabase.rpc("tick_action", { p_action_id: actionId });
  revalidatePath("/");
}

export async function requestReschedule(_prev: ActResult | null, form: FormData): Promise<ActResult> {
  try {
    const sessionId = z.uuid().parse(form.get("session_id"));
    const note = z.string().max(2000).parse(form.get("note") ?? "");
    const supabase = await createClient();
    const { error } = await supabase.rpc("request_reschedule", { p_session_id: sessionId, p_note: note });
    if (error) return { ok: false, error: "Could not send the request. Try again." };
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
