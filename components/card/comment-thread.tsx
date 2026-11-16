"use client";

import { useActionState, useEffect, useRef } from "react";
import { addComment, type ActResult } from "@/app/actions";

export type ThreadComment = {
  id: string;
  author: string;
  when: string;
  body: string;
  isQuestionBack: boolean;
};

export function CommentThread({ cardId, comments }: { cardId: string; comments: ThreadComment[] }) {
  const [state, action, pending] = useActionState<ActResult | null, FormData>(addComment, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="comments-title">
      <h2 id="comments-title" className="m-0 text-base font-bold">
        Comments{comments.length ? ` · ${comments.length}` : ""}
      </h2>
      {comments.length ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Comment thread">
          {comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-md bg-bg p-2.5 text-sm" data-testid="comment">
              <span className="font-semibold">
                {c.author} · {c.when}
                {c.isQuestionBack ? <span className="ml-1 font-normal text-ask-ink">(question back)</span> : null}
              </span>
              <span className="whitespace-pre-wrap">{c.body}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted m-0">No comments yet.</p>
      )}
      <form ref={form} action={action} className="flex flex-col gap-2">
        <input type="hidden" name="card_id" value={cardId} />
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Add a comment
          <textarea name="body" rows={2} required className="field" />
        </label>
        {state && !state.ok ? (
          <p role="alert" className="m-0 text-sm text-warn-ink">
            {state.error}
          </p>
        ) : null}
        <button type="submit" className="btn self-end" disabled={pending}>
          {pending ? "Posting..." : "Post"}
        </button>
      </form>
    </section>
  );
}
