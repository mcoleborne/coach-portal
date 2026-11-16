import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AddMaterial } from "@/components/add-material";
import { AnswerForm } from "@/components/card/answer-form";
import { CommentThread } from "@/components/card/comment-thread";
import { UploadGrid } from "@/components/upload-grid";
import { signPaths } from "@/lib/storage/signed";
import type { Upload } from "@/lib/types";
import { DocumentPanel } from "@/components/card/document-panel";
import { Markdown } from "@/components/markdown";
import { StatusPill } from "@/components/status-pill";
import { cardMeta } from "@/components/review-queue";
import { requireContext } from "@/lib/context";
import { getCard, memberNames } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatSydneyDateTime } from "@/lib/time/sydney";

export const metadata = { title: "Review card · Coach portal" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const supabase = await createClient();
  const card = await getCard(supabase, id);
  // RLS returns nothing for a card in someone else's engagement.
  if (!card || card.engagement_id !== ctx.engagement.id) notFound();

  if (ctx.role === "coach" && !card.opened_at) {
    const { error } = await supabase.rpc("mark_card_opened", { p_card_id: card.id });
    if (!error) card.opened_at = new Date().toISOString();
  }

  const [names, { data: answers }, { data: events }, { data: comments }, { data: uploads }] = await Promise.all([
    memberNames(supabase, ctx.engagement.id),
    supabase
      .from("answers")
      .select("id, author_id, option_key, reasoning_md, created_at")
      .eq("card_id", card.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("intake_events")
      .select("kind, created_at, filed_at, entity_id")
      .eq("engagement_id", ctx.engagement.id)
      .in("kind", ["answer", "question_back"])
      .not("filed_at", "is", null),
    supabase
      .from("comments")
      .select("id, author_id, author_kind, is_question_back, body_md, created_at")
      .eq("card_id", card.id)
      .order("created_at", { ascending: true }),
    supabase.from("uploads").select("*").eq("card_id", card.id).order("created_at", { ascending: false }),
  ]);
  const cardUploads = (uploads ?? []) as Upload[];
  const urls = await signPaths(
    supabase,
    cardUploads.map((u) => u.storage_path),
  );
  const thread = (comments ?? []).map((c) => ({
    id: c.id as string,
    author:
      c.author_kind === "claude" ? `Claude for ${ctx.ownerName}` : (names[c.author_id as string] ?? "Someone"),
    when: formatSydneyDateTime(new Date(c.created_at as string)),
    body: c.body_md as string,
    isQuestionBack: c.is_question_back as boolean,
  }));

  const latest = answers?.[0];
  const optionLabel = (key: string) =>
    key === "other" ? "Something else" : (card.options.find((o) => o.key === key)?.label ?? key);
  const answerIds = new Set((answers ?? []).map((a) => a.id));
  const filed = (events ?? []).find((e) => answerIds.has(e.entity_id));
  const canAnswer = ctx.role === "coach" && card.status !== "actioned" && !latest;

  return (
    <>
      <AppHeader ctx={ctx} back={{ href: "/", label: "Back to review queue" }} />
      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 md:px-10 md:py-8 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={card.status} coachName={ctx.coachName} ownerName={ctx.ownerName} />
              <span className="text-sm text-muted">{cardMeta(card)} · Published by Claude for {ctx.ownerName}</span>
            </div>
            <h1 className="m-0 text-2xl font-bold md:text-[26px]">{card.title}</h1>
          </div>

          <section className="flex flex-col gap-1.5 rounded-lg bg-ink px-5 py-4 text-white md:px-6 md:py-5">
            <span className="text-xs font-semibold tracking-wider">THE QUESTION</span>
            <span className="text-base font-semibold md:text-lg">{card.question}</span>
          </section>

          {card.context_md ? (
            <section className="panel flex flex-col gap-3">
              <h2 className="m-0 text-base font-bold">Context</h2>
              <Markdown>{card.context_md}</Markdown>
            </section>
          ) : null}

          {card.document_md ? (
            <DocumentPanel title={card.title} pdfHref={`/cards/${card.id}/document.pdf`}>
              <Markdown>{card.document_md}</Markdown>
            </DocumentPanel>
          ) : null}

          <section className="panel flex flex-col gap-3">
            <h2 className="m-0 text-base font-bold">Options</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {card.options.map((o) => (
                <li key={o.key} className="rounded-md border border-line-soft p-3">
                  <b>{o.key}.</b> {o.label}
                </li>
              ))}
            </ul>
            {card.recommendation_md ? (
              <div className="flex flex-col gap-1 rounded-md bg-bg p-4">
                <span className="eyebrow">Claude&apos;s recommendation</span>
                <Markdown>{card.recommendation_md}</Markdown>
              </div>
            ) : null}
          </section>

          {latest ? (
            <section className="panel flex flex-col gap-2 border-2 border-ink" data-testid="answer-summary">
              <h2 className="m-0 text-base font-bold">{names[latest.author_id] ?? "The coach"}&apos;s answer</h2>
              <p className="m-0 text-sm">
                <b>{latest.option_key === "other" ? "Something else" : `${latest.option_key}.`}</b>{" "}
                {latest.option_key === "other" ? "" : optionLabel(latest.option_key)}
              </p>
              {latest.reasoning_md ? <Markdown>{latest.reasoning_md}</Markdown> : null}
              <span className="text-xs text-muted">Sent {formatSydneyDateTime(new Date(latest.created_at))}</span>
              {card.status === "answered" ? (
                <p role="status" className="m-0 text-sm text-muted">
                  Claude files it within a minute and {ctx.ownerName} sees the outcome.
                </p>
              ) : null}
            </section>
          ) : null}

          {card.status === "question_back" ? (
            <p role="status" className="m-0 rounded-md bg-ask-bg p-3 text-sm text-ask-ink">
              A question is with {ctx.ownerName}. The card can still be answered at any time.
            </p>
          ) : null}

          {canAnswer ? (
            <AnswerForm
              cardId={card.id}
              engagementId={ctx.engagement.id}
              options={card.options}
              ownerName={ctx.ownerName}
            />
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="panel flex flex-col gap-3" aria-labelledby="attachments-title">
            <div className="flex items-start justify-between gap-2">
              <h2 id="attachments-title" className="m-0 text-base font-bold">
                Attachments
              </h2>
              <AddMaterial engagementId={ctx.engagement.id} cardId={card.id} variant="button" />
            </div>
            <UploadGrid uploads={cardUploads} urls={urls} names={names} columns="grid-cols-2" empty="None yet." />
          </section>
          <CommentThread cardId={card.id} comments={thread} />
          <section className="panel flex flex-col gap-2 text-sm" aria-labelledby="activity-title">
            <h2 id="activity-title" className="m-0 text-base font-bold">
              Activity
            </h2>
            <span>Published by Claude · {formatSydneyDateTime(new Date(card.published_at))}</span>
            {card.opened_at ? (
              <span>
                Opened by {ctx.coachName} · {formatSydneyDateTime(new Date(card.opened_at))}
              </span>
            ) : null}
            {card.answered_at ? <span>Answered · {formatSydneyDateTime(new Date(card.answered_at))}</span> : null}
            {filed?.filed_at ? <span>Filed by Claude · {formatSydneyDateTime(new Date(filed.filed_at))}</span> : null}
            {card.actioned_at ? <span>Actioned · {formatSydneyDateTime(new Date(card.actioned_at))}</span> : null}
          </section>
        </aside>
      </main>
    </>
  );
}
