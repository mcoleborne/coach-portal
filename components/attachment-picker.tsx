"use client";

import { useRef, useState } from "react";
import { UPLOAD_KIND_LABELS } from "@/lib/labels";
import type { PendingAttachment } from "@/lib/types";
import { useUploader } from "./use-uploader";
import { VoiceRecorder } from "./voice-recorder";

/**
 * Attachments for an act that has not been sent yet (an answer, a raised item).
 * Files go to storage straight away; their rows are written with the act, so
 * the hidden input carries them in the form.
 */
export function AttachmentPicker({
  engagementId,
  name = "attachments",
  fileLabel = "Attach photos or files",
  voiceLabel = "Record a voice note",
}: {
  engagementId: string;
  name?: string;
  fileLabel?: string;
  voiceLabel?: string;
}) {
  const { upload, busy, error } = useUploader(engagementId);
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function add(files: File[]) {
    const done = await upload(files);
    if (done.length) setItems((prev) => [...prev, ...done]);
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>
          {fileLabel}
        </button>
        <VoiceRecorder disabled={busy} label={voiceLabel} onRecorded={(f) => add([f])} />
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*,video/*,application/pdf,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        data-testid="attachment-input"
        aria-label={fileLabel}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void add(files);
        }}
      />
      {busy ? <span className="muted" aria-live="polite">Uploading...</span> : null}
      {error ? (
        <span role="alert" className="text-sm text-warn-ink">
          {error}
        </span>
      ) : null}
      {items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" aria-label="Attached">
          {items.map((it, i) => (
            <li key={it.storage_path} className="flex items-center justify-between gap-2 rounded-md bg-bg px-3 py-1.5">
              <span className="min-w-0 truncate">
                {UPLOAD_KIND_LABELS[it.kind]}: {it.file_name}
              </span>
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-sm text-accent underline"
                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
