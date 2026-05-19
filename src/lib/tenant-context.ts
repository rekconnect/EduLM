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

// Cache on globalThis so HMR module reloads don't replace the instance.
// The Prisma client (in db.ts) is cached globally too; if `storage` got a fresh
// identity on every reload, the cached extension would read from a storage
// the live request never wrote to, yielding spurious "no tenant in context" errors.
const globalForTenant = globalThis as unknown as {
  __edulmTenantStorage?: AsyncLocalStorage<TenantContext>;
};

const storage =
  globalForTenant.__edulmTenantStorage ??
  new AsyncLocalStorage<TenantContext>();

if (process.env.NODE_ENV !== "production") {
  globalForTenant.__edulmTenantStorage = storage;
}

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
