"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Records a voice note in the browser. Produces an audio File for upload.
 * Falls back to choosing an audio file where recording is not available.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
  label = "Record a voice note",
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUnsupported(true);
      fileInput.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        onRecorded(new File(chunks.current, `voice-note-${stamp}.${ext}`, { type }));
      };
      recorder.current = mr;
      mr.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setUnsupported(true);
      fileInput.current?.click();
    }
  }

  function stop() {
    recorder.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  return (
    <>
      {recording ? (
        <button type="button" className="btn border-warn-ink text-warn-ink" onClick={stop}>
          Stop recording ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
        </button>
      ) : (
        <button type="button" className="btn" onClick={start} disabled={disabled}>
          {label}
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        capture
        hidden
        aria-label="Choose a voice note file"
        data-testid="voice-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onRecorded(f);
          e.target.value = "";
        }}
      />
      {unsupported ? <span className="sr-only">Recording is not available here, so choose an audio file.</span> : null}
    </>
  );
}
