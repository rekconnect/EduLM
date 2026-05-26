/**
 * One-shot cleanup: remove any "droits à l'image" / photo-authorization
 * field from BOTH studentFieldsConfig AND parentFieldsConfig across
 * every tenant. The Foyer tab now captures this in four separate
 * yes/no toggles (Site / Livre / Réseaux / Web Radio) on the Family
 * record, so the duplicate inside custom fields is just noise.
 *
 * Run with:  npx tsx prisma/remove-student-photo-field.ts
 *
 * Dry-run by default. Re-run with `--confirm` to actually save.
 *
 * Heuristic: matches any field whose label or key (lowercased) contains
 * "photo", "image", "autorisation", or "droit". Tweak FILTER if the
 * heuristic is too aggressive.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isConfirm = process.argv.includes("--confirm");

function looksLikePhotoField(label: string, key: string): boolean {
  const haystack = `${label} ${key}`.toLowerCase();
  return (
    haystack.includes("photo") ||
    haystack.includes("image") ||
    haystack.includes("autorisation") ||
    haystack.includes("droit")
  );
}

type FieldDef = {
  id: string;
  key?: string;
  label?: string;
  [k: string]: unknown;
};

async function main() {
  console.log(
    isConfirm
      ? "🔴 CONFIRM mode — changes will be saved.\n"
      : "🟡 Dry run — no changes. Re-run with --confirm to apply.\n",
  );

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      studentFieldsConfig: true,
      parentFieldsConfig: true,
    },
  });

  // Process both config columns identically — same heuristic, same
  // shape. Returns the trimmed config + count of fields removed.
  function scrubConfig(raw: unknown): {
    nextCfg: Record<string, unknown> | null;
    removedLabels: string[];
  } {
    if (!raw || typeof raw !== "object") {
      return { nextCfg: null, removedLabels: [] };
    }
    const cfg = raw as { fields?: unknown };
    if (!Array.isArray(cfg.fields)) {
      return { nextCfg: null, removedLabels: [] };
    }
    const fields = cfg.fields as FieldDef[];
    const removedLabels: string[] = [];
    const remaining = fields.filter((f) => {
      if (looksLikePhotoField(String(f.label ?? ""), String(f.key ?? ""))) {
        removedLabels.push(
          `${f.label ?? "(no label)"} [${f.key ?? f.id}]`,
        );
        return false;
      }
      return true;
    });
    if (removedLabels.length === 0) {
      return { nextCfg: null, removedLabels: [] };
    }
    return {
      nextCfg: {
        ...(cfg as Record<string, unknown>),
        fields: remaining,
      },
      removedLabels,
    };
  }

  let touched = 0;
  for (const t of tenants) {
    const student = scrubConfig(t.studentFieldsConfig);
    const parent = scrubConfig(t.parentFieldsConfig);

    if (!student.nextCfg && !parent.nextCfg) continue;
    touched++;
    console.log(`\nTenant ${t.name} (${t.id}):`);

    if (student.nextCfg) {
      console.log(`  studentFieldsConfig — removing ${student.removedLabels.length} field(s):`);
      for (const l of student.removedLabels) console.log(`    • ${l}`);
    }
    if (parent.nextCfg) {
      console.log(`  parentFieldsConfig — removing ${parent.removedLabels.length} field(s):`);
      for (const l of parent.removedLabels) console.log(`    • ${l}`);
    }

    if (isConfirm) {
      const data: Record<string, unknown> = {};
      if (student.nextCfg)
        data.studentFieldsConfig = student.nextCfg as unknown as Record<string, unknown>;
      if (parent.nextCfg)
        data.parentFieldsConfig = parent.nextCfg as unknown as Record<string, unknown>;
      await prisma.tenant.update({
        where: { id: t.id },
        data,
      });
    }
  }

  if (touched === 0) {
    console.log("No matching fields found across any tenant. Nothing to do.");
  } else if (!isConfirm) {
    console.log(`\nDry run done. ${touched} tenant(s) would be updated.`);
    console.log("Re-run with `--confirm` to apply.");
  } else {
    console.log(`\n✓ Done. ${touched} tenant(s) updated.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
