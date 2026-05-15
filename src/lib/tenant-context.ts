import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Holds the resolved tenant for the lifetime of a single request. Populated by
 * `middleware`/route handlers and consumed by the tenant-scoped Prisma client
 * extension so callers never have to thread `tenantId` through every query.
 *
 * `null` is valid for SUPER_ADMIN paths that must see across tenants.
 */
export type TenantContext = {
  tenantId: string | null;
  slug: string | null;
};

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenantId(): string {
  const ctx = storage.getStore();
  if (!ctx?.tenantId) {
    throw new Error(
      "No tenant in context. Wrap the call in `runWithTenant({...}, () => ...)` or hit a tenant-scoped route.",
    );
  }
  return ctx.tenantId;
}
