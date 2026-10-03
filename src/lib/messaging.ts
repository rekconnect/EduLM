import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db, unscopedDb } from "./db";
import { htmlLayout, sendMailBatch, type SendMailInput } from "./mailer";
import { getAdminAccess, hasModule } from "./permissions";
import { levelSpellings, sortLevels } from "./levels";
import type { AudienceSpec } from "./messaging-shared";

/**
 * Server half of the messagerie: audience resolution, audience labels,
 * unread counts and per-recipient email notifications.
 *
 * resolveAudience / describeAudience use the tenant-SCOPED `db`, so they must
 * run inside runWithTenant (every caller is a guarded server action / page).
 */

export type ResolvedParent = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  status: "INVITED" | "ACTIVE" | "DISABLED";
};

/**
 * Disabled parent accounts still RECEIVE messages (Raed 2026-09-30): the
 * message waits in their inbox for when the account is activated — but they
 * are never emailed. Placeholder addresses (reserved TLDs such as the import's
 * "@import.lyceemontaigne.local") are never emailed either.
 */
export function isEmailable(p: { email: string; status: string }): boolean {
  if (p.status === "DISABLED") return false;
  const e = p.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !/\.(local|invalid|test|example|localhost)$/.test(e);
}

/** Addresses to notify for a resolved audience (active, real mailboxes only). */
export function emailableAddresses(recipients: ResolvedParent[]): string[] {
  return recipients.filter(isEmailable).map((r) => r.email);
}

export function parentDisplayName(
  u: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null | undefined,
): string {
  // Author/sender can be null once the account was deleted (SetNull).
  if (!u) return "Compte supprimé";
  const full = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return full || u.name?.trim() || u.email || "—";
}

async function activeYearId(): Promise<string | null> {
  const y = await db.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return y?.id ?? null;
}

/** Levels covered by the chosen establishments (Establishment.levels JSON). */
async function establishmentLevels(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.establishment.findMany({
    where: { id: { in: ids } },
    select: { levels: true },
  });
  const out = new Set<string>();
  for (const r of rows) {
    if (Array.isArray(r.levels)) {
      for (const l of r.levels) if (typeof l === "string" && l.trim()) out.add(l.trim());
    }
  }
  return [...out];
}

/**
 * Resolve an audience to the parent accounts that receive it. UNION of:
 *   - group clauses (all / establishments / levels / classes): parents with a
 *     child currently enrolled (active year, not withdrawn) matching the clause;
 *   - explicit families (every guardian of the family) and parents.
 * Includes DISABLED accounts (the message waits in their inbox; see
 * isEmailable — they are never emailed). Excludes archived and deleted
 * accounts. Deduplicated.
 */
