import type { CardStatus } from "@/lib/types";
import { statusLabel } from "@/lib/labels";

const STYLES: Record<CardStatus, string> = {
  awaiting_coach: "bg-warn-bg text-warn-ink",
  question_back: "bg-ask-bg text-ask-ink",
  answered: "bg-info-bg text-info-ink",
  actioned: "bg-ok-bg text-ok-ink",
};

export function StatusPill({ status, coachName, ownerName }: { status: CardStatus; coachName: string; ownerName: string }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {statusLabel(status, coachName, ownerName)}
    </span>
  );
}
