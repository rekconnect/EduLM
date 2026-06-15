/**
 * Read-only audit: the LIVE field universe for Lycée Montaigne.
 *  A) Tenant entity-fields config (student + parent) — the admin-editable
 *     custom fields shown on the fiche AND in the inscription form.
 *  B) inscriptionTabsConfig (which dossier tabs are on).
 *  C) Actual customAnswers keys in use across students + parent users
 *     (frequency), incl. registration_by_year sub-keys + services tokens —
 *     these are the Dars-derived "fiche fields".
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

function dumpFieldsConfig(label: string, raw: unknown) {
  console.log(`\n===== ${label} =====`);
  if (!raw || typeof raw !== "object") {
    console.log("(empty / not configured)");
    return;
  }
  const cfg = raw as { categories?: unknown[]; fields?: unknown[] };
  const cats = (cfg.categories ?? []) as Array<{ id: string; label?: string }>;
  const fields = (cfg.fields ?? []) as Array<{
    id: string;
    label?: string;
    categoryId?: string;
    type?: string;
    required?: boolean;
    dossierBoundTo?: string;
    userBoundTo?: string;
  }>;
  console.log(`categories (${cats.length}): ${cats.map((c) => `${c.id}:${c.label ?? ""}`).join(" | ")}`);
  console.log(`fields (${fields.length}):`);
  for (const f of fields) {
    console.log(
      `  - ${f.id}  [cat=${f.categoryId ?? "?"}] [${f.type ?? "?"}]${f.required ? " *req" : ""}` +
        `${f.dossierBoundTo ? ` bound→${f.dossierBoundTo}` : ""}${f.userBoundTo ? ` user→${f.userBoundTo}` : ""}  "${f.label ?? ""}"`,
    );
  }
}

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      studentFieldsConfig: true,
      parentFieldsConfig: true,
      parentCreateFieldsConfig: true,
      inscriptionTabsConfig: true,
    },
  });

  dumpFieldsConfig("STUDENT entity-fields (fiche + form)", t?.studentFieldsConfig);
  dumpFieldsConfig("PARENT entity-fields (fiche + form)", t?.parentFieldsConfig);

  console.log("\n===== inscriptionTabsConfig =====");
  console.log(JSON.stringify(t?.inscriptionTabsConfig ?? "(default)"));

  // ── Student customAnswers key frequency ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { customAnswers: true },
  });
  const sKeys = new Map<string, number>();
  const regKeys = new Map<string, number>();
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(ca)) sKeys.set(k, (sKeys.get(k) ?? 0) + 1);
    try {
      const reg = JSON.parse(String(ca.registration_by_year ?? "{}")) as Record<string, Record<string, string>>;
      for (const y of Object.values(reg)) for (const k of Object.keys(y)) regKeys.set(k, (regKeys.get(k) ?? 0) + 1);
    } catch { /* ignore */ }
  }
  console.log(`\n===== STUDENT customAnswers keys (n=${students.length}) =====`);
  for (const [k, n] of [...sKeys.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log(`\n===== registration_by_year sub-keys =====`);
  for (const [k, n] of [...regKeys.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  // ── Parent customAnswers key frequency ──
  const parents = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: "PARENT" },
    select: { customAnswers: true },
  });
  const pKeys = new Map<string, number>();
  for (const p of parents) {
    const ca = (p.customAnswers ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(ca)) pKeys.set(k, (pKeys.get(k) ?? 0) + 1);
  }
  console.log(`\n===== PARENT customAnswers keys (n=${parents.length}) =====`);
  for (const [k, n] of [...pKeys.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
