import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { unscopedDb } from "./db";
import { runWithTenant, type TenantContext } from "./tenant-context";

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  defaultLocale: string;
  enabledLocales: string[];
};

/**
 * Resolves the current tenant from the `x-tenant-slug` header set by
 * middleware. Throws 404 if the slug is missing or doesn't match a row.
 */
export async function getCurrentTenant(): Promise<ResolvedTenant> {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) notFound();

  const db = unscopedDb();
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, defaultLocale: true, enabledLocales: true },
    });
    if (!tenant) notFound();
    return tenant;
  } finally {
    await db.$disconnect();
  }
}

/**
 * Wraps an async operation so its Prisma queries are auto-scoped to the
 * given tenant. Use in Server Components, Server Actions, and route handlers.
 */
export function withTenant<T>(tenant: TenantContext, fn: () => Promise<T> | T): Promise<T> | T {
  return runWithTenant(tenant, fn);
}
