/**
 * Transactional email for the digest. Resend's HTTP API, configured by
 * RESEND_API_KEY and DIGEST_FROM. Sign-in links are sent by Supabase Auth, not here.
 */

export type Email = { to: string; subject: string; text: string; html: string; replyTo?: string };

export interface EmailSender {
  send(email: Email): Promise<void>;
}

export class EmailError extends Error {
  constructor(status: number) {
    super(`Email provider refused the message with HTTP ${status}`);
  }
}

export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): EmailSender | null {
  const key = env.RESEND_API_KEY;
  const from = env.DIGEST_FROM;
  if (!key || !from) return null;
  return {
    async send(email) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          reply_to: email.replyTo,
        }),
      });
      if (!res.ok) throw new EmailError(res.status);
    },
  };
}

/** DIGEST_ALLOWED_RECIPIENTS, when set, is the only list of addresses that may get a digest. */
export function recipientAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const list = env.DIGEST_ALLOWED_RECIPIENTS;
  if (!list) return true;
  return list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}
