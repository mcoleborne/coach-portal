import { NextResponse, type NextRequest } from "next/server";
import { markdownToPdf } from "@/lib/pdf";
import { getCard } from "@/lib/queries";
import { SIGNED_URL_SECONDS, UPLOAD_BUCKET } from "@/lib/storage/paths";
import { createClient } from "@/lib/supabase/server";
import { formatSydneyDateTime } from "@/lib/time/sydney";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const card = await getCard(supabase, id); // RLS: only a member gets the card
  if (!card) return new NextResponse("Not found", { status: 404 });

  if (card.document_pdf_path) {
    const { data } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrl(card.document_pdf_path, SIGNED_URL_SECONDS, {
      download: true,
    });
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl, 302);
  }
  if (!card.document_md) return new NextResponse("This card has no document", { status: 404 });

  const pdf = await markdownToPdf(
    card.title,
    card.document_md,
    `Coach portal · published ${formatSydneyDateTime(new Date(card.published_at))}`,
  );
  const name = card.title.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "document";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
