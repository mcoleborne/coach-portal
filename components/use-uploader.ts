"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadKindFor } from "@/lib/labels";
import { MAX_UPLOAD_BYTES, UPLOAD_BUCKET, uploadPath } from "@/lib/storage/paths";
import type { PendingAttachment } from "@/lib/types";

/**
 * Sends files straight to private storage under the engagement's folder, as
 * the signed-in person. The database row (and so the intake event) is written
 * afterwards, by the act the files belong to.
 */
export function useUploader(engagementId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: File[]): Promise<PendingAttachment[]> => {
      setError(null);
      const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
      if (tooBig) {
        setError(`${tooBig.name} is over 50 MB. Try a shorter clip or a smaller file.`);
        return [];
      }
      setBusy(true);
      const supabase = createClient();
      const done: PendingAttachment[] = [];
      try {
        for (const file of files) {
          const path = uploadPath(engagementId, file.name, crypto.randomUUID());
          const mime = file.type || "application/octet-stream";
          const { error: err } = await supabase.storage
            .from(UPLOAD_BUCKET)
            .upload(path, file, { contentType: mime, upsert: false });
          if (err) {
            setError(`Could not upload ${file.name}. Try again.`);
            continue;
          }
          done.push({
            storage_path: path,
            file_name: file.name,
            mime_type: mime,
            size_bytes: file.size,
            kind: uploadKindFor(mime, file.name),
          });
        }
      } finally {
        setBusy(false);
      }
      return done;
    },
    [engagementId],
  );

  return { upload, busy, error };
}
