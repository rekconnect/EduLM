"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { unscopedDb } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { createFamily } from "@/lib/family";
import { isStaffDomainEmail as isStaffDomain } from "@/lib/staff-identity";
import { clientIp, consumeRateLimit, limitByIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile-actions";

// ── Abuse controls on the public sign-up ────────────────────────────────────
// Anyone on the internet can reach this action, so before a row is written:
//  - honeypot      : bots that fill every input are dropped silently;
//  - per-IP limit  : SIGNUP_IP_LIMIT well-formed attempts per hour per address;
//  - Turnstile     : enforced when the tenant configured the keys (lib/turnstile);
//  - per-tenant cap: SIGNUP_TENANT_LIMIT per hour for the whole school — the
//                    ceiling a distributed bot run hits (per-IP limits can't
//                    see it) while staying generous for a real campaign day.
// Email verification before activation is the next layer (needs Resend).
const SIGNUP_IP_LIMIT = 5;
const SIGNUP_TENANT_LIMIT = 100;
const SIGNUP_WINDOW_SEC = 60 * 60;
/** Visually hidden form field — real browsers leave it empty. */
const HONEYPOT_FIELD = "company_url";

// ── New-family sign-up: Responsable 1 (required) + Responsable 2 (optional) ──
// Creates a shared Family + a Guardian per responsable so both can access the
// family's dossiers from day one. Only for families with NO prior student
// (the other two situations route to sign-in instead).

const respSchema = z.object({
  email: z.string().email().max(200),
  lastName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
  password2: z.string().min(1),
});

/** `formError` codes — translated in _flow.tsx. */
export type SignUpFormErrorCode =
  | "unknownTenant"
  | "tooMany"
  | "captcha"
  | "captchaUnavailable"
  | "unavailable";

export type SignUpFamilyState = {
  errors?: Record<string, string>; // keys like "r1.email", "r2.password"
  formError?: SignUpFormErrorCode;
};

function readResp(fd: FormData, prefix: "r1" | "r2") {
  return {
    email: String(fd.get(`${prefix}.email`) ?? "").toLowerCase().trim(),
    lastName: String(fd.get(`${prefix}.lastName`) ?? ""),
    firstName: String(fd.get(`${prefix}.firstName`) ?? ""),
    password: String(fd.get(`${prefix}.password`) ?? ""),
    password2: String(fd.get(`${prefix}.password2`) ?? ""),
  };
}

export async function signUpFamily(
  _prev: SignUpFamilyState,
  formData: FormData,
): Promise<SignUpFamilyState> {
  // Tenant slug must come from the request (middleware-set header) so a
  // signed-up parent always belongs to the tenant whose subdomain they used.
  // Fall back to a hidden form field for path-based dev.
  const h = await headers();
  const slugFromHeader = h.get("x-tenant-slug");
  const slugFromForm = String(formData.get("tenantSlug") ?? "");
  const tenantSlug = (slugFromHeader || slugFromForm).toLowerCase().trim();
  if (!tenantSlug) return { formError: "unknownTenant" };

  // Honeypot: a filled hidden field is a bot. Generic answer, nothing written.
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim()) {
    return { formError: "unavailable" };
  }

  const r1raw = readResp(formData, "r1");
  const r2raw = readResp(formData, "r2");
  const r2HasAny = Object.values(r2raw).some((v) => v.trim().length > 0);

  const errors: Record<string, string> = {};
  const r1 = respSchema.safeParse(r1raw);
  if (!r1.success) {
    for (const i of r1.error.issues) errors[`r1.${String(i.path[0])}`] = i.message;
  } else if (r1raw.password !== r1raw.password2) {
    errors["r1.password2"] = "mismatch";
  }

  let r2: z.infer<typeof respSchema> | null = null;
  if (r2HasAny) {
    const p = respSchema.safeParse(r2raw);
    if (!p.success) {
      for (const i of p.error.issues) errors[`r2.${String(i.path[0])}`] = i.message;
    } else if (r2raw.password !== r2raw.password2) {
      errors["r2.password2"] = "mismatch";
    } else {
      r2 = p.data;
    }
    if (r1.success && r2 && r1.data.email === r2.email) {
      errors["r2.email"] = "same";
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  const r1d = r1.success ? r1.data : null;
  if (!r1d) return { errors };

  // Count the attempt once the form is well-formed (typos don't burn quota),
  // and BEFORE anything that touches the DB or reveals whether an email exists.
  const ipGate = await limitByIp("sign-up", SIGNUP_IP_LIMIT, SIGNUP_WINDOW_SEC);
  if (!ipGate.ok) return { formError: "tooMany" };

  const db = unscopedDb();
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, defaultLocale: true, staffEmailDomains: true },
  });
  if (!tenant) return { formError: "unknownTenant" };

  // Bot check before the per-tenant counter, so failed bot traffic can't
  // exhaust the school's hourly quota for real families.
  const bot = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""), {
    remoteIp: await clientIp(),
    expectedAction: TURNSTILE_ACTIONS.signUp,
  });
  if (!bot.ok) {
    return { formError: bot.reason === "unavailable" ? "captchaUnavailable" : "captcha" };
  }

  const tenantGate = await consumeRateLimit({
    key: `sign-up:tenant:${tenant.id}`,
    limit: SIGNUP_TENANT_LIMIT,
    windowSec: SIGNUP_WINDOW_SEC,
  });
  if (!tenantGate.ok) return { formError: "tooMany" };

  // Email uniqueness within the tenant.
  const emails = [r1d.email, ...(r2 ? [r2.email] : [])];
  const taken = await db.user.findMany({
    where: { tenantId: tenant.id, email: { in: emails } },
    select: { email: true },
  });
  const takenSet = new Set(taken.map((u) => u.email));
  if (takenSet.has(r1d.email)) errors["r1.email"] = "exists";
  if (r2 && takenSet.has(r2.email)) errors["r2.email"] = "exists";
  // Staff addresses can't be self-registered as parents: a squatted staff
  // address could later be handed staff access (double profil).
  if (isStaffDomain(r1d.email, tenant.staffEmailDomains)) errors["r1.email"] = "staffDomain";
  if (r2 && isStaffDomain(r2.email, tenant.staffEmailDomains)) errors["r2.email"] = "staffDomain";
  if (Object.keys(errors).length > 0) return { errors };

  // Shared family, then a User + Guardian per responsable.
  const family = await createFamily(tenant.id, {
    name: `Famille ${r1d.lastName}`,
  });

  async function createResponsable(d: z.infer<typeof respSchema>) {
    const passwordHash = await bcrypt.hash(d.password, 10);
    const user = await db.user.create({
      data: {
        tenantId: tenant!.id,
        email: d.email,
        firstName: d.firstName,
        lastName: d.lastName,
        name: `${d.firstName} ${d.lastName}`.trim(),
        passwordHash,
        role: "PARENT",
        // Self-registered: nobody has verified this address yet, so
        // `emailVerified` stays null (it is set when the address is confirmed
        // or when an admin creates the account). The account can sign in and
        // start a dossier, but the Parents console lists it under
        // "Comptes en attente" until a child is linked by the school.
        status: "ACTIVE",
        locale: tenant!.defaultLocale,
      },
      select: { id: true },
    });
    await db.guardian.create({
      data: { tenantId: tenant!.id, userId: user.id, familyId: family.id },
    });
  }

  await createResponsable(r1d);
  if (r2) await createResponsable(r2);

  await signIn("credentials", {
    email: r1d.email,
    password: r1d.password,
    tenantSlug,
    redirectTo: "/parent/applications",
  });
  redirect("/parent/applications");
}
