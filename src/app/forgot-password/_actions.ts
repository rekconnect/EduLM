"use server";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { unscopedDb } from "@/lib/db";
import { htmlLayout, isMailerConfigured, sendMail } from "@/lib/mailer";

/**
 * Self-service password reset by emailed code (public actions — no session).
 *
 * Security model:
 *  - Responses NEVER reveal whether an email has an account (anti-enumeration).
 *  - Code: 8 chars from a 31-char unambiguous alphabet (~8.5e11 combinations),
 *    15-minute expiry, stored as a sha256 hash in VerificationToken, deleted
 *    on success. One active code per account; re-requests within 2 minutes
 *    are silently ignored (throttle).
 *  - SUPER_ADMIN is excluded (the owner resets via script, never via email).
 *  - Ambiguous emails (same address at several tenants) are skipped silently.
 */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;
const EXPIRY_MIN = 15;
const IDENT_PREFIX = "pwreset:";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

function genCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve the ONE eligible account for an email, or null (0 or ambiguous). */
async function resolveAccount(email: string) {
  const u = unscopedDb();
  const matches = await u.user.findMany({
    where: {
      email: email.toLowerCase().trim(),
      role: { not: "SUPER_ADMIN" },
      status: { not: "DISABLED" },
    },
    select: { id: true, email: true, name: true, tenantId: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0]! : null;
}

export type ForgotState = { ok: boolean; error?: string };

export async function requestPasswordReset(emailRaw: string): Promise<ForgotState> {
  // Uniform response shape + small fixed delay whatever the outcome.
  await sleep(400);
  if (!isMailerConfigured()) return { ok: true };
  const email = String(emailRaw ?? "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: true };

  const account = await resolveAccount(email);
  if (!account) return { ok: true };

  const u = unscopedDb();
  const identifier = `${IDENT_PREFIX}${account.id}`;
  // Throttle: an active code created less than ~2 minutes ago → don't resend.
  const existing = await u.verificationToken.findFirst({ where: { identifier } });
  if (existing && existing.expires.getTime() > Date.now() + (EXPIRY_MIN - 2) * 60_000) {
    return { ok: true };
  }

  const code = genCode();
  await u.verificationToken.deleteMany({ where: { identifier } });
  await u.verificationToken.create({
    data: {
      identifier,
      token: hash(code),
      expires: new Date(Date.now() + EXPIRY_MIN * 60_000),
    },
  });

  const link = `${APP_URL.replace(/\/$/, "")}/forgot-password?email=${encodeURIComponent(email)}&code=${code}`;
  await sendMail({
    to: account.email,
    subject: "Réinitialisation de votre mot de passe",
    tag: "password-reset",
    html: htmlLayout({
      preheader: "Votre code de réinitialisation (valable 15 minutes)",
      heading: "Réinitialisation du mot de passe",
      intro: `Bonjour${account.name ? ` ${account.name}` : ""}, voici votre code de réinitialisation. Il expire dans ${EXPIRY_MIN} minutes.`,
      bodyHtml: `<p style="font-size:26px;font-weight:700;letter-spacing:4px;font-family:monospace;margin:8px 0 4px;">${code}</p>
        <p style="color:#71717a;font-size:13px;margin:12px 0 0;">Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet e-mail — votre mot de passe reste inchangé.</p>`,
      ctaHref: link,
      ctaLabel: "Choisir un nouveau mot de passe",
    }),
    text: `Votre code de réinitialisation : ${code} (valable ${EXPIRY_MIN} minutes)\n${link}`,
  });
  return { ok: true };
}

export async function resetPasswordWithCode(
  emailRaw: string,
  codeRaw: string,
  password: string,
): Promise<ForgotState> {
  await sleep(400);
  const email = String(emailRaw ?? "").toLowerCase().trim();
  const code = String(codeRaw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "password-too-short" };
  }
  const account = await resolveAccount(email);
  if (!account) return { ok: false, error: "invalid-code" };

  const u = unscopedDb();
  const identifier = `${IDENT_PREFIX}${account.id}`;
  const row = await u.verificationToken.findFirst({ where: { identifier } });
  if (!row || row.token !== hash(code)) return { ok: false, error: "invalid-code" };
  if (row.expires.getTime() < Date.now()) {
    await u.verificationToken.deleteMany({ where: { identifier } });
    return { ok: false, error: "invalid-code" };
  }

  await u.verificationToken.deleteMany({ where: { identifier } });
  const passwordHash = await bcrypt.hash(password, 10);
  await u.user.update({
    where: { id: account.id },
    data: { passwordHash, status: "ACTIVE", mustChangePassword: false, sessionsInvalidBefore: new Date() },
  });
  return { ok: true };
}
