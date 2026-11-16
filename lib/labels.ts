import type { CardStatus, RaisedKind, UploadKind } from "./types";

export function statusLabel(status: CardStatus, coachName: string, ownerName: string): string {
  switch (status) {
    case "awaiting_coach":
      return `Awaiting ${coachName}`;
    case "question_back":
      return `Question back to ${ownerName}`;
    case "answered":
      return "Answered";
    case "actioned":
      return "Actioned";
  }
}

export const RAISED_KIND_LABELS: Record<RaisedKind, string> = {
  risk: "Risk",
  supplier_tip: "Supplier tip",
  idea: "Idea",
  question: "Question",
};

export function uploadKindFor(mime: string, fileName = ""): UploadKind {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "pdf";
  return "other";
}

export const UPLOAD_KIND_LABELS: Record<UploadKind, string> = {
  photo: "Photo",
  video: "Video",
  pdf: "PDF",
  audio: "Voice note",
  other: "File",
};
