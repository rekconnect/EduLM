/**
 * Services (Transport & restauration) — config-driven completeness backfill.
 *
 * 1. Marks the Services questions `required` in each tenant's student
 *    entity-field config so the config-driven tab completeness means
 *    "the transport/cantine questions were answered" (the legacy rule's
 *    intent, without its autocar=Non dead-end):
 *      - autocar, collations, repas_chaud            (always visible)
 *      - transport_aller, transport_retour           (visible when autocar=Oui)
 *      - transport_caza, transport_village, transport_rue
 *                                                    (visible when adresse_diff=Oui)
 *    showIf-hidden fields are never counted as missing, so a family that
 *    answers "autocar: Non" completes the tab. Admin can flip any of these
 *    back to optional in /settings — this script only seeds the flags once.
 *
 * 2. Recomputes tabsCompleted.transport for LIVE dossiers (DRAFT/SUBMITTED/
 *    UNDER_REVIEW/INTERVIEW_SCHEDULED) that already saved a transport blob,
 *    so dossiers stuck on "À remplir" by the old rule repair themselves
 *    without a re-save. Finalized dossiers are left untouched.
 *
 * Usage:
 *   npx tsx scripts/set-services-required.ts            # dry-run (default)
 *   npx tsx scripts/set-services-required.ts --confirm  # write
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  missingRequiredOnForm,
  parseEntityFieldsConfig,
} from "../src/lib/entity-fields";
import {
  parseTransport,
  serviceAnswersFromTransport,
} from "../src/lib/dossier-content";
import { isMaternelleNiveau } from "../src/lib/pedagogique";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

const REQUIRED_KEYS = [
  "autocar",
  "collations",
  "repas_chaud",
  "transport_aller",
  "transport_retour",
  "transport_caza",
  "transport_village",
  "transport_rue",
];

const LIVE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INTERVIEW_SCHEDULED",
] as const;

async function main() {
  console.log(CONFIRM ? "== WRITE mode ==" : "== DRY-RUN (pass --confirm to write) ==");

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, studentFieldsConfig: true },
  });

  for (const t of tenants) {
    const cfg = t.studentFieldsConfig as {
      categories?: Array<{ id: string; name: string }>;
      fields?: Array<Record<string, unknown>>;
    } | null;
    const cat = cfg?.categories?.find((c) => c.name === "Services");
    if (!cat || !cfg?.fields) {
      console.log(`tenant ${t.slug}: no Services category — skipped`);
      continue;
    }

    // --- 1. required flags on the Services fields ---
    let flagged = 0;
    for (const f of cfg.fields) {
      if (f.categoryId !== cat.id) continue;
      const key = String(f.key ?? "");
      if (REQUIRED_KEYS.includes(key) && f.required !== true) {
        console.log(`  ${t.slug}: ${key} → required: true`);
        f.required = true;
        flagged++;
      }
    }
    if (flagged > 0 && CONFIRM) {
      await prisma.tenant.update({
        where: { id: t.id },
        data: { studentFieldsConfig: cfg as Prisma.InputJsonValue },
      });
    }
    console.log(
      `tenant ${t.slug}: ${flagged} field(s) flagged required${
        flagged > 0 && !CONFIRM ? " (dry-run, not written)" : ""
      }`,
    );

    // --- 2. recompute transport completeness on live dossiers ---
    const entityCfg = parseEntityFieldsConfig(cfg);
    const apps = await prisma.application.findMany({
      where: { tenantId: t.id, status: { in: [...LIVE_STATUSES] } },
      select: {
        id: true,
        niveau: true,
        existingStudentId: true,
        dossierAnswers: true,
        tabsCompleted: true,
        childFirstName: true,
        childLastName: true,
        status: true,
      },
    });

    let repaired = 0;
    for (const app of apps) {
      const blob =
        app.dossierAnswers && typeof app.dossierAnswers === "object"
          ? (app.dossierAnswers as Record<string, unknown>)
          : null;
      const stored = blob?.transport;
      if (!stored || typeof stored !== "object") continue; // tab never saved — leave as-is

      const isServiceShape =
        "transport_aller" in stored ||
        "transport_retour" in stored ||
        "collations" in stored ||
        "autocar" in stored;
      const svc: Record<string, string> = isServiceShape
        ? Object.fromEntries(
            Object.entries(stored as Record<string, unknown>).filter(
              ([, v]) => typeof v === "string",
            ) as [string, string][],
          )
        : serviceAnswersFromTransport(parseTransport(stored));

      // Mirror the server-side maternelle lock (collation obligatoire).
      if (isMaternelleNiveau(app.niveau)) svc.collations = "yes";

      const complete =
        missingRequiredOnForm(entityCfg, ["Services"], svc, {
          renewal: app.existingStudentId != null,
        }).length === 0;

      const tabs =
        app.tabsCompleted && typeof app.tabsCompleted === "object"
          ? { ...(app.tabsCompleted as Record<string, unknown>) }
          : {};
      if (tabs.transport === complete) continue;

      console.log(
        `  ${t.slug}: ${app.childFirstName ?? "?"} ${app.childLastName ?? "?"} (${app.status}) transport ${String(tabs.transport)} → ${complete}`,
      );
      tabs.transport = complete;
      repaired++;
      if (CONFIRM) {
        await prisma.application.update({
          where: { id: app.id },
          data: { tabsCompleted: tabs as Prisma.InputJsonValue },
        });
      }
    }
    console.log(
      `tenant ${t.slug}: ${repaired} dossier(s) transport badge changed${
        repaired > 0 && !CONFIRM ? " (dry-run, not written)" : ""
      }`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
