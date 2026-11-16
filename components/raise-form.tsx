"use client";

import Link from "next/link";
import { useActionState } from "react";
import { raiseItem, type ActResult } from "@/app/actions";
import { AttachmentPicker } from "@/components/attachment-picker";
import { RAISED_KIND_LABELS } from "@/lib/labels";
import type { RaisedKind } from "@/lib/types";

const KINDS: RaisedKind[] = ["risk", "supplier_tip", "idea", "question"];

export function RaiseForm({ engagementId, ownerName }: { engagementId: string; ownerName: string }) {
  const [state, action, pending] = useActionState<ActResult | null, FormData>(raiseItem, null);

  if (state?.ok) {
    return (
      <section className="panel flex flex-col gap-3" role="status">
        <h2 className="m-0 text-lg font-bold">Sent</h2>
        <p className="m-0 text-sm leading-relaxed">
          It reaches Claude straight away. Claude files it and lets {ownerName} know if it needs a decision.
        </p>
        <Link href="/" className="btn self-start">
          Back to home
        </Link>
      </section>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="engagement_id" value={engagementId} />
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm text-muted">What kind of thing?</legend>
        {KINDS.map((k) => (
          <label
            key={k}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white"
          >
            <input type="radio" name="kind" value={k} required className="size-4" />
            {RAISED_KIND_LABELS[k]}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm">
        What did you notice?
        <textarea name="body" rows={6} required className="field" />
      </label>
      <AttachmentPicker engagementId={engagementId} fileLabel="Photo or file" voiceLabel="Voice note" />
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="add_to_agenda" value="yes" className="size-5" />
        Put it on this week&apos;s agenda
      </label>
      {state && !state.ok ? (
        <p role="alert" className="m-0 text-sm text-warn-ink">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary min-h-12 text-base" disabled={pending}>
        {pending ? "Sending..." : "Send"}
      </button>
      <p className="m-0 text-sm leading-relaxed text-muted">
        It reaches Claude straight away. Claude files it and lets {ownerName} know if it needs a decision.
      </p>
    </form>
  );
}
