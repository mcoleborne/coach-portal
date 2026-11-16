"use client";

import { useState } from "react";

/**
 * The document, rendered in full inside the card. It starts folded to a
 * preview so the question stays near the top, and unfolds in place. The whole
 * document is always in the page, so nothing has to load.
 */
export function DocumentPanel({ children, title, pdfHref }: { children: React.ReactNode; title: string; pdfHref: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="doc-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="doc-title" className="m-0 text-base font-bold">
          The document: {title}
        </h2>
        <a href={pdfHref} className="link-target text-sm" download>
          Download PDF
        </a>
      </div>
      <div
        id="card-document"
        data-testid="card-document"
        className={`relative rounded-md bg-bg p-4 ${open ? "" : "max-h-64 overflow-hidden"}`}
      >
        {children}
        {open ? null : (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg" />
        )}
      </div>
      <button
        type="button"
        className="btn-quiet self-start"
        aria-expanded={open}
        aria-controls="card-document"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Fold the document" : "Show the full document"}
      </button>
    </section>
  );
}
