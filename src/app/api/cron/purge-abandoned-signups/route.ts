import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { purgeAbandonedSignups } from "@/lib/signup-retention";

/**
 * Daily job (see vercel.json): hard-deletes the self-registered parent
 * accounts that never started a dossier, for every tenant that set a delay in
 * Settings → Formulaires. Rules and safeguards: src/lib/signup-retention.ts.
 *
 * Vercel calls this with `Authorization: Bearer $CRON_SECRET`. Without that
 * variable the route refuses every call — the feature is inert until the
 * secret is configured. The response and the log carry counts only, never an
 * e-mail address.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const reports = await purgeAbandonedSignups({
      dryRun: false,
      // Stay well inside maxDuration; whatever is left is picked up tomorrow.
      timeBudgetMs: 40_000,
    });
    const tenants = reports.map((r) => ({
      tenant: r.slug,
      days: r.days,
      status: r.status,
      due: r.candidates.length + r.notListed,
      deleted: r.deleted,
      skipped: r.skipped,
      leftForNextRun: r.notListed + r.notAttempted,
    }));
    console.log("[cron] purge-abandoned-signups", JSON.stringify(tenants));
    return Response.json({ ok: true, tenants });
  } catch (e) {
    console.error(
      "[cron] purge-abandoned-signups failed:",
      e instanceof Error ? e.message : e,
    );
    return Response.json({ ok: false }, { status: 500 });
  }
}
