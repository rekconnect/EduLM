import { NextResponse, type NextRequest } from "next/server";
import { extractTenantSlugFromHost, extractTenantSlugFromPath } from "@/lib/tenant-resolve";

const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/api/auth",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const host = request.headers.get("host");

  let slug = extractTenantSlugFromHost(host);
  let rewritePath: string | null = null;

  if (!slug) {
    const { slug: pathSlug, rest } = extractTenantSlugFromPath(nextUrl.pathname);
    if (pathSlug) {
      slug = pathSlug;
      rewritePath = rest;
    }
  }

  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);

  // For path-based tenant access in dev, rewrite so `/t/montaigne/dashboard`
  // serves the same routes as `montaigne.edulm.app/dashboard`.
  const response = rewritePath
    ? NextResponse.rewrite(new URL(rewritePath, nextUrl), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  // Mark whether the request is on the root marketing domain vs a tenant context.
  response.headers.set("x-tenant-slug", slug ?? "");
  response.headers.set("x-is-tenant-request", slug ? "1" : "0");

  // Auth gate: anything that needs auth is enforced inside route handlers /
  // server components via Auth.js helpers — middleware just annotates context.
  void isPublic; // reserved for later route-group gating

  return response;
}

export const config = {
  matcher: [
    // Exclude Next internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)",
  ],
};
