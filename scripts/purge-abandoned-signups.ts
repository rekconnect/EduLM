/**
 * Preview — or run by hand — the automatic purge of abandoned sign-ups.
 *
 * The real thing runs every night on Vercel (vercel.json →
 * /api/cron/purge-abandoned-signups) for each school that set a delay in
 * Settings → Formulaires → "Comptes sans dossier". This script calls the SAME
 * function (src/lib/signup-retention.ts), so what it lists is exactly what
 * the nightly job would delete at this moment:
 *   - parent accounts that registered themselves on the public form,
 *   - not confirmed by the school (no child, no Dars id, no staff identity),
 *   - whose family has no dossier in any state (trash included),
 *   - once the delay has run from the latest of: account creation, the day the
 *     rule was switched on or changed, the opening of the campaign.
 * Nothing is due while no campaign is open.
 *
 * DRY RUN by default. Writing requires --tenant AND --confirm. E-mail
 * addresses are masked unless --full is passed.
 *
 *   npx tsx scripts/purge-abandoned-signups.ts
 *       dry run for every school that has a delay set
 *   npx tsx scripts/purge-abandoned-signups.ts --tenant montaigne --days 14
 *       preview "what if the delay were 14 days" (never writes)
 *   npx tsx scripts/purge-abandoned-signups.ts --tenant montaigne --confirm
 *       real run for that school, same rules as the nightly job
 */
import { db, unscopedDb } from "../src/lib/db";
import { purgeAbandonedSignups } from "../src/lib/signup-retention";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

const CONFIRM = process.argv.includes("--confirm");
const FULL = process.argv.includes("--full");
const TENANT = arg("tenant");
const DAYS_RAW = arg("days");

const mask = (email: string) =>
  FULL ? email : email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
const day = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log(
    CONFIRM ? "== WRITE mode ==" : "== DRY-RUN (pass --tenant <slug> --confirm to write) ==",
  );
  if (CONFIRM && !TENANT) {
    console.error("--confirm requires --tenant <slug>. Nothing written.");
    process.exitCode = 1;
    return;
  }
  if (CONFIRM && DAYS_RAW !== undefined) {
    console.error(
      "--days is a preview option: a real run always uses the delay saved in Settings. Nothing written.",
    );
    process.exitCode = 1;
    return;
  }
  let daysOverride: number | undefined;
  if (DAYS_RAW !== undefined) {
    daysOverride = Number(DAYS_RAW);
    if (!Number.isInteger(daysOverride) || daysOverride < 1 || daysOverride > 365) {
      console.error("--days must be a whole number between 1 and 365.");
      process.exitCode = 1;
      return;
    }
    console.log(`Preview with a delay of ${daysOverride} day(s) instead of the saved setting.`);
  }

  const reports = await purgeAbandonedSignups({
    dryRun: !CONFIRM,
    tenantSlug: TENANT,
    daysOverride,
  });

  if (reports.length === 0) {
    console.log(
      TENANT
        ? `\nNothing to do for "${TENANT}": unknown school, or no delay set in Settings (try --days N to preview).`
        : "\nNo school has a delay set in Settings → Formulaires → Comptes sans dossier.",
    );
    return;
  }

  // Never a silent cut: a demo tenant can hold hundreds of seeded rows.
  const SHOWN = 30;
  for (const r of reports) {
    console.log(`\n[${r.slug}] delay: ${r.days} day(s)`);
    if (r.status === "suspended") {
      console.log("  No campaign is open — the rule is suspended, nothing is due.");
      continue;
    }
    if (r.status === "waiting") {
      console.log(
        `  The rule (or the campaign) is younger than the delay — no account can be due before ${r.nextPossible ? day(r.nextPossible) : "?"}.`,
      );
      continue;
    }
    const due = r.candidates.length + r.notListed;
    console.log(`  ${due} account(s) due for deletion.`);
    for (const c of r.candidates.slice(0, SHOWN)) {
      console.log(`    created ${day(c.createdAt)}  ${mask(c.email)}`);
    }
    if (due > SHOWN) console.log(`    … ${due - Math.min(SHOWN, r.candidates.length)} more not listed.`);
    if (r.status === "purged") {
      console.log(
        `  → ${r.deleted} deleted, ${r.skipped} skipped (changed meanwhile or protected)` +
          (r.notListed + r.notAttempted > 0
            ? `, ${r.notListed + r.notAttempted} left for a next run.`
            : "."),
      );
    }
  }

  if (!CONFIRM) console.log("\nNothing written.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([unscopedDb().$disconnect(), db.$disconnect()]);
  });
