/**
 * Transactional email templates + send wrappers. French content by default
 * (Lycée Montaigne context). All wrappers are non-throwing — they log on
 * failure but don't break the calling server action.
 *
 * Subject lines are short and prefixed with the tenant name so parents can
 * spot the school in a busy inbox.
 */

import { htmlLayout, sendMail, type MailRecipient } from "../mailer";
import { formatMoney, centsToDecimalString } from "../money";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function url(path: string): string {
  return `${APP_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── Application submitted (admin notification) ────────────────────

export async function sendApplicationSubmittedEmail(args: {
  to: MailRecipient | MailRecipient[];
  tenantName: string;
  childFirstName: string;
  childLastName: string;
  requestedLevel: string | null;
  submittedByName: string;
  applicationId: string;
}) {
  const subject = `[${args.tenantName}] Nouveau dossier : ${args.childFirstName} ${args.childLastName}`;
  return sendMail({
    to: args.to,
    subject,
    tag: "application-submitted",
    html: htmlLayout({
      preheader: `Nouveau dossier d'inscription de ${args.submittedByName}`,
      heading: "Nouveau dossier d'inscription",
      intro: `Un parent a soumis un nouveau dossier pour examen.`,
      bodyHtml: `<table style="font-size:14px;color:#0a0a0a;">
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Élève</td><td>${args.childFirstName} ${args.childLastName}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Niveau demandé</td><td>${args.requestedLevel ?? "—"}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Soumis par</td><td>${args.submittedByName}</td></tr>
      </table>`,
      ctaHref: url(`/admissions-admin/${args.applicationId}`),
      ctaLabel: "Voir le dossier",
    }),
  });
}

// ── Application decided (parent notification) ─────────────────────

type Decision = "ACCEPTED" | "WAITLISTED" | "DECLINED";

const decisionCopy: Record<Decision, { subjectVerb: string; heading: string; intro: string }> = {
  ACCEPTED: {
    subjectVerb: "Dossier accepté",
    heading: "Votre dossier a été accepté",
    intro: "Nous avons le plaisir de vous informer que la demande d'inscription a été acceptée.",
  },
  WAITLISTED: {
    subjectVerb: "Dossier sur liste d'attente",
    heading: "Votre dossier est sur liste d'attente",
    intro: "Votre dossier a été placé sur la liste d'attente. Nous reviendrons vers vous dès qu'une place se libère.",
  },
  DECLINED: {
    subjectVerb: "Dossier non retenu",
    heading: "Dossier non retenu",
    intro: "Après examen, votre dossier n'a pas été retenu pour cette campagne.",
  },
};

export async function sendApplicationDecidedEmail(args: {
  to: MailRecipient;
  tenantName: string;
  decision: Decision;
  childFirstName: string;
  childLastName: string;
  decisionNote: string | null;
  applicationId: string;
}) {
  const copy = decisionCopy[args.decision];
  const subject = `[${args.tenantName}] ${copy.subjectVerb} — ${args.childFirstName} ${args.childLastName}`;
  const note = args.decisionNote
    ? `<p style="margin:16px 0;padding:12px;background:#f4f4f5;border-radius:6px;font-size:14px;color:#27272a;white-space:pre-line;">${escape(args.decisionNote)}</p>`
    : "";
  return sendMail({
    to: args.to,
    subject,
    tag: `application-${args.decision.toLowerCase()}`,
    html: htmlLayout({
      preheader: copy.intro,
      heading: copy.heading,
      intro: copy.intro,
      bodyHtml: `${note}<p style="margin:0 0 8px;color:#52525b;font-size:14px;">Concerne <strong>${args.childFirstName} ${args.childLastName}</strong>.</p>`,
      // Point directly at the 10-tab dossier shell — handles read-only
      // mode for ACCEPTED/DECLINED/etc. The legacy /parent/applications/{id}
      // route now just redirects here anyway, so this saves a hop.
      ctaHref: url(`/parent/inscriptions/${args.applicationId}/edit`),
      ctaLabel: "Voir le dossier",
    }),
  });
}

// ── Invoice issued (parent notification) ──────────────────────────

