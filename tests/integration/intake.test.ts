import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, seedEngagement, signedInClient, type Seeded } from "../support/fixtures";
import { processIntake } from "@/lib/intake/process";
import { createFiberyWriter, type FiberyWriter, type HorizonInput } from "@/lib/intake/fibery";
import type { RoutineFirer } from "@/lib/intake/routine";
import { handleClaudeApi, tokenMatches } from "@/lib/claude-api";

const admin = adminClient();
const EM = String.fromCharCode(0x2014);

async function countEvents(engagementId: string): Promise<Record<string, number>> {
  const { data } = await admin.from("intake_events").select("kind").eq("engagement_id", engagementId);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}

/** Stub Fibery that records what would be written. */
function stubFibery(opts: { failAppend?: number } = {}) {
  const lines: string[] = [];
  const horizons: HorizonInput[] = [];
  let failures = opts.failAppend ?? 0;
  const writer: FiberyWriter = {
    async appendWikiLine(line) {
      if (failures > 0) {
        failures--;
        throw new Error("Fibery document write failed with HTTP 503");
      }
      lines.push(line);
    },
    async createHorizon(input) {
      horizons.push(input);
      return { id: crypto.randomUUID(), publicId: String(9000 + horizons.length), url: null };
    },
  };
  return { writer, lines, horizons };
}

async function settleOtherEvents() {
  // Events left by other test files would be claimed too. Mark them filed.
  await admin.from("intake_events").update({ filed_at: new Date().toISOString(), judged_at: new Date().toISOString() }).is("filed_at", null);
  await admin.from("intake_events").update({ judged_at: new Date().toISOString() }).is("judged_at", null);
  // The routine debounce is global by design. Age earlier fires so each test starts clear.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  await admin.from("intake_events").update({ routine_fired_at: hourAgo }).gt("routine_fired_at", hourAgo);
}

