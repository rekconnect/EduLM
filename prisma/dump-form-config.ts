/**
 * Read-only diagnostic — dumps the parent + student field config for a
 * tenant exactly as it's stored, so we can see what the submit
 * validator actually iterates over. Useful when a field appears in the
 * "missing required" toast but admin can't find it in /settings → Forms.
 *
 *   npx tsx prisma/dump-form-config.ts --tenant-name=Montaigne
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;

type Category = {
  id: string;
  name: string;
  order?: number;
  active?: boolean;
};

type Field = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  categoryId: string;
  active?: boolean;
  userBoundTo?: string;
  dossierBoundTo?: string;
  showIf?: unknown;
  hideIf?: unknown;
};

function fmtField(f: Field, cats: Map<string, string>): void {
  const catName = cats.get(f.categoryId) ?? "?";
  const flags: string[] = [];
  if (f.required) flags.push("required");
  if (f.active === false) flags.push("INACTIVE");
  if (f.userBoundTo) flags.push(`userBoundTo:${f.userBoundTo}`);
  if (f.dossierBoundTo) flags.push(`dossierBoundTo:${f.dossierBoundTo}`);
  if (f.showIf) flags.push("showIf");
  if (f.hideIf) flags.push("hideIf");
  const flagsStr = flags.length ? `  [${flags.join(", ")}]` : "";
  console.log(
    `  • ${f.label.padEnd(40)} type=${f.type.padEnd(15)} cat=${catName}${flagsStr}`,
  );
}

async function main() {
  const allTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  let target: { id: string; name: string } | null = null;
  if (EXPLICIT_TENANT_NAME) {
    const q = EXPLICIT_TENANT_NAME.toLowerCase();
    const matches = allTenants.filter((t) => t.name.toLowerCase().includes(q));
    if (matches.length !== 1) {
      console.error(
        `Tenant name "${EXPLICIT_TENANT_NAME}" matched ${matches.length} tenants. Refine.`,
      );
      process.exit(1);
    }
    target = matches[0]!;
  } else if (allTenants.length === 1) {
    target = allTenants[0]!;
  } else {
    console.error("Multiple tenants — pass --tenant-name=Montaigne");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: target.id },
    select: {
      name: true,
      parentFieldsConfig: true,
      studentFieldsConfig: true,
    },
  });
  if (!tenant) {
    console.error("Tenant not found");
    process.exit(1);
  }

  console.log(`Tenant: ${tenant.name} (${target.id})\n`);

  for (const which of ["parentFieldsConfig", "studentFieldsConfig"] as const) {
    const raw = tenant[which];
    console.log(`════ ${which} ════`);
    if (!raw || typeof raw !== "object") {
      console.log("  (empty)\n");
      continue;
    }
    const cfg = raw as Record<string, unknown>;
    const cats: Category[] = Array.isArray(cfg.categories)
      ? (cfg.categories as Category[])
      : [];
    const fields: Field[] = Array.isArray(cfg.fields)
      ? (cfg.fields as Field[])
      : [];
    const catMap = new Map(cats.map((c) => [c.id, c.name]));
    console.log(`  Categories: ${cats.length}`);
    for (const c of cats) {
      console.log(
        `    - ${c.name}${c.active === false ? " (INACTIVE)" : ""}`,
      );
    }
    console.log(`  Fields:     ${fields.length}`);
    if (fields.length === 0) {
      console.log("    (none)");
    } else {
      for (const f of fields) fmtField(f, catMap);
    }
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
