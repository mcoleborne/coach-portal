/** Storage object paths always start with the engagement id, which storage RLS checks. */
export function uploadPath(engagementId: string, fileName: string, id: string): string {
  const safe = fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-120);
  return `${engagementId}/${id}/${safe || "file"}`;
}

export const UPLOAD_BUCKET = "uploads";
export const SIGNED_URL_SECONDS = 60 * 60; // links expire after an hour
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
