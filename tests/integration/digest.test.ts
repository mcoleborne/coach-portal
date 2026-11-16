import { beforeEach, describe, expect, it } from "vitest";
import { adminClient, seedEngagement, type Seeded } from "../support/fixtures";
import { runDigest } from "@/lib/digest";
import type { Email, EmailSender } from "@/lib/email";

const admin = adminClient();
const EM = String.fromCharCode(0x2014);

function stubSender(fail = false) {
  const sent: Email[] = [];
  const sender: EmailSender = {
    async send(e) {
      if (fail) throw new Error("provider down");
      sent.push(e);
    },
  };
  return { sender, sent };
}

// 7:30am AEDT on Tue 17 Nov 2026 is 20:30 UTC on the 16th.
const MORNING = new Date("2026-11-16T20:30:00Z");
const LATER_SAME_DAY = new Date("2026-11-16T21:30:00Z"); // 8:30am AEDT, the second scheduled call
const NEXT_MORNING = new Date("2026-11-17T20:30:00Z");

describe("the digest sends at most once a day when new cards are published", () => {
  let s: Seeded;
  let mine: (o: { engagement_id: string }) => boolean;

  beforeEach(async () => {
    // Only this engagement's cards should be "new"; park every other engagement.
    await admin.from("digest_log").delete().neq("card_count", -1);
    s = await seedEngagement({ label: "digest", now: new Date("2026-11-16T09:00:00Z") });
    await admin.from("cards").update({ published_at: "2026-11-16T09:00:00Z" }).eq("engagement_id", s.engagementId);
    mine = (o) => o.engagement_id === s.engagementId;
  });

  it("sends one email to the coach with every new card and a reply-to", async () => {
    const { sender, sent } = stubSender();
    const out = await runDigest({ admin, sender, appUrl: "https://portal.test", replyTo: "owner@example.test", now: MORNING });
    expect(out.find(mine)).toEqual({ engagement_id: s.engagementId, result: "sent", cards: 3 });
    const mail = sent.find((m) => m.to === s.coachEmail)!;
    expect(mail.subject).toBe("Club de Vela: 3 new cards to review");
    expect(mail.replyTo).toBe("owner@example.test");
    expect(mail.text).toContain("Cart requirements v1.0 (sample)");
    expect(mail.text).toContain(`https://portal.test/cards/${s.cardIds[0]}`);
    expect(mail.text).toContain("Your reply reaches Matt");
    expect(mail.text + mail.html + mail.subject).not.toContain(EM);
    const { data: log } = await admin.from("digest_log").select("sent_on, card_count").eq("engagement_id", s.engagementId);
    expect(log).toEqual([{ sent_on: "2026-11-17", card_count: 3 }]); // the Sydney date, not the UTC date
  });

  it("does not send a second time the same Sydney day, even with another new card", async () => {
    const { sender, sent } = stubSender();
    await runDigest({ admin, sender, appUrl: "https://portal.test", now: MORNING });
    await admin.from("cards").insert({ engagement_id: s.engagementId, title: "Another (sample)", question: "?", published_at: "2026-11-16T20:45:00Z" });
    const out = await runDigest({ admin, sender, appUrl: "https://portal.test", now: LATER_SAME_DAY });
    expect(out.find(mine)?.result).toBe("already_sent_today");
    expect(sent.filter((m) => m.to === s.coachEmail)).toHaveLength(1);

    // The next morning it goes, with only the card published since.
    const next = await runDigest({ admin, sender, appUrl: "https://portal.test", now: NEXT_MORNING });
    expect(next.find(mine)).toMatchObject({ result: "sent", cards: 1 });
    expect(sent.filter((m) => m.to === s.coachEmail)).toHaveLength(2);
  });

  it("sends nothing when no card was published since the last digest", async () => {
    const { sender, sent } = stubSender();
    await runDigest({ admin, sender, appUrl: "https://portal.test", now: MORNING });
    const out = await runDigest({ admin, sender, appUrl: "https://portal.test", now: NEXT_MORNING });
    expect(out.find(mine)?.result).toBe("nothing_new");
    expect(sent.filter((m) => m.to === s.coachEmail)).toHaveLength(1);
  });

  it("sends nothing outside the 7:30am window", async () => {
    const { sender, sent } = stubSender();
    const out = await runDigest({ admin, sender, appUrl: "https://portal.test", now: new Date("2026-11-16T23:00:00Z") });
    expect(out.find(mine)?.result).toBe("outside_window");
    expect(sent).toHaveLength(0);
  });

  it("a failed send leaves no log row, so the next call can try again", async () => {
    const failing = stubSender(true);
    const first = await runDigest({ admin, sender: failing.sender, appUrl: "https://portal.test", now: MORNING });
    expect(first.find(mine)?.result).toBe("failed");
    const { data: log } = await admin.from("digest_log").select("sent_on").eq("engagement_id", s.engagementId);
    expect(log).toEqual([]);
    const ok = stubSender();
    const second = await runDigest({ admin, sender: ok.sender, appUrl: "https://portal.test", now: LATER_SAME_DAY });
    expect(second.find(mine)?.result).toBe("sent");
  });

  it("two calls at once send once", async () => {
    const { sender, sent } = stubSender();
    await Promise.all([
      runDigest({ admin, sender, appUrl: "https://portal.test", now: MORNING }),
      runDigest({ admin, sender, appUrl: "https://portal.test", now: MORNING }),
    ]);
    expect(sent.filter((m) => m.to === s.coachEmail)).toHaveLength(1);
  });

  it("only addresses on the allow-list get a digest when one is set", async () => {
    const { sender, sent } = stubSender();
    const out = await runDigest({
      admin,
      sender,
      appUrl: "https://portal.test",
      now: MORNING,
      env: { DIGEST_ALLOWED_RECIPIENTS: "someone-else@example.test" } as unknown as NodeJS.ProcessEnv,
    });
    expect(out.find(mine)?.result).toBe("recipient_not_allowed");
    expect(sent.filter((m) => m.to === s.coachEmail)).toHaveLength(0);
  });
});
