import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { formatDue } from "@/lib/time/sydney";
import type { Card, CardStatus } from "@/lib/types";
import { statusLabel } from "@/lib/labels";

const FILTERS: CardStatus[] = ["awaiting_coach", "question_back", "answered", "actioned"];

export function cardMeta(card: Card): string {
  const size = card.size === "large" ? "Large review, counts as two" : "Standard review";
  const due = card.due_at ? ` · Due ${formatDue(new Date(card.due_at))}` : "";
  return `${size}${due}`;
}

export function ReviewQueue({
  cards,
  filter,
  coachName,
  ownerName,
  viewerIsCoach,
}: {
  cards: Card[];
  filter: CardStatus;
  coachName: string;
  ownerName: string;
  viewerIsCoach: boolean;
}) {
  const counts = Object.fromEntries(FILTERS.map((s) => [s, cards.filter((c) => c.status === s).length])) as Record<
    CardStatus,
    number
  >;
  const shown = cards.filter((c) => c.status === filter);

  return (
    <section className="panel flex flex-col gap-4" aria-labelledby="queue-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="queue-title" className="panel-title">
          Review queue
        </h2>
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((s) => {
            const active = s === filter;
            return (
              <Link
                key={s}
                href={s === "awaiting_coach" ? "/" : `/?status=${s}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-3.5 no-underline ${
                  active ? "bg-ink text-white hover:text-white" : "border border-line text-ink hover:bg-bg"
                }`}
              >
                {statusLabel(s, coachName, ownerName)} {counts[s]}
              </Link>
            );
          })}
        </nav>
      </div>

      {shown.length === 0 ? (
        filter === "awaiting_coach" ? (
          <EmptyQueue coachName={coachName} viewerIsCoach={viewerIsCoach} />
        ) : (
          <p className="muted m-0">Nothing here yet.</p>
        )
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {shown.map((card) => (
            <li key={card.id}>
              <Link
                href={`/cards/${card.id}`}
                className="flex items-center gap-4 rounded-md border border-line p-4 text-ink no-underline hover:bg-bg hover:text-ink"
              >
                <div className="flex min-w-0 grow flex-col gap-1">
                  <span className="font-bold">{card.title}</span>
                  <span className="text-sm text-muted">
                    {card.question} · {cardMeta(card)}
                  </span>
                </div>
                <StatusPill status={card.status} coachName={coachName} ownerName={ownerName} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EmptyQueue({ coachName, viewerIsCoach }: { coachName: string; viewerIsCoach: boolean }) {
  return (
    <div
      data-testid="empty-queue"
      className="flex flex-col items-center gap-2.5 rounded-lg border-2 border-dashed border-line px-5 py-8 text-center"
    >
      <span className="text-lg font-bold">{viewerIsCoach ? "Nothing waiting on you" : `Nothing waiting on ${coachName}`}</span>
      <span className="max-w-sm text-sm leading-relaxed text-muted">
        {viewerIsCoach
          ? "You're all caught up. New reviews arrive by email and appear here."
          : "All caught up. New cards Claude publishes appear here."}
      </span>
      <Link href="/raise" className="btn mt-1.5">
        Raise something
      </Link>
    </div>
  );
}
