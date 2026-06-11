/**
 * Align the student DOSSIER (fiche year view + single values + services) with
 * the bus truth (bus_periods["2025-2026|T3"], i.e. the BUS MAJ Excel):
 *   - registration_by_year["2025-2026"]: autocar yes/no; Aller = "Avec bus" if
 *     AS else "Avec parent"; Retour likewise (only when riding at least one way;
 *     no bus at all → autocar=no and the legs are cleared).
 *   - single values autocar / transport_aller / transport_retour mirror it.
 *   - services_by_year["2025-2026"]: "Transport" token present iff AS or RS
 *     (Cantine / Collation tokens untouched — accounting stays their source).
 * Fixes every fiche (student + the children blocks on the parent fiche) that
 * still showed the stale Dars registration/billing transport.
 *
 * DRY-RUN by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const YEAR = "2025-2026";
const PERIOD = "2025-2026|T3";
const CONFIRM = process.argv.includes("--confirm");
const ORDER = ["Transport", "Cantine", "Collation"];

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: YEAR } } } },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });
  console.log(`Active-year students: ${students.length}`);

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  let toOui = 0;
  let toNon = 0;
  for (const s of students) {
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};

    // Bus truth for the current trimester.
    let as = false;
    let rs = false;
    try {
      const periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
      const p = periods[PERIOD];
      as = p?.as === "yes";
      rs = p?.rs === "yes";
    } catch {
      /* ignore */
    }
    const rides = as || rs;

    let changed = false;

    // 1. registration_by_year[YEAR]
    let reg: Record<string, Record<string, string>> = {};
    if (typeof ca.registration_by_year === "string") {
      try {
        reg = JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>;
      } catch {
        reg = {};
      }
    }
    const entry = { ...(reg[YEAR] ?? {}) };
    const want: Record<string, string> = rides
      ? {
          autocar: "yes",
          transport_aller: as ? "Avec bus" : "Avec parent",
          transport_retour: rs ? "Avec bus" : "Avec parent",
        }
      : { autocar: "no", transport_aller: "", transport_retour: "" };
    for (const [k, v] of Object.entries(want)) {
      if (v === "") {
        if (entry[k]) {
          delete entry[k];
          changed = true;
        }
      } else if (entry[k] !== v) {
        entry[k] = v;
        changed = true;
      }
    }
    reg[YEAR] = entry;

    // 2. Single values mirror the current year.
    for (const [k, v] of Object.entries(want)) {
      if (v === "") {
        if (ca[k]) {
          delete ca[k];
          changed = true;
        }
      } else if (ca[k] !== v) {
        ca[k] = v;
        changed = true;
      }
    }

    // 3. services_by_year[YEAR] "Transport" token.
    let sby: Record<string, string> = {};
    if (typeof ca.services_by_year === "string") {
      try {
        sby = JSON.parse(ca.services_by_year) as Record<string, string>;
      } catch {
        sby = {};
      }
    }
    const tokens = new Set((sby[YEAR] ?? "").split(/,\s*/).filter(Boolean));
    const hadTransport = tokens.has("Transport");
    if (rides && !hadTransport) {
      tokens.add("Transport");
      changed = true;
      toOui++;
    } else if (!rides && hadTransport) {
      tokens.delete("Transport");
      changed = true;
      toNon++;
    }
    sby[YEAR] = [
      ...ORDER.filter((t) => tokens.has(t)),
      ...[...tokens].filter((t) => !ORDER.includes(t)),
    ].join(", ");

    if (!changed) continue;
    ca.registration_by_year = JSON.stringify(reg);
    ca.services_by_year = JSON.stringify(sby);
    updates.push({
      id: s.id,
      ca,
      label: `${s.lastName} ${s.firstName}: bus=${rides ? "Oui" : "Non"} aller=${want.transport_aller || "—"} retour=${want.transport_retour || "—"}`,
    });
  }

  console.log(`\nÀ mettre à jour: ${updates.length} élèves (service Transport ajouté: ${toOui}, retiré: ${toNon})`);
  for (const u of updates.slice(0, 15)) console.log(`   • ${u.label}`);
  if (updates.length > 15) console.log(`   … +${updates.length - 15}`);

  if (!CONFIRM) {
    console.log("\n🟡 DRY-RUN — relancez avec --confirm pour écrire.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) =>
            prisma.student.update({
              where: { id: u.id },
              data: { customAnswers: u.ca as Prisma.InputJsonValue },
            }),
          ),
        );
        done += chunk.length;
        break;
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    if (done % 200 < 5) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`✓ Dossiers alignés: ${done} élèves.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
