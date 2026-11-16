"use client";

import { useActionState, useState } from "react";
import { askQuestionBack, submitAnswer, type ActResult } from "@/app/actions";
import { AttachmentPicker } from "@/components/attachment-picker";
import type { CardOption } from "@/lib/types";

export function AnswerForm({
  cardId,
  engagementId,
  options,
  ownerName,
}: {
  cardId: string;
  engagementId: string;
  options: CardOption[];
  ownerName: string;
}) {
  const [mode, setMode] = useState<"answer" | "question">("answer");
  const [answerState, answerAction, answering] = useActionState<ActResult | null, FormData>(submitAnswer, null);
  const [questionState, questionAction, asking] = useActionState<ActResult | null, FormData>(askQuestionBack, null);
  const choices = [...options, { key: "other", label: "Something else" }];

  if (answerState?.ok) {
    return (
      <section className="panel border-2 border-ink" role="status">
        <h2 className="m-0 text-base font-bold">Answer sent</h2>
        <p className="m-0 mt-2 text-sm">The card is now Answered. Claude files it within a minute and {ownerName} sees the outcome.</p>
      </section>
    );
  }
  if (questionState?.ok) {
    return (
      <section className="panel border-2 border-ink" role="status">
        <h2 className="m-0 text-base font-bold">Question sent to {ownerName}</h2>
        <p className="m-0 mt-2 text-sm">You can still answer the card once you hear back.</p>
      </section>
    );
  }

  if (mode === "question") {
    return (
      <form action={questionAction} className="panel flex flex-col gap-3.5 border-2 border-ink">
        <input type="hidden" name="card_id" value={cardId} />
        <h2 className="m-0 text-base font-bold">Ask {ownerName} a question</h2>
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          What do you need to know first?
          <textarea name="body" rows={4} required className="field" />
        </label>
        {questionState && !questionState.ok ? (
          <p role="alert" className="m-0 text-sm text-warn-ink">
            {questionState.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={asking}>
            {asking ? "Sending..." : "Send question"}
          </button>
          <button type="button" className="btn" onClick={() => setMode("answer")}>
            Back to answering
          </button>
        </div>
        <p className="m-0 text-sm text-muted">The card moves to Question back to {ownerName} until you answer.</p>
      </form>
    );
  }

  return (
    <form action={answerAction} className="panel flex flex-col gap-4 border-2 border-ink">
      <input type="hidden" name="card_id" value={cardId} />
      <h2 className="m-0 text-base font-bold">Your answer</h2>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm text-muted">Pick one</legend>
        {choices.map((o) => (
          <label
            key={o.key}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-bg"
          >
            <input type="radio" name="option_key" value={o.key} required className="mt-0.5 size-5 shrink-0" />
            <span>
              {o.key !== "other" ? <b>{o.key}. </b> : null}
              {o.label}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm text-muted">
        Why, and anything we&apos;ve missed
        <textarea name="reasoning" rows={4} className="field" />
      </label>
      <AttachmentPicker engagementId={engagementId} />
      {answerState && !answerState.ok ? (
        <p role="alert" className="m-0 text-sm text-warn-ink">
          {answerState.error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" className="btn" onClick={() => setMode("question")}>
          Ask {ownerName} a question instead
        </button>
        <span className="hidden grow sm:block" />
        <button type="submit" className="btn-primary min-h-12" disabled={answering}>
          {answering ? "Sending..." : "Send answer"}
        </button>
      </div>
      <p className="m-0 text-sm text-muted">
        Sending moves the card to Answered. Claude files it within a minute and {ownerName} sees the outcome.
      </p>
    </form>
  );
}
