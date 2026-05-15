import NextAuth, { type DefaultSession } from "next-auth";
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
  email: z.string().email(),
  password: z.string().min(8),
  tenantSlug: z.string().optional(),
});

const prisma = unscopedDb();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantSlug: { label: "Tenant", type: "text" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password, tenantSlug } = parsed.data;

        const tenant = tenantSlug
          ? await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } })
          : null;

        const user = await prisma.user.findFirst({
          where: {
            email: email.toLowerCase(),
            ...(tenant ? { tenantId: tenant.id } : { tenantId: null }),
          },
        });

        if (!user?.passwordHash) return null;
        if (user.status === "DISABLED") return null;

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
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? "noreply@edulm.app",
      apiKey: process.env.RESEND_API_KEY,
    }),
  ],
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
