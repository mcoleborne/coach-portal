export type MemberRole = "owner" | "coach";
export type CardStatus = "awaiting_coach" | "question_back" | "answered" | "actioned";
export type UploadKind = "photo" | "video" | "pdf" | "audio" | "other";
export type RaisedKind = "risk" | "supplier_tip" | "idea" | "question";
export type SessionStatus = "scheduled" | "held" | "cancelled_by_owner_late" | "cancelled" | "reschedule_requested";

export type CardOption = { key: string; label: string };

export type Card = {
  id: string;
  engagement_id: string;
  title: string;
  question: string;
  context_md: string | null;
  document_md: string | null;
  document_pdf_path: string | null;
  options: CardOption[];
  recommendation_md: string | null;
  size: "standard" | "large";
  due_at: string | null;
  status: CardStatus;
  fibery_ref: string | null;
  published_at: string;
  opened_at: string | null;
  answered_at: string | null;
  actioned_at: string | null;
};

export type Session = {
  id: string;
  engagement_id: string;
  number: number | null;
  starts_at: string;
  duration_min: number;
  call_url: string | null;
  agenda_md: string | null;
  summary_md: string | null;
  status: SessionStatus;
  cancelled_at: string | null;
  reschedule_note: string | null;
};

export type Action = {
  id: string;
  session_id: string;
  owner_role: MemberRole;
  text: string;
  done_at: string | null;
};

export type Upload = {
  id: string;
  engagement_id: string;
  card_id: string | null;
  answer_id: string | null;
  raised_item_id: string | null;
  author_id: string | null;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  kind: UploadKind;
  transcript_md: string | null;
  created_at: string;
};

export type Decision = {
  id: string;
  card_id: string | null;
  session_id: string | null;
  question: string;
  coach_view: string | null;
  decision: string;
  decided_at: string;
};

/** An attachment already in storage, waiting to be recorded with an act. */
export type PendingAttachment = {
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: UploadKind;
};
