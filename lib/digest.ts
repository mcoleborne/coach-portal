import type { SupabaseClient } from "@supabase/supabase-js";
import { decideDigest } from "./digest-rule";
import { recipientAllowed, type EmailSender } from "./email";
import { formatDue } from "./time/sydney";

export type DigestOutcome = {
  engagement_id: string;
  result: "sent" | "outside_window" | "already_sent_today" | "nothing_new" | "no_coach" | "recipient_not_allowed" | "failed";
  cards?: number;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * At most one digest a day per engagement, to the coach, when cards were
 * published since the last digest. The digest_log row for the Sydney date is
 * written before sending, and its primary key stops a second send that day.
 * If the send fails the row is removed so a later call can try again.
 */
export async function runDigest(opts: {
  admin: SupabaseClient;
  sender: EmailSender;
  appUrl: string;
  replyTo?: string;
  now?: Date;
  ignoreWindow?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<DigestOutcome[]> {
  const { admin, sender, appUrl } = opts;
  const now = opts.now ?? new Date();
  const out: DigestOutcome[] = [];
  const { data: engagements } = await admin.from("engagements").select("id, name, client_name, coach_user_id");

  for (const eng of engagements ?? []) {
    const { data: last } = await admin
      .from("digest_log")
      .select("sent_on, sent_at")
      .eq("engagement_id", eng.id)
      .order("sent_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    let cardsQuery = admin
      .from("cards")
      .select("id, title, question, due_at, size, published_at")
      .eq("engagement_id", eng.id)
      .in("status", ["awaiting_coach", "question_back"])
      .lte("published_at", now.toISOString())
      .order("published_at");
    if (last?.sent_at) cardsQuery = cardsQuery.gt("published_at", last.sent_at);
    const { data: fresh } = await cardsQuery;
    const cards = fresh ?? [];

    const decision = decideDigest({
      now,
      lastSentOn: (last?.sent_on as string | undefined) ?? null,
      publishedSinceLastDigest: cards.length,
      ignoreWindow: opts.ignoreWindow,
    });
    if (!decision.send) {
      out.push({ engagement_id: eng.id, result: decision.reason });
      continue;
    }
    if (!eng.coach_user_id) {
      out.push({ engagement_id: eng.id, result: "no_coach" });
      continue;
    }
    const { data: coach } = await admin.auth.admin.getUserById(eng.coach_user_id);
    const to = coach.user?.email;
    if (!to) {
      out.push({ engagement_id: eng.id, result: "no_coach" });
      continue;
    }
    if (!recipientAllowed(to, opts.env)) {
      out.push({ engagement_id: eng.id, result: "recipient_not_allowed" });
      continue;
    }
    const { data: people } = await admin.from("members").select("user_id, role, display_name").eq("engagement_id", eng.id);
    const member = people?.find((p) => p.user_id === eng.coach_user_id);
    const owner = (people?.find((p) => p.role === "owner")?.display_name as string | undefined) ?? "the owner";

    // Claim the day first. A concurrent call hits the primary key and stops here.
    const { error: claimErr } = await admin
      .from("digest_log")
      .insert({ engagement_id: eng.id, sent_on: decision.sentOn, sent_at: now.toISOString(), card_count: cards.length });
    if (claimErr) {
      out.push({ engagement_id: eng.id, result: "already_sent_today" });
      continue;
    }

    const name = (member?.display_name as string | undefined) ?? "there";
    const where = (eng.client_name as string | null) ?? (eng.name as string);
    const n = cards.length;
    const subject = `${where}: ${n} new ${n === 1 ? "card" : "cards"} to review`;
    const lines = cards.map((c) => {
      const due = c.due_at ? `, due ${formatDue(new Date(c.due_at), now)}` : "";
      const size = c.size === "large" ? ", large review" : "";
      return { text: `- ${c.title}${size}${due}\n  ${c.question}\n  ${appUrl}/cards/${c.id}`, html: `<li><a href="${appUrl}/cards/${c.id}">${escapeHtml(c.title)}</a>${escapeHtml(size + due)}<br>${escapeHtml(c.question)}</li>` };
    });
    const text = [
      `Hi ${name},`,
      "",
      `${n === 1 ? "A new card is" : `${n} new cards are`} waiting in the ${where} coach portal:`,
      "",
      ...lines.map((l) => l.text),
      "",
      `Open the portal: ${appUrl}`,
      "",
      `Reply to this email if it is easier. Your reply reaches ${owner} and Claude files it against the card.`,
    ].join("\n");
    const html = `<p>Hi ${escapeHtml(name)},</p><p>${n === 1 ? "A new card is" : `${n} new cards are`} waiting in the ${escapeHtml(where)} coach portal:</p><ul>${lines.map((l) => l.html).join("")}</ul><p><a href="${appUrl}">Open the portal</a></p><p style="color:#5c5c58">Reply to this email if it is easier. Your reply reaches ${escapeHtml(owner)} and Claude files it against the card.</p>`;

    try {
      await sender.send({ to, subject, text, html, replyTo: opts.replyTo });
      out.push({ engagement_id: eng.id, result: "sent", cards: n });
    } catch {
      await admin.from("digest_log").delete().eq("engagement_id", eng.id).eq("sent_on", decision.sentOn);
      out.push({ engagement_id: eng.id, result: "failed" });
    }
  }
  return out;
}
