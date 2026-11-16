"use client";

import { useActionState, useState } from "react";
import { requestReschedule, type ActResult } from "@/app/actions";

export function RescheduleRequest({ sessionId, ownerName }: { sessionId: string; ownerName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActResult | null, FormData>(requestReschedule, null);
  const rule = `Moves inside 24 hours count as used. If ${ownerName} moves a session with less than 24 hours' notice, it comes off this month's sessions.`;

  if (state?.ok) {
    return (
      <p role="status" className="m-0 text-sm">
        Reschedule requested. {ownerName} will confirm a new time.
      </p>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <button type="button" className="link-target cursor-pointer text-accent underline" onClick={() => setOpen(true)}>
          Request a reschedule
        </button>
        <span>Moves inside 24 hours count as used</span>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line-soft pt-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5 text-sm text-muted">
        When suits you instead? (optional)
        <textarea name="note" rows={2} className="field" />
      </label>
      <p className="m-0 text-sm text-muted">{rule}</p>
      {state && !state.ok ? (
        <p role="alert" className="m-0 text-sm text-warn-ink">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Sending..." : "Send request"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