export async function sendInvoiceIssuedEmail(args: {
  to: MailRecipient;
  tenantName: string;
  invoiceNumber: string;
  studentName: string;
  totalCents: number;
  currency: string;
  dueAt: Date | null;
  invoiceId: string;
}) {
  const subject = `[${args.tenantName}] Nouvelle facture ${args.invoiceNumber}`;
  const dueLine = args.dueAt
    ? `<tr><td style="padding:4px 8px 4px 0;color:#71717a;">Échéance</td><td>${args.dueAt.toISOString().slice(0, 10)}</td></tr>`
    : "";
  return sendMail({
    to: args.to,
    subject,
    tag: "invoice-issued",
    html: htmlLayout({
      preheader: `Facture ${args.invoiceNumber} pour ${args.studentName} : ${formatMoney(args.totalCents, args.currency)}`,
      heading: "Nouvelle facture disponible",
      intro: `Une facture vient d'être émise concernant ${args.studentName}.`,
      bodyHtml: `<table style="font-size:14px;color:#0a0a0a;">
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Numéro</td><td>${args.invoiceNumber}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Total</td><td><strong>${formatMoney(args.totalCents, args.currency)}</strong></td></tr>
        ${dueLine}
      </table>`,
      ctaHref: url(`/parent/invoices`),
      ctaLabel: "Voir mes factures",
    }),
  });
}

// ── Payment recorded (parent receipt) ─────────────────────────────

export async function sendPaymentReceiptEmail(args: {
  to: MailRecipient;
  tenantName: string;
  invoiceNumber: string;
  studentName: string;
  amountCents: number;
  currency: string;
  remainingCents: number;
  paymentMethod: string;
  paymentDate: Date;
}) {
  const subject = `[${args.tenantName}] Reçu de paiement — ${formatMoney(args.amountCents, args.currency)}`;
  const remaining = args.remainingCents > 0
    ? `<p style="margin:12px 0;color:#a16207;font-size:14px;">Solde restant : <strong>${formatMoney(args.remainingCents, args.currency)}</strong></p>`
    : `<p style="margin:12px 0;color:#15803d;font-size:14px;">✓ Facture entièrement réglée.</p>`;
  return sendMail({
    to: args.to,
    subject,
    tag: "payment-recorded",
    html: htmlLayout({
      preheader: `Paiement de ${formatMoney(args.amountCents, args.currency)} enregistré sur la facture ${args.invoiceNumber}`,
      heading: "Reçu de paiement",
      intro: `Nous accusons réception de votre paiement.`,
      bodyHtml: `<table style="font-size:14px;color:#0a0a0a;">
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Facture</td><td>${args.invoiceNumber}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Élève</td><td>${args.studentName}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Montant</td><td><strong>${formatMoney(args.amountCents, args.currency)}</strong></td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Mode</td><td>${args.paymentMethod}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#71717a;">Date</td><td>${args.paymentDate.toISOString().slice(0, 10)}</td></tr>
      </table>
      ${remaining}`,
      ctaHref: url(`/parent/invoices`),
      ctaLabel: "Voir mes factures",
      footer: `Reçu pour vos archives — total enregistré : ${centsToDecimalString(args.amountCents)} ${args.currency}`,
    }),
  });
}

// ── New contact message (admin notification) ──────────────────────

export async function sendContactMessageEmail(args: {
  to: MailRecipient | MailRecipient[];
  tenantName: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  messageId: string;
}) {
  return sendMail({
    to: args.to,
    subject: `[${args.tenantName}] Nouveau message : ${args.subject}`,
    replyTo: args.fromEmail,
    tag: "contact-message",
    html: htmlLayout({
      preheader: `Message de ${args.fromName}`,
      heading: `Nouveau message — ${args.subject}`,
      intro: `De : ${args.fromName} (${args.fromEmail})`,
      bodyHtml: `<div style="padding:12px;background:#f4f4f5;border-radius:6px;font-size:14px;color:#27272a;white-space:pre-line;">${escape(args.body)}</div>`,
      ctaHref: url(`/admin/messages/${args.messageId}`),
      ctaLabel: "Répondre",
    }),
  });
}

// ── New announcement (broadcast to parents) ───────────────────────

export async function sendAnnouncementEmail(args: {
  to: MailRecipient | MailRecipient[];
  tenantName: string;
  title: string;
  body: string;
}) {
  return sendMail({
    to: args.to,
    subject: `[${args.tenantName}] ${args.title}`,
    tag: "announcement",
    html: htmlLayout({
      preheader: args.body.slice(0, 140),
      heading: args.title,
      intro: undefined,
      bodyHtml: `<div style="font-size:14px;color:#27272a;white-space:pre-line;">${escape(args.body)}</div>`,
      ctaHref: url(`/parent/announcements`),
      ctaLabel: "Voir toutes les annonces",
    }),
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
