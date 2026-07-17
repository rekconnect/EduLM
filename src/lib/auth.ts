import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { unscopedDb } from "./db";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      tenantId: string | null;
      locale: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    tenantId?: string | null;
    locale?: string | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

const prisma = unscopedDb();

/**
 * Resolve the EduLM user an OAuth (Microsoft) sign-in should attach to.
 * `User.email` is unique per (tenantId, email) — NOT globally — so the same
 * address can exist at several tenants (or as both a parent and a staff
 * account). Prefer staff-side roles; never resolve disabled/deleted accounts.
 *
 * SUPER_ADMIN is deliberately EXCLUDED: platform operators are not identities
 * in any school's Microsoft directory, so SSO must never mint a super-admin
 * session (defence-in-depth against a directory-scoped email colliding with a
 * super-admin address). Super admins sign in with credentials.
 */
async function findOAuthUser(email: string | null | undefined) {
  if (!email) return null;
  const matches = await prisma.user.findMany({
    where: {
      email: email.toLowerCase().trim(),
      deletedAt: null,
      status: { not: "DISABLED" },
      role: { not: "SUPER_ADMIN" },
    },
    take: 4,
  });
  if (matches.length <= 1) return matches[0] ?? null;
  const rank = (r: Role) =>
    r === "STAFF" ? 0 : r === "TEACHER" ? 1 : r === "SCHOOL_ADMIN" ? 2 : 3;
  return [...matches].sort((a, b) => rank(a.role) - rank(b.role))[0]!;
}

const baseAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...baseAdapter,
  // The stock implementation does findUnique({ where: { email } }), which
  // throws because email alone is not a unique column in this schema. Route
  // it through the same resolution the signIn callback uses so the OAuth
  // account links to the intended user.
  async getUserByEmail(email) {
    const user = await findOAuthUser(email);
    return user ? (user as unknown as AdapterUser) : null;
  },
};

const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      tenantSlug: { label: "Tenant", type: "text" },
    },
    async authorize(rawCredentials) {
      const parsed = credentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;
      // Defensive: FormData/serialization round-trips can turn a missing slug
      // into the literal strings "null" or "undefined". Treat those as absent.
      const rawSlug = parsed.data.tenantSlug;
      const tenantSlug =
        rawSlug && rawSlug !== "null" && rawSlug !== "undefined" && rawSlug.trim() !== ""
          ? rawSlug.trim().toLowerCase()
          : null;
      const normalizedEmail = email.toLowerCase().trim();

      let user;
      try {
        if (tenantSlug) {
          const tenant = await prisma.tenant.findUnique({
            where: { slug: tenantSlug },
            select: { id: true },
          });
          if (!tenant) return null;
          user = await prisma.user.findFirst({
            where: { email: normalizedEmail, tenantId: tenant.id },
          });
        } else {
          // No slug: try super-admin (tenant-less) first, then a globally-unique
          // tenant-bound match. Ambiguous matches (same email at >1 tenant) are
          // rejected — caller must provide tenantSlug.
          user = await prisma.user.findFirst({
            where: { email: normalizedEmail, tenantId: null },
          });
          if (!user) {
            const matches = await prisma.user.findMany({
              where: { email: normalizedEmail, tenantId: { not: null } },
              take: 2,
            });
            if (matches.length === 1) user = matches[0];
          }
        }
      } catch (e) {
        console.error("[auth] DB lookup failed:", e);
        return null;
      }

      if (!user || !user.passwordHash || user.status === "DISABLED") return null;

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        locale: user.locale,
      };
    },
  }),
];

if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? "noreply@edulm.app",
      apiKey: process.env.RESEND_API_KEY,
    }),
  );
}

// Microsoft SSO is enabled ONLY with a single-tenant issuer locked to the
// school's own directory:
//   https://login.microsoftonline.com/<directory-tenant-id>/v2.0
// This is a hard security requirement, not a convenience. With the multi-tenant
// "common"/"organizations"/"consumers" authority, ANY Azure directory can mint
// a token, and Entra's `email` claim is attacker-settable — so allowing account
// linking by email would be a cross-tenant account-takeover ("nOAuth"). Locking
// the issuer means only the school's directory can assert those emails, which is
// exactly what makes email-based linking safe. If the ID+secret are set but the
// issuer is missing or points at a shared authority, SSO stays OFF and we warn.
const msIssuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim();
const msIssuerIsSingleTenant =
  !!msIssuer &&
  /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0\/?$/i.test(msIssuer) &&
  !/\/(common|organizations|consumers)\/v2\.0\/?$/i.test(msIssuer);

export const microsoftSignInEnabled = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    msIssuerIsSingleTenant,
);

if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  !msIssuerIsSingleTenant
) {
  console.warn(
    "[auth] Microsoft SSO disabled: AUTH_MICROSOFT_ENTRA_ID_ISSUER must be a " +
      "single-tenant issuer (https://login.microsoftonline.com/<tenant-id>/v2.0). " +
      "Refusing to enable email-linked SSO on a shared authority.",
  );
}

if (microsoftSignInEnabled) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: msIssuer,
      // Safe ONLY because the issuer above is locked to the school's own
      // directory, which verifies the email claim it mints.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "microsoft-entra-id") return true;
      // Microsoft sign-in never self-provisions: the address must already
      // belong to an EduLM user (staff accounts are created from /payroll when
      // the admin sets the employee's email). Unknown address → friendly error.
      const existing = await findOAuthUser(user.email);
      return existing ? true : "/sign-in?error=NoAccount";
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.locale = (user as { locale: string | null }).locale;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role!;
        session.user.tenantId = token.tenantId ?? null;
        session.user.locale = token.locale ?? null;
      }
      return session;
    },
  },
});
