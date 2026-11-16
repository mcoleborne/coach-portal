"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordUploads } from "@/app/actions";
import { useUploader } from "./use-uploader";
import { VoiceRecorder } from "./voice-recorder";

/** The general drop zone. Each file becomes an upload straight away. */
export function AddMaterial({
  engagementId,
  cardId,
  variant = "panel",
}: {
  engagementId: string;
  cardId?: string;
  variant?: "panel" | "button" | "bar";
}) {
  const { upload, busy, error } = useUploader(engagementId);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function add(files: File[]) {
    setSaved(null);
    setSaveError(null);
    const done = await upload(files);
    if (!done.length) return;
    const res = await recordUploads({ engagementId, cardId: cardId ?? null, files: done });
    if (res.ok) {
      setSaved(done.length === 1 ? `Added ${done[0].file_name}` : `Added ${done.length} files`);
      router.refresh();
    } else {
      setSaveError(res.error);
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      accept="image/*,video/*,application/pdf,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
      data-testid="material-input"
      aria-label="Choose files to upload"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) void add(files);
      }}
    />
  );
  const status = (
    <>
      {busy ? <span className="muted" aria-live="polite">Uploading...</span> : null}
      {saved ? <span className="text-sm text-ok-ink" role="status">{saved}</span> : null}
      {error || saveError ? (
        <span role="alert" className="text-sm text-warn-ink">
          {error ?? saveError}
        </span>
      ) : null}
    </>
  );

  if (variant === "bar") {
    return (
      <>
        <button type="button" className="btn-primary min-h-12 flex-1 text-base" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Uploading..." : "Add photo or video"}
        </button>
        {picker}
      </>
    );
  }

  if (variant === "button") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>
          Upload
        </button>
        {picker}
        {status}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) void add(files);
        }}
        className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-5 text-center ${drag ? "border-ink bg-bg" : "border-line"}`}
      >
        <span className="text-sm">Drop photos, short videos or PDFs</span>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>
            Upload
          </button>
          <VoiceRecorder disabled={busy} label="Voice note" onRecorded={(f) => add([f])} />
        </div>
      </div>
      {picker}
      {status}
    </div>
  );
}
