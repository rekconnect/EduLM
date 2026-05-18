import { Resend } from "resend";

const FROM = process.env.AUTH_EMAIL_FROM ?? "noreply@edulm.app";
const ENABLED =
  !!process.env.RESEND_API_KEY && process.env.EDULM_EMAILS_DISABLED !== "true";

let _client: Resend | null | undefined;

function getClient(): Resend | null {
  if (_client !== undefined) return _client;
  if (!ENABLED) {
    _client = null;
    return null;
  }
  _client = new Resend(process.env.RESEND_API_KEY!);
  return _client;
}

export type MailRecipient = string | { name?: string | null; email: string };

function normalizeRecipient(r: MailRecipient): string {
  if (typeof r === "string") return r;
  return r.name ? `${r.name} <${r.email}>` : r.email;
}

export type SendMailInput = {
  to: MailRecipient | MailRecipient[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Optional tag for analytics in Resend's dashboard. */
  tag?: string;
};

export type SendMailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "no-config" | "error"; error?: string };

/**
 * Send a transactional email. Never throws — actions that call this should
 * never fail because email delivery failed. When Resend isn't configured we
 * log the email contents in dev so you can verify what would be sent.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const client = getClient();
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map(normalizeRecipient);

  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[mailer:no-config] ${input.subject}\n  → to: ${to.join(", ")}\n  ${input.text ? `(text: ${input.text.slice(0, 140)}…)` : `(html-only, ${input.html.length} chars)`}`,
      );
    }
    return { sent: false, reason: "no-config" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      tags: input.tag ? [{ name: "type", value: input.tag }] : undefined,
    });
    if (error) {
      console.error("[mailer] resend error:", error);
      return { sent: false, reason: "error", error: error.message };
    }
    return { sent: true, id: data?.id ?? "unknown" };
  } catch (e) {
    const err = e as Error;
    console.error("[mailer] send threw:", err.message);
    return { sent: false, reason: "error", error: err.message };
  }
}

/** Helper to build a minimal branded HTML wrapper around plain content. */
export function htmlLayout(args: {
  preheader?: string;
  heading: string;
  intro?: string;
  bodyHtml: string;
  ctaHref?: string;
  ctaLabel?: string;
  footer?: string;
}): string {
  const cta = args.ctaHref && args.ctaLabel
    ? `<p style="margin:24px 0"><a href="${escape(args.ctaHref)}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">${escape(args.ctaLabel)}</a></p>`
    : "";
  const intro = args.intro ? `<p style="color:#52525b;margin:0 0 16px;font-size:15px">${escape(args.intro)}</p>` : "";
  const preheader = args.preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escape(args.preheader)}</span>`
    : "";
  const footer = args.footer ?? "EduLM — système de gestion scolaire";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:24px 28px 8px;">
        <p style="margin:0;color:#1e40af;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">EduLM</p>
        <h1 style="margin:8px 0 16px;color:#0a0a0a;font-size:22px;font-weight:600;line-height:1.3;">${escape(args.heading)}</h1>
        ${intro}
        ${args.bodyHtml}
        ${cta}
      </td></tr>
      <tr><td style="padding:16px 28px 24px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;">
        ${escape(footer)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isMailerConfigured(): boolean {
  return ENABLED;
}
