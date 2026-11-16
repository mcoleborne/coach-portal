import { timingSafeEqual, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { classifyOwnerCancellation } from "./hours";

/**
 * Claude's write path. A small JSON API, authenticated by a service token,
 * that lets Claude publish cards, sessions, agendas, summaries and decisions,
 * comment as "Claude for <owner>", write voice note transcripts, mark cards
 * actioned and mark intake events judged. Documented in the README.
 */

export function tokenMatches(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  // Compare digests so length differences leak nothing.
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type ApiResult = { status: number; body: unknown };

const uuid = z.uuid();
const option = z.object({ key: z.string().min(1).max(20), label: z.string().min(1).max(500) });
const iso = z.iso.datetime({ offset: true });

const cardCreate = z.object({
  engagement_id: uuid,
  title: z.string().min(1).max(300),
  question: z.string().min(1).max(2000),
  context_md: z.string().max(50_000).nullish(),
  document_md: z.string().max(500_000).nullish(),
  document_pdf_path: z.string().max(500).nullish(),
  options: z.array(option).max(10).default([]),
  recommendation_md: z.string().max(20_000).nullish(),
  size: z.enum(["standard", "large"]).default("standard"),
  due_at: iso.nullish(),
  fibery_ref: z.string().max(200).nullish(),
});
const cardPatch = cardCreate.omit({ engagement_id: true }).partial().extend({
  status: z.enum(["awaiting_coach", "question_back", "answered", "actioned"]).optional(),
});

const sessionCreate = z.object({
  engagement_id: uuid,
  number: z.number().int().positive().nullish(),
  starts_at: iso,
  duration_min: z.number().int().positive().max(600).default(60),
  call_url: z.url().nullish(),
  agenda_md: z.string().max(50_000).nullish(),
  summary_md: z.string().max(100_000).nullish(),
});
const sessionPatch = sessionCreate
  .omit({ engagement_id: true })
  .partial()
  .extend({
    status: z.enum(["scheduled", "held", "cancelled"]).optional(),
    // The owner cancelled or moved it. Inside 24 hours it counts as used.
    cancelled_by_owner_at: iso.optional(),
  });

const actionCreate = z.object({
  session_id: uuid,
  owner_role: z.enum(["owner", "coach"]),
  text: z.string().min(1).max(2000),
});
const decisionCreate = z.object({
  engagement_id: uuid,
  card_id: uuid.nullish(),
  session_id: uuid.nullish(),
  question: z.string().min(1).max(2000),
  coach_view: z.string().max(5000).nullish(),
  decision: z.string().min(1).max(5000),
  decided_at: iso.optional(),
  fibery_ref: z.string().max(200).nullish(),
});
const commentCreate = z.object({ card_id: uuid, body_md: z.string().min(1).max(20_000) });
const uploadPatch = z.object({ transcript_md: z.string().max(100_000) });
const intakePatch = z.object({ judged: z.literal(true) });
const memberCreate = z.object({
  engagement_id: uuid,
  email: z.email(),
  role: z.enum(["owner", "coach"]),
  display_name: z.string().min(1).max(100),
});

function ok(body: unknown, status = 200): ApiResult {
  return { status, body };
}
function bad(error: string, status = 400): ApiResult {
  return { status, body: { error } };
}
function dbError(e: { message: string } | null): ApiResult {
  return bad(`database: ${e?.message ?? "unknown"}`, 422);
}

export async function handleClaudeApi(
  admin: SupabaseClient,
  method: string,
  path: string[],
  body: unknown,
  query: URLSearchParams,
  now: Date = new Date(),
): Promise<ApiResult> {
  const [resource, id, extra] = path;
  if (extra) return bad("not found", 404);
  if (id && !uuid.safeParse(id).success) return bad("id must be a uuid");

  try {
    switch (`${method} ${resource}${id ? "/:id" : ""}`) {
      case "GET engagements": {
        const { data, error } = await admin.from("engagements").select("id, name, client_name, tier_by_month");
        return error ? dbError(error) : ok({ engagements: data });
      }
      case "PATCH engagements/:id": {
        const p = z.object({ tier_by_month: z.record(z.string().regex(/^\d{4}-\d{2}$/), z.enum(["owners_coach", "launch_intensive", "sounding_board"])) }).parse(body);
        const { data, error } = await admin.from("engagements").update(p).eq("id", id).select("id, tier_by_month").single();
        return error ? dbError(error) : ok({ engagement: data });
      }
      case "POST members": {
        const p = memberCreate.parse(body);
        // Creates the account without sending any email. Sign-in links are only
        // ever sent when the person asks for one on the sign-in page.
        let userId: string | null = null;
        const created = await admin.auth.admin.createUser({ email: p.email, email_confirm: true });
        if (created.data.user) userId = created.data.user.id;
        else {
          const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
          userId = list.users.find((u) => u.email?.toLowerCase() === p.email.toLowerCase())?.id ?? null;
        }
        if (!userId) return bad("could not create or find the user", 422);
        const { error } = await admin
          .from("members")
          .upsert({ engagement_id: p.engagement_id, user_id: userId, role: p.role, display_name: p.display_name });
        if (error) return dbError(error);
        const col = p.role === "coach" ? "coach_user_id" : "owner_user_id";
        await admin.from("engagements").update({ [col]: userId }).eq("id", p.engagement_id);
        return ok({ user_id: userId }, 201);
      }
      case "POST cards": {
        const p = cardCreate.parse(body);
        const { data, error } = await admin
          .from("cards")
          .insert({ ...p, status: "awaiting_coach", published_at: now.toISOString() })
          .select("id, status, published_at")
          .single();
        return error ? dbError(error) : ok({ card: data }, 201);
      }
      case "PATCH cards/:id": {
        const p = cardPatch.parse(body);
        const update: Record<string, unknown> = { ...p };
        if (p.status === "actioned") update.actioned_at = now.toISOString();
        const { data, error } = await admin.from("cards").update(update).eq("id", id).select("id, status").single();
        return error ? dbError(error) : ok({ card: data });
      }
      case "POST sessions": {
        const p = sessionCreate.parse(body);
        const { data, error } = await admin.from("sessions").insert(p).select("id, starts_at, status").single();
        return error ? dbError(error) : ok({ session: data }, 201);
      }
      case "PATCH sessions/:id": {
        const p = sessionPatch.parse(body);
        const { cancelled_by_owner_at, ...rest } = p;
        const update: Record<string, unknown> = { ...rest };
        if (cancelled_by_owner_at) {
          const { data: s, error } = await admin.from("sessions").select("starts_at").eq("id", id).single();
          if (error || !s) return dbError(error);
          update.status = classifyOwnerCancellation(new Date(s.starts_at), new Date(cancelled_by_owner_at));
          update.cancelled_at = cancelled_by_owner_at;
        }
        const { data, error } = await admin.from("sessions").update(update).eq("id", id).select("id, status").single();
        return error ? dbError(error) : ok({ session: data });
      }
      case "POST actions": {
        const p = actionCreate.parse(body);
        const { data, error } = await admin.from("actions").insert(p).select("id").single();
        return error ? dbError(error) : ok({ action: data }, 201);
      }
      case "POST decisions": {
        const p = decisionCreate.parse(body);
        const { data, error } = await admin.from("decisions").insert(p).select("id").single();
        return error ? dbError(error) : ok({ decision: data }, 201);
      }
      case "POST comments": {
        const p = commentCreate.parse(body);
        const { data, error } = await admin
          .from("comments")
          .insert({ ...p, author_kind: "claude", author_id: null })
          .select("id")
          .single();
        return error ? dbError(error) : ok({ comment: data }, 201);
      }
      case "PATCH uploads/:id": {
        const p = uploadPatch.parse(body);
        const { data, error } = await admin.from("uploads").update(p).eq("id", id).select("id").single();
        return error ? dbError(error) : ok({ upload: data });
      }
      case "GET intake-events": {
        const status = query.get("status") ?? "unjudged";
        const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 200);
        let q = admin
          .from("intake_events")
          .select("id, engagement_id, kind, entity_table, entity_id, actor_id, created_at, filed_at, attempts, last_error, fibery_ref, routine_fired_at, judged_at")
          .order("created_at")
          .limit(limit);
        if (status === "unjudged") q = q.is("judged_at", null);
        else if (status === "unfiled") q = q.is("filed_at", null);
        const { data, error } = await q;
        return error ? dbError(error) : ok({ events: data });
      }
      case "PATCH intake-events/:id": {
        intakePatch.parse(body);
        const { data, error } = await admin
          .from("intake_events")
          .update({ judged_at: now.toISOString() })
          .eq("id", id)
          .select("id, judged_at")
          .single();
        return error ? dbError(error) : ok({ event: data });
      }
      default:
        return bad("not found", 404);
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return bad(e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    }
    throw e;
  }
}