export async function resolveAudience(spec: AudienceSpec): Promise<ResolvedParent[]> {
  const or: Prisma.UserWhereInput[] = [];

  const hasGroup =
    spec.all ||
    !!spec.establishmentIds?.length ||
    !!spec.levels?.length ||
    !!spec.classIds?.length;

  if (hasGroup) {
    const yearId = await activeYearId();
    if (yearId) {
      const levels = new Set<string>();
      for (const l of [
        ...(spec.levels ?? []),
        ...(await establishmentLevels(spec.establishmentIds ?? [])),
      ]) {
        for (const s of levelSpellings(l)) levels.add(s);
      }
      const base: Prisma.EnrollmentWhereInput = {
        academicYearId: yearId,
        withdrawnAt: null,
        student: { status: { notIn: ["WITHDRAWN", "GRADUATED"] } },
      };
      const clauses: Prisma.EnrollmentWhereInput[] = [];
      if (spec.all) clauses.push({});
      if (spec.classIds?.length) clauses.push({ classId: { in: spec.classIds } });
      if (levels.size) clauses.push({ class: { level: { in: [...levels] } } });
      const enrollmentWhere: Prisma.EnrollmentWhereInput = spec.all
        ? base
        : { ...base, OR: clauses };
      or.push({
        guardianProfile: {
          childLinks: { some: { student: { enrollments: { some: enrollmentWhere } } } },
        },
      });
    }
  }
  if (spec.familyIds?.length) {
    or.push({ guardianProfile: { familyId: { in: spec.familyIds } } });
  }
  if (spec.parentUserIds?.length) {
    or.push({ id: { in: spec.parentUserIds } });
  }
  if (!or.length) return [];

  return db.user.findMany({
    where: {
      role: "PARENT",
      deletedAt: null,
      archived: false,
      OR: or,
    },
    select: { id: true, email: true, name: true, firstName: true, lastName: true, status: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/** Human summary of an audience, e.g. "Classes : CE1 A, CE1 B · 2 parents". */
export async function describeAudience(spec: AudienceSpec): Promise<string> {
  if (spec.all) return "Toute l'école";
  const parts: string[] = [];
  if (spec.establishmentIds?.length) {
    const rows = await db.establishment.findMany({
      where: { id: { in: spec.establishmentIds } },
      select: { name: true },
      orderBy: { order: "asc" },
    });
    if (rows.length) parts.push(`Établissement : ${rows.map((r) => r.name).join(", ")}`);
  }
  if (spec.levels?.length) {
    parts.push(`Niveaux : ${sortLevels([...spec.levels]).join(", ")}`);
  }
  if (spec.classIds?.length) {
    const rows = await db.class.findMany({
      where: { id: { in: spec.classIds } },
      select: { name: true },
      orderBy: [{ level: "asc" }, { section: "asc" }],
    });
    if (rows.length) {
      const names = rows.map((r) => r.name);
      parts.push(
        `Classes : ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` +${names.length - 6}` : ""}`,
      );
    }
  }
  if (spec.familyIds?.length) {
    const n = spec.familyIds.length;
    parts.push(`${n} famille${n > 1 ? "s" : ""}`);
  }
  if (spec.parentUserIds?.length) {
    const n = spec.parentUserIds.length;
    parts.push(`${n} parent${n > 1 ? "s" : ""}`);
  }
  return parts.join(" · ") || "—";
}

// ── Recipient-picker options (active year) ─────────────────────────────

export async function loadPickerOptions(): Promise<{
  establishments: { id: string; name: string }[];
  levels: string[];
  classes: { id: string; name: string; level: string }[];
}> {
  const yearId = await activeYearId();
  const [establishments, classes] = await Promise.all([
    db.establishment.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { order: "asc" },
    }),
    yearId
      ? db.class.findMany({
          where: { academicYearId: yearId },
          select: { id: true, name: true, level: true },
          orderBy: [{ level: "asc" }, { section: "asc" }],
        })
      : Promise.resolve([] as { id: string; name: string; level: string }[]),
  ]);
  const levels = sortLevels([...new Set(classes.map((c) => c.level))]);
  return { establishments, levels, classes };
}

// ── Unread counts (layout badges — run outside tenant context) ─────────

export async function schoolUnreadCount(tenantId: string): Promise<number> {
  return unscopedDb().messageThread.count({
    where: { tenantId, schoolUnread: true, status: "OPEN" },
  });
}

export async function parentUnreadCount(tenantId: string, userId: string): Promise<number> {
  return unscopedDb().messageThread.count({
    where: { tenantId, parentUserId: userId, parentUnread: true },
  });
}

// ── Email notifications ────────────────────────────────────────────────
// One email PER RECIPIENT (never a shared To: list — that would expose every
// family's address to every other family). Delivered after the response via
// next/server `after`, so a large send never delays the action. sendMail is a
// no-op until RESEND_API_KEY is configured; nothing here ever throws.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
function appUrl(path: string): string {
  return `${APP_URL.replace(/\/$/, "")}${path}`;
}
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function tenantName(tenantId: string): Promise<string> {
  const t = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return t?.name ?? "EduLM";
}

/** Build one email per address and deliver through the paced batch sender. */
async function sendEach(
  emails: string[],
  build: (email: string) => SendMailInput,
): Promise<void> {
  const result = await sendMailBatch(emails.map(build));
  if (result.failed) {
    console.error(`[messaging] ${result.failed} notification email(s) failed`);
  }
}

/** New school → parents message (broadcast or direct). */
export function notifyParentsOfMessage(args: {
  tenantId: string;
  emails: string[];
  subject: string;
  body: string;
  kind?: "message" | "announcement";
}): void {
  const emails = [...new Set(args.emails.filter(Boolean))];
  if (!emails.length) return;
  after(async () => {
    const school = await tenantName(args.tenantId);
    const isAnn = args.kind === "announcement";
    await sendEach(emails, (to) => ({
      to,
      subject: `[${school}] ${args.subject}`,
      tag: isAnn ? "announcement" : "message",
      html: htmlLayout({
        preheader: args.body.slice(0, 140),
        heading: args.subject,
        bodyHtml: `<div style="font-size:14px;color:#27272a;white-space:pre-line;">${esc(args.body)}</div>`,
        ctaHref: appUrl(isAnn ? "/parent/announcements" : "/parent/messages"),
        ctaLabel: isAnn ? "Voir les annonces" : "Ouvrir la messagerie",
      }),
    }));
  });
}

/** A parent wrote (new thread or reply) → the school staff concerned. */
export function notifySchoolOfParentPost(args: {
  tenantId: string;
  threadId: string;
  subject: string;
  body: string;
  fromName: string;
  fromEmail: string;
  /** Staff user who sent the original broadcast, if any — notified too. */
  broadcastSenderId?: string | null;
}): void {
  after(async () => {
    const u = unscopedDb();
    const staff = await u.user.findMany({
      where: { tenantId: args.tenantId, status: "ACTIVE", role: "SCHOOL_ADMIN", deletedAt: null },
      select: { email: true },
    });
    // The staff member who sent the original message is told too — but only
    // if they STILL may read the inbox (their Communication grant may have
    // been revoked since, or their account disabled).
    if (args.broadcastSenderId) {
      const sender = await u.user.findFirst({
        where: {
          id: args.broadcastSenderId,
          tenantId: args.tenantId,
          status: "ACTIVE",
          deletedAt: null,
          archived: false,
        },
        select: { id: true, email: true, role: true, tenantId: true },
      });
      // Background eligibility check — no token here, so "now" stands in for
      // the issue time (status/deletion still decide; revocation is moot).
      if (
        sender &&
        hasModule(
          await getAdminAccess({ ...sender, issuedAt: Date.now() }),
          "communication",
          "read",
        )
      ) {
        staff.push({ email: sender.email });
      }
    }
    const school = await tenantName(args.tenantId);
    await sendEach(
      [...new Set(staff.map((s) => s.email))].filter(
        (e) => e.toLowerCase() !== args.fromEmail.toLowerCase(),
      ),
      (to) => ({
        to,
        replyTo: args.fromEmail,
        subject: `[${school}] Message de ${args.fromName} : ${args.subject}`,
        tag: "message-parent",
        html: htmlLayout({
          preheader: args.body.slice(0, 140),
          heading: args.subject,
          intro: `${args.fromName} (${args.fromEmail}) a écrit :`,
          bodyHtml: `<div style="font-size:14px;color:#27272a;white-space:pre-line;">${esc(args.body)}</div>`,
          ctaHref: appUrl(`/admin/messages/${args.threadId}`),
          ctaLabel: "Répondre dans EduLM",
        }),
      }),
    );
  });
}

/** The school replied in a thread → that parent. */
export function notifyParentOfReply(args: {
  tenantId: string;
  threadId: string;
  email: string;
  subject: string;
  body: string;
}): void {
  if (!args.email) return;
  after(async () => {
    const school = await tenantName(args.tenantId);
    await sendEach([args.email], (to) => ({
      to,
      subject: `[${school}] Réponse : ${args.subject}`,
      tag: "message-reply",
      html: htmlLayout({
        preheader: args.body.slice(0, 140),
        heading: args.subject,
        intro: "L'école vous a répondu :",
        bodyHtml: `<div style="font-size:14px;color:#27272a;white-space:pre-line;">${esc(args.body)}</div>`,
        ctaHref: appUrl(`/parent/messages/${args.threadId}`),
        ctaLabel: "Voir la conversation",
      }),
    }));
  });
}