describe("each coach act writes exactly one intake_events row", () => {
  let s: Seeded;
  let coach: SupabaseClient;

  beforeAll(async () => {
    s = await seedEngagement({ label: "intake-acts" });
    coach = await signedInClient(s.coachEmail);
  });

  async function act(kind: string, run: () => PromiseLike<{ error: unknown }>) {
    const before = await countEvents(s.engagementId);
    const { error } = await run();
    expect(error, kind).toBeNull();
    const after = await countEvents(s.engagementId);
    const delta = Object.fromEntries(
      Object.keys({ ...before, ...after })
        .map((k) => [k, (after[k] ?? 0) - (before[k] ?? 0)])
        .filter(([, v]) => v !== 0),
    );
    expect(delta, kind).toEqual({ [kind]: 1 });
  }

  it("answer", () =>
    act("answer", () => coach.rpc("submit_answer", { p_card_id: s.cardIds[0], p_option_key: "A", p_reasoning: "x" })));
  it("comment", () =>
    act("comment", () => coach.from("comments").insert({ card_id: s.cardIds[1], author_id: s.coachId, body_md: "x" })));
  it("question back", () =>
    act("question_back", () =>
      coach.from("comments").insert({ card_id: s.cardIds[2], author_id: s.coachId, body_md: "q", is_question_back: true }),
    ));
  it("upload", () =>
    act("upload", () =>
      coach.from("uploads").insert({
        engagement_id: s.engagementId,
        author_id: s.coachId,
        storage_path: `${s.engagementId}/a/menu.pdf`,
        kind: "pdf",
      }),
    ));
  it("voice note", () =>
    act("voice_note", () =>
      coach.from("uploads").insert({
        engagement_id: s.engagementId,
        card_id: s.cardIds[1],
        author_id: s.coachId,
        storage_path: `${s.engagementId}/b/note.webm`,
        kind: "audio",
      }),
    ));
  it("raised item", () =>
    act("raised_item", () =>
      coach.rpc("raise_item", { p_engagement: s.engagementId, p_kind: "risk", p_body: "Sample risk", p_add_to_agenda: true }),
    ));
  it("action ticked", () => act("action_ticked", () => coach.rpc("tick_action", { p_action_id: s.coachActionId })));
  it("reschedule request", () =>
    act("reschedule_request", () => coach.rpc("request_reschedule", { p_session_id: s.sessionIds.next, p_note: "Away" })));

  it("an answer with two attachments writes one answer row and one row per upload", async () => {
    const before = await countEvents(s.engagementId);
    const files = [1, 2].map((n) => ({
      storage_path: `${s.engagementId}/c/${n}.jpg`,
      file_name: `${n}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 3,
      kind: "photo",
    }));
    const { error } = await coach.rpc("submit_answer", {
      p_card_id: s.cardIds[1],
      p_option_key: "B",
      p_reasoning: "y",
      p_attachments: files,
    });
    expect(error).toBeNull();
    const after = await countEvents(s.engagementId);
    expect((after.answer ?? 0) - (before.answer ?? 0)).toBe(1);
    expect((after.upload ?? 0) - (before.upload ?? 0)).toBe(2);
  });

  it("a coach cannot tick the owner's action, and a second tick writes nothing", async () => {
    const owner = await coach.rpc("tick_action", { p_action_id: s.ownerActionId });
    expect(owner.error).not.toBeNull();
    const before = await countEvents(s.engagementId);
    await coach.rpc("tick_action", { p_action_id: s.coachActionId });
    expect(await countEvents(s.engagementId)).toEqual(before);
  });

  it("writes by Claude through the service connection are not intake", async () => {
    const before = await countEvents(s.engagementId);
    const res = await handleClaudeApi(admin, "POST", ["comments"], { card_id: s.cardIds[0], body_md: "From Claude" }, new URLSearchParams());
    expect(res.status).toBe(201);
    expect(await countEvents(s.engagementId)).toEqual(before);
  });
});

describe("the filing route files to Fibery and retries on failure (stubbed Fibery)", () => {
  let s: Seeded;
  let coach: SupabaseClient;

  beforeEach(async () => {
    await settleOtherEvents();
    s = await seedEngagement({ label: "intake-file" });
    coach = await signedInClient(s.coachEmail);
    await coach.rpc("submit_answer", {
      p_card_id: s.cardIds[0],
      p_option_key: "C",
      p_reasoning: `Keep room for a fourth ${EM} sample reasoning \u{1F680}`,
    });
    await coach.from("comments").insert({ card_id: s.cardIds[1], author_id: s.coachId, body_md: "Food cost target?", is_question_back: true });
    await coach.rpc("request_reschedule", { p_session_id: s.sessionIds.next, p_note: "Travelling" });
  });

  it("marks filed_at, writes one wiki line per event and a Horizon for a question back or reschedule", async () => {
    const fib = stubFibery();
    const res = await processIntake({ admin, fibery: fib.writer, routine: null, appUrl: "https://portal.test" });
    expect(res).toMatchObject({ leased: true, filed: 3, failed: 0, routine: "not_configured" });

    const { data } = await admin.from("intake_events").select("kind, filed_at, fibery_ref, attempts").eq("engagement_id", s.engagementId);
    expect(data).toHaveLength(3);
    for (const e of data!) expect(e.filed_at).not.toBeNull();
    expect(data!.find((e) => e.kind === "question_back")!.fibery_ref).toMatch(/^H#\d+$/);
    expect(data!.find((e) => e.kind === "reschedule_request")!.fibery_ref).toMatch(/^H#\d+$/);
    expect(data!.find((e) => e.kind === "answer")!.fibery_ref).toBeNull();

    expect(fib.lines).toHaveLength(3);
    expect(fib.horizons.map((h) => h.name)).toEqual([
      "Coach question back: Launch menu v1 (sample)",
      expect.stringMatching(/^Coach reschedule request: Session 3 on .* (AEDT|AEST)$/),
    ]);
    const answerLine = fib.lines.find((l) => l.includes("answered"))!;
    expect(answerLine).toMatch(/^- \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2}(am|pm) (AEDT|AEST)\. Test guest answered "Cart requirements v1\.0 \(sample\)": C, Three carts now/);
    expect(answerLine).toContain("https://portal.test/cards/");
    // Voice rules hold even for what a person typed.
    for (const text of [...fib.lines, ...fib.horizons.map((h) => h.descriptionMd + h.name)]) {
      expect(text).not.toContain(EM);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }

    // A second run finds nothing to do.
    const again = await processIntake({ admin, fibery: fib.writer, routine: null, appUrl: "https://portal.test" });
    expect(again.filed).toBe(0);
    expect(fib.lines).toHaveLength(3);
  });

  it("on failure increments attempts and records last_error with no credential, then files on retry", async () => {
    const failing = stubFibery({ failAppend: 3 });
    const first = await processIntake({ admin, fibery: failing.writer, routine: null, appUrl: "https://portal.test" });
    expect(first).toMatchObject({ filed: 0, failed: 3 });
    const { data: failed } = await admin.from("intake_events").select("filed_at, attempts, last_error").eq("engagement_id", s.engagementId);
    for (const e of failed!) {
      expect(e.filed_at).toBeNull();
      expect(e.attempts).toBe(1);
      expect(e.last_error).toBe("Fibery document write failed with HTTP 503");
    }

    // Claimed events wait a minute before they can be claimed again. Age the claims.
    await admin.from("intake_events").update({ claimed_at: new Date(Date.now() - 120_000).toISOString() }).eq("engagement_id", s.engagementId);
    const ok = stubFibery();
    const retry = await processIntake({ admin, fibery: ok.writer, routine: null, appUrl: "https://portal.test" });
    expect(retry).toMatchObject({ filed: 3, failed: 0 });
    const { data: filed } = await admin.from("intake_events").select("filed_at, attempts, last_error").eq("engagement_id", s.engagementId);
    for (const e of filed!) {
      expect(e.filed_at).not.toBeNull();
      expect(e.attempts).toBe(1);
      expect(e.last_error).toBeNull();
    }
  });

  it("two filers at once never file the same event twice", async () => {
    const fib = stubFibery();
    const slow: FiberyWriter = {
      appendWikiLine: async (l) => {
        await new Promise((r) => setTimeout(r, 30));
        return fib.writer.appendWikiLine(l);
      },
      createHorizon: fib.writer.createHorizon,
    };
    const [a, b] = await Promise.all([
      processIntake({ admin, fibery: slow, routine: null, appUrl: "https://portal.test" }),
      processIntake({ admin, fibery: slow, routine: null, appUrl: "https://portal.test" }),
    ]);
    expect(a.filed + b.filed).toBe(3);
    expect([a.leased, b.leased].filter(Boolean)).toHaveLength(1);
    expect(fib.lines).toHaveLength(3);
  });

  it("fires the AG-095 routine once for filed events, then waits out the debounce", async () => {
    const fired: string[] = [];
    const routine: RoutineFirer = { fire: async (t) => void fired.push(t) };
    const fib = stubFibery();
    const first = await processIntake({ admin, fibery: fib.writer, routine, appUrl: "https://portal.test" });
    expect(first.routine).toBe("fired");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toContain("3 new event(s)");
    const { data } = await admin.from("intake_events").select("routine_fired_at").eq("engagement_id", s.engagementId);
    for (const e of data!) expect(e.routine_fired_at).not.toBeNull();

    await coach.from("comments").insert({ card_id: s.cardIds[2], author_id: s.coachId, body_md: "One more" });
    const second = await processIntake({ admin, fibery: fib.writer, routine, appUrl: "https://portal.test" });
    expect(second.filed).toBe(1);
    expect(second.routine).toBe("debounced");
    expect(fired).toHaveLength(1);
  });
});

describe("the Fibery writer sends only the expected writes and keeps the token out of errors", () => {
  const TOKEN = "fibery-test-token-0123456789abcdef0123456789";
  const cfg = {
    token: TOKEN,
    workspace: "example",
    wikiPageId: "11111111-1111-4111-8111-111111111111",
    voyageId: "22222222-2222-4222-8222-222222222222",
    ownerUserId: "33333333-3333-4333-8333-333333333333",
  };

  it("appends a line to the configured wiki page document", async () => {
    const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method: init?.method ?? "GET", body, auth: new Headers(init?.headers).get("authorization") });
      if (url.endsWith("/api/commands")) return Response.json([{ success: true, result: [{ secret: "doc-secret" }] }]);
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      return Response.json({ secret: "doc-secret", content: "Existing page text." });
    }) as typeof fetch;
    await createFiberyWriter(cfg, fake).appendWikiLine("- 16 Nov 2026, 2:14pm AEDT. Sample line.");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://example.fibery.io/api/commands",
      "GET https://example.fibery.io/api/documents/doc-secret?format=md",
      "PUT https://example.fibery.io/api/documents/doc-secret?format=md",
    ]);
    const query = (calls[0].body as { args: { query: { "q/from": string }; params: { $id: string } } }[])[0].args;
    expect(query.query["q/from"]).toBe("Club de Vela/Wiki Page");
    expect(query.params.$id).toBe(cfg.wikiPageId);
    expect(calls[2].body).toEqual({ content: "Existing page text.\n\n- 16 Nov 2026, 2:14pm AEDT. Sample line.\n" });
    expect(calls.every((c) => c.auth === `Token ${TOKEN}`)).toBe(true);
  });

  it("creates a Horizon on the configured Voyage owned by the configured person", async () => {
    const bodies: unknown[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      bodies.push(body);
      if (url.endsWith("/api/commands")) {
        const cmd = (body as { command: string; args: { query?: { "q/select": Record<string, unknown> } } }[])[0];
        if (cmd.command === "fibery.entity/query" && "publicId" in (cmd.args.query?.["q/select"] ?? {}))
          return Response.json([{ success: true, result: [{ publicId: "4242" }] }]);
        return Response.json([{ success: true, result: [{ secret: "h-secret" }] }]);
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const ref = await createFiberyWriter(cfg, fake).createHorizon({ name: "Coach question back: X", descriptionMd: "Body", source: "src" });
    expect(ref.publicId).toBe("4242");
    const create = (bodies[0] as { command: string; args: { type: string; entity: Record<string, unknown> } }[])[0];
    expect(create.command).toBe("fibery.entity/create");
    expect(create.args.type).toBe("Helm/Horizons");
    expect(create.args.entity["Helm/Voyage"]).toEqual({ "fibery/id": cfg.voyageId });
    const owner = (bodies[1] as { args: { field: string; items: unknown[] } }[])[0].args;
    expect(owner.field).toBe("Helm/Owner");
    expect(owner.items).toEqual([{ "fibery/id": cfg.ownerUserId }]);
  });

  it("an HTTP failure becomes an error with the status only, never the token", async () => {
    const fake = (async () => new Response(`denied for ${TOKEN}`, { status: 401 })) as unknown as typeof fetch;
    const err = await createFiberyWriter(cfg, fake)
      .appendWikiLine("x")
      .catch((e: Error) => e);
    expect((err as Error).message).toBe("Fibery Club de Vela/Wiki Page document lookup failed with HTTP 401");
    expect((err as Error).message).not.toContain(TOKEN);
  });
});

describe("Claude's write path", () => {
  it("accepts only the service token", () => {
    expect(tokenMatches("Bearer right-token", "right-token")).toBe(true);
    expect(tokenMatches("Bearer wrong-token", "right-token")).toBe(false);
    expect(tokenMatches(null, "right-token")).toBe(false);
    expect(tokenMatches("Bearer right-token", undefined)).toBe(false);
  });

  it("publishes a card, posts a session, classifies a late owner cancellation and marks a card actioned", async () => {
    const s = await seedEngagement({ label: "claude-api", withCards: false });
    const q = new URLSearchParams();
    const card = await handleClaudeApi(admin, "POST", ["cards"], {
      engagement_id: s.engagementId,
      title: "Venue plan (sample)",
      question: "Sample?",
      options: [{ key: "A", label: "Yes" }],
      size: "large",
    }, q);
    expect(card.status).toBe(201);
    const cardId = (card.body as { card: { id: string } }).card.id;

    const session = await handleClaudeApi(admin, "POST", ["sessions"], {
      engagement_id: s.engagementId,
      number: 4,
      starts_at: "2026-11-25T07:00:00Z",
    }, q);
    const sessionId = (session.body as { session: { id: string } }).session.id;
    const late = await handleClaudeApi(admin, "PATCH", ["sessions", sessionId], { cancelled_by_owner_at: "2026-11-24T08:00:00Z" }, q);
    expect((late.body as { session: { status: string } }).session.status).toBe("cancelled_by_owner_late");

    const actioned = await handleClaudeApi(admin, "PATCH", ["cards", cardId], { status: "actioned", fibery_ref: "H#1" }, q);
    expect((actioned.body as { card: { status: string } }).card.status).toBe("actioned");

    const badReq = await handleClaudeApi(admin, "POST", ["cards"], { engagement_id: "nope" }, q);
    expect(badReq.status).toBe(400);
    expect((await handleClaudeApi(admin, "DELETE", ["cards", cardId], null, q)).status).toBe(404);
  });

  it("lists unjudged intake events and marks one judged", async () => {
    await settleOtherEvents();
    const s = await seedEngagement({ label: "claude-judge" });
    const coach = await signedInClient(s.coachEmail);
    await coach.rpc("raise_item", { p_engagement: s.engagementId, p_kind: "idea", p_body: "Sample idea", p_add_to_agenda: false });
    const list = await handleClaudeApi(admin, "GET", ["intake-events"], null, new URLSearchParams("status=unjudged"));
    const events = (list.body as { events: { id: string; engagement_id: string }[] }).events.filter((e) => e.engagement_id === s.engagementId);
    expect(events).toHaveLength(1);
    const judged = await handleClaudeApi(admin, "PATCH", ["intake-events", events[0].id], { judged: true }, new URLSearchParams());
    expect((judged.body as { event: { judged_at: string } }).event.judged_at).toBeTruthy();
  });
});
