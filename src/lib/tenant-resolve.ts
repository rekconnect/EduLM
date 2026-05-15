/**
 * Edge-safe slug extraction. Two strategies:
 *   1. Production: subdomain (e.g. `montaigne.edulm.app` → `montaigne`)
 *   2. Dev / fallback: path prefix `/t/<slug>/...`
 *
 * Pure functions — no DB access. The DB lookup lives in `with-tenant.ts`
 * which runs in the Node.js runtime.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "edulm.app";

export function extractTenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]!.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return hostname.slice(0, -1 - ROOT_DOMAIN.length);
  }
  return null;
}

export function extractTenantSlugFromPath(pathname: string): {
  slug: string | null;
  rest: string;
} {
  const match = pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
  if (!match) return { slug: null, rest: pathname };
  return { slug: match[1]!, rest: match[2] ?? "/" };
}
