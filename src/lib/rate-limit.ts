import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { unscopedDb } from "./db";

/**
 * Fixed-window rate limiting for PUBLIC endpoints (sign-up, password reset).
 *
 * Why a DB table and not memory: the app runs as many short-lived serverless
 * instances on Vercel, so an in-process map would be a different map on every
 * request. `RateLimitBucket` has no tenantId on purpose — it sits outside the
 * tenant auto-scoping and is reached through `unscopedDb()`.
 *
 * The counter is a single atomic upsert (INSERT … ON CONFLICT … RETURNING):
 * concurrent requests from the same key can never under-count.
 *
 * Failure mode is OPEN: if the table is missing or the DB hiccups, the request
 * is allowed and the error is logged. Locking real families out because a
 * counter table is unreachable would be worse than letting one burst through —
 * and if the DB is really down, the write that follows fails anyway.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export async function consumeRateLimit(opts: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const { key, limit, windowSec } = opts;
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  try {
    const rows = await unscopedDb().$queryRaw<Array<{ count: number; resetAt: Date }>>(
      Prisma.sql`
        INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
        VALUES (${key}, 1, ${resetAt})
        ON CONFLICT ("key") DO UPDATE SET
          "count"   = CASE WHEN "RateLimitBucket"."resetAt" > ${now}
                           THEN "RateLimitBucket"."count" + 1 ELSE 1 END,
          "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" > ${now}
                           THEN "RateLimitBucket"."resetAt" ELSE ${resetAt} END
        RETURNING "count", "resetAt"
      `,
    );
    const row = rows[0];
    if (!row) return { ok: true, remaining: Math.max(0, limit - 1) };

    if (row.count > limit) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000),
      );
      return { ok: false, retryAfterSec };
    }

    // Opportunistic cleanup: whenever a window is (re)opened, occasionally
    // drop buckets whose window closed more than a day ago. Keeps the table
    // small without a cron. Fire-and-forget.
    if (row.count === 1 && Math.random() < 0.05) {
      void unscopedDb()
        .rateLimitBucket.deleteMany({
          where: { resetAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } },
        })
        .catch(() => {});
    }
    return { ok: true, remaining: limit - row.count };
  } catch (e) {
    console.error(
      "[rate-limit] store unavailable, allowing request:",
      e instanceof Error ? e.message : e,
    );
    return { ok: true, remaining: limit };
  }
}

/**
 * Best-effort client IP. On Vercel both headers are set by the platform from
 * the real connection and cannot be forged by the client. Behind other proxies
 * `x-forwarded-for` could be client-supplied — which is why per-IP limits are
 * always paired with a per-tenant ceiling (see sign-up).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Collapse an address to the unit a client cannot cheaply rotate: the full
 * IPv4 address, or the /64 prefix of an IPv6 address (ISPs hand every
 * subscriber a whole /64, so keying on all 128 bits would give one host
 * unlimited fresh buckets). Ports, brackets and zone ids are stripped;
 * IPv4-mapped IPv6 collapses to the IPv4.
 */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!ip) return "unknown";
  const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (v4) return v4[1]!;
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  if (groups.length < 4) return ip;
  return groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().padStart(4, "0"))
    .join(":")
    .concat("::/64");
}

/** Salted hash so raw IP addresses never land in the table. */
export function rateLimitKeyHash(...parts: string[]): string {
  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? ""}|${parts.join("|")}`)
    .digest("hex")
    .slice(0, 40);
}

/** `limit` requests per `windowSec` per client (IPv4 address / IPv6 /64). */
export async function limitByIp(
  scope: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const ip = normalizeIp(await clientIp());
  return consumeRateLimit({
    key: `${scope}:ip:${rateLimitKeyHash(ip)}`,
    limit,
    windowSec,
  });
}
