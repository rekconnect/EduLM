import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  providers,
  callbacks: {
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
