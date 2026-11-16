import { UPLOAD_KIND_LABELS } from "@/lib/labels";
import { formatSydneyShortDate } from "@/lib/time/sydney";
import type { Upload } from "@/lib/types";

/** Uploads shown through expiring signed links. */
export function UploadGrid({
  uploads,
  urls,
  names,
  columns = "sm:grid-cols-2 lg:grid-cols-4",
  empty = "Nothing uploaded yet.",
}: {
  uploads: Upload[];
  urls: Record<string, string>;
  names: Record<string, string>;
  columns?: string;
  empty?: string;
}) {
  if (uploads.length === 0) return <p className="muted m-0">{empty}</p>;
  return (
    <ul className={`m-0 grid list-none grid-cols-1 gap-3 p-0 ${columns}`} aria-label="Uploads">
      {uploads.map((u) => {
        const url = urls[u.storage_path];
        const who = u.author_id ? (names[u.author_id] ?? "Someone") : "Claude";
        const label = u.file_name ?? UPLOAD_KIND_LABELS[u.kind];
        return (
          <li key={u.id} className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid="upload-item">
            {u.kind === "photo" && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={label} className="h-28 w-full rounded bg-line-soft object-cover" loading="lazy" />
            ) : u.kind === "video" && url ? (
              <video src={url} controls preload="none" className="h-28 w-full rounded bg-line-soft" aria-label={label} />
            ) : u.kind === "audio" && url ? (
              <audio src={url} controls preload="none" className="w-full" aria-label={label} />
            ) : (
              <div className="flex h-28 items-center justify-center rounded bg-line-soft text-muted">
                {UPLOAD_KIND_LABELS[u.kind]}
              </div>
            )}
            <span className="truncate">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ) : (
                label
              )}{" "}
              · {who} · {formatSydneyShortDate(new Date(u.created_at))}
            </span>
            {u.kind === "audio" ? (
              <span className="text-muted">{u.transcript_md ? `Transcript: ${u.transcript_md}` : "Transcript to follow"}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
