import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, seedEngagement, signedInClient, type Seeded } from "../support/fixtures";

// Every table in the public schema that carries engagement data.
const TABLES = [
  "engagements",
  "members",
  "cards",
  "answers",
  "comments",
  "uploads",
  "raised_items",
  "sessions",
  "actions",
  "decisions",
  "intake_events",
  "digest_log",
] as const;

describe("row-level security: a second guest cannot read the first guest's rows", () => {
  let a: Seeded;
  let b: Seeded;
  let guestA: SupabaseClient;
  let guestB: SupabaseClient;

  beforeAll(async () => {
    a = await seedEngagement({ label: "rls-a" });
    b = await seedEngagement({ label: "rls-b" });
    guestA = await signedInClient(a.coachEmail);
    guestB = await signedInClient(b.coachEmail);
    // Give engagement A a row in every table, written as guest A where a person can write.
    const { error } = await guestA.rpc("submit_answer", {
      p_card_id: a.cardIds[0],
      p_option_key: "C",
      p_reasoning: "Sample reasoning",
      p_attachments: [
        { storage_path: `${a.engagementId}/x/photo.jpg`, file_name: "photo.jpg", mime_type: "image/jpeg", size_bytes: 10, kind: "photo" },
      ],
    });
    expect(error).toBeNull();
    await guestA.from("comments").insert({ card_id: a.cardIds[1], author_id: a.coachId, body_md: "Sample comment" });
    await guestA.rpc("raise_item", { p_engagement: a.engagementId, p_kind: "idea", p_body: "Sample idea", p_add_to_agenda: false });
    await adminClient().from("digest_log").insert({ engagement_id: a.engagementId, sent_on: "2026-11-16", card_count: 1 });
  });

  it("the first guest can read their own rows in every table", async () => {
    for (const t of TABLES) {
      const { data, error } = await guestA.from(t).select("engagement_id").eq("engagement_id", a.engagementId);
      expect(error, t).toBeNull();
      expect(data!.length, `guest A should see rows in ${t}`).toBeGreaterThan(0);
    }
  });

  it("the second guest reads none of the first guest's rows in any table", async () => {
    for (const t of TABLES) {
      const { data, error } = await guestB.from(t).select("engagement_id").eq("engagement_id", a.engagementId);
      expect(error, t).toBeNull();
      expect(data, `guest B must not see ${t} rows of engagement A`).toEqual([]);
    }
    // And with no filter at all, only engagement B comes back.
    for (const t of TABLES) {
      const { data } = await guestB.from(t).select("engagement_id");
      for (const row of data ?? []) expect(row.engagement_id, t).toBe(b.engagementId);
    }
  });

  it("the second guest cannot write into the first guest's engagement", async () => {
    const answer = await guestB.rpc("submit_answer", {
      p_card_id: a.cardIds[2],
      p_option_key: "A",
      p_reasoning: "Should be refused",
    });
    expect(answer.error).not.toBeNull();
    const comment = await guestB.from("comments").insert({ card_id: a.cardIds[2], author_id: b.coachId, body_md: "x" });
    expect(comment.error).not.toBeNull();
    const raised = await guestB.from("raised_items").insert({ engagement_id: a.engagementId, author_id: b.coachId, kind: "idea", body_md: "x" });
    expect(raised.error).not.toBeNull();
    const upload = await guestB
      .from("uploads")
      .insert({ engagement_id: a.engagementId, author_id: b.coachId, storage_path: `${a.engagementId}/y/z.jpg`, kind: "photo" });
    expect(upload.error).not.toBeNull();
    const tick = await guestB.rpc("tick_action", { p_action_id: a.coachActionId });
    expect(tick.error).not.toBeNull();
    const resched = await guestB.rpc("request_reschedule", { p_session_id: a.sessionIds.next, p_note: "x" });
    expect(resched.error).not.toBeNull();
  });

  it("people cannot change cards, sessions or intake rows directly", async () => {
    const upd = await guestA.from("cards").update({ status: "actioned" }).eq("id", a.cardIds[0]).select();
    expect(upd.error ?? upd.data?.length === 0).toBeTruthy();
    const ins = await guestA.from("intake_events").insert({ engagement_id: a.engagementId, kind: "comment", entity_table: "comments", entity_id: a.cardIds[0] });
    expect(ins.error).not.toBeNull();
    const cfg = await guestA.from("app_config").select("*");
    expect(cfg.data ?? []).toEqual([]);
  });

  it("private storage: the second guest cannot read the first guest's files", async () => {
    const path = `${a.engagementId}/rls/secret.txt`;
    const up = await guestA.storage.from("uploads").upload(path, new Blob(["sample"], { type: "text/plain" }));
    expect(up.error).toBeNull();
    const own = await guestA.storage.from("uploads").createSignedUrl(path, 60);
    expect(own.error).toBeNull();
    const other = await guestB.storage.from("uploads").download(path);
    expect(other.error).not.toBeNull();
    const signed = await guestB.storage.from("uploads").createSignedUrl(path, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
    const write = await guestB.storage.from("uploads").upload(`${a.engagementId}/rls/intruder.txt`, new Blob(["x"]));
    expect(write.error).not.toBeNull();
  });

  it("a caller who is not signed in can call no function and read no table", async () => {
    const anon = anonClient();
    const calls: [string, Record<string, unknown>][] = [
      ["is_member", { eid: a.engagementId }],
      ["member_role_of", { eid: a.engagementId }],
      ["mark_card_opened", { p_card_id: a.cardIds[0] }],
      ["record_consent", { p_engagement: a.engagementId, p_consent: true }],
      ["tick_action", { p_action_id: a.coachActionId }],
      ["request_reschedule", { p_session_id: a.sessionIds.next, p_note: "x" }],
      ["submit_answer", { p_card_id: a.cardIds[0], p_option_key: "A", p_reasoning: "x" }],
      ["claim_intake_events", { p_limit: 1 }],
      ["on_answer_insert", {}],
    ];
    for (const [fn, args] of calls) {
      const { error } = await anon.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
    for (const t of TABLES) {
      const { data } = await anon.from(t).select("engagement_id");
      expect(data ?? [], t).toEqual([]);
    }
  });
});
