/**
 * Sync EduLM's per-year services (Collation / Cantine) for the ACTIVE year from
 * the accounting Excel lists — the authoritative source. On the list → Oui;
 * active-year student not on the list → Non. Updates customAnswers:
 *   - services_by_year[<active year>]  (the "Collation"/"Cantine" billing tokens)
 *   - collations / repas_chaud         (the single values)
 * Transport is NOT in these lists and is never touched.
 *
 * DRY-RUN by default (prints the diff). Pass --confirm to write.
 *   npx tsx scripts/dars-import/sync-services-from-excel.ts \
 *     --tenant-name="Lycée Montaigne" \
 *     --collation="...collation List 2025-2026 sem 3.xlsx" \
 *     --cantine="...Cantine List 2025-2026 sem 3.xlsx" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  readServiceList,
  prepare,
  matchList,
  type MatchStudent,
} from "./lib/match-services.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};
const CONFIRM = process.argv.includes("--confirm");
const ORDER = ["Transport", "Cantine", "Collation"]; // stable token order

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const collationPath = arg("collation");
  const cantinePath = arg("cantine");
  if (!collationPath && !cantinePath) {
    console.error("Pass --collation=... and/or --cantine=...");
    process.exit(1);
  }

  const activeYear = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  const YEAR = activeYear?.label ?? "2025-2026";
  console.log(`Active year: ${YEAR}${CONFIRM ? "  [CONFIRM — will write]" : "  [dry-run]"}`);

  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { academicYear: { isActive: true } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { class: { select: { name: true, level: true } } },
        take: 1,
      },
      guardianLinks: {
        select: { guardian: { select: { relation: true, user: { select: { name: true } } } } },
      },
    },
  });
  console.log(`Active-year students: ${students.length}`);

  const matchStudents: MatchStudent[] = students.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    className: s.enrollments[0]?.class.name ?? "",
    level: s.enrollments[0]?.class.level ?? "",
    fatherName:
      s.guardianLinks.find((l) => l.guardian.relation === "pere")?.guardian.user.name ?? "",
  }));
  const prepared = prepare(matchStudents);
  const levelById = new Map(matchStudents.map((m) => [m.id, m.level]));

  async function listSet(label: string, path: string): Promise<Set<string>> {
    if (!path) return new Set();
    const rows = await readServiceList(path);
    const { onList, unmatched } = matchList(prepared, rows);
    console.log(`\n${label}: ${rows.length} rows · matched ${onList.size} · UNMATCHED ${unmatched.length}`);
    for (const u of unmatched.slice(0, 30))
      console.log(`   ✗ [${u.why}] ${u.nom} ${u.prenom} (père ${u.pere}, ${u.classe})`);
    if (unmatched.length > 30) console.log(`   … +${unmatched.length - 30} more`);
    return onList;
  }

  const onCollation = await listSet("COLLATION", collationPath);
  const onCantine = await listSet("CANTINE", cantinePath);
  const haveColl = !!collationPath;
  const haveCant = !!cantinePath;

  // Build the diff per student.
  type Change = {
    id: string;
    name: string;
    level: string;
    answers: Record<string, unknown>;
    before: string;
    after: string;
  };
  const changes: Change[] = [];
  for (const s of students) {
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    let sby: Record<string, string> = {};
    try {
      sby = JSON.parse(String(ca.services_by_year ?? "{}"));
    } catch {
      sby = {};
    }
    const cur = sby[YEAR] ?? "";
    const tokens = new Set(cur.split(/,\s*/).filter(Boolean));
    // Only adjust the services the given lists are authoritative for.
    if (haveColl) {
      tokens.delete("Collation");
      if (onCollation.has(s.id)) tokens.add("Collation");
    }
    if (haveCant) {
      tokens.delete("Cantine");
      if (onCantine.has(s.id)) tokens.add("Cantine");
    }
    const ordered = [
      ...ORDER.filter((t) => tokens.has(t)),
      ...[...tokens].filter((t) => !ORDER.includes(t)),
    ].join(", ");

    const newAnswers = { ...ca };
    const newSby = { ...sby, [YEAR]: ordered };
    newAnswers.services_by_year = JSON.stringify(newSby);
    if (haveColl) newAnswers.collations = onCollation.has(s.id) ? "yes" : "no";
    if (haveCant) newAnswers.repas_chaud = onCantine.has(s.id) ? "yes" : "no";

    const changed =
      ordered !== cur ||
      (haveColl && ca.collations !== newAnswers.collations) ||
      (haveCant && ca.repas_chaud !== newAnswers.repas_chaud);
    if (changed) {
      changes.push({
        id: s.id,
        name: `${s.lastName} ${s.firstName}`,
        level: levelById.get(s.id) ?? "",
        answers: newAnswers,
        before: `serv="${cur}" coll=${ca.collations ?? "-"} repas=${ca.repas_chaud ?? "-"}`,
        after: `serv="${ordered}" coll=${newAnswers.collations ?? "-"} repas=${newAnswers.repas_chaud ?? "-"}`,
      });
    }
  }

  console.log(`\nStudents with a change: ${changes.length}`);
  for (const c of changes.slice(0, 12))
    console.log(`   • ${c.name} (${c.level}): ${c.before}  →  ${c.after}`);
  if (changes.length > 12) console.log(`   … +${changes.length - 12} more`);

  // Sanity: Oliver Abboud + maternelle-not-on-collation (display-rule heads-up).
  const oliver = changes.find((c) => /abboud/i.test(c.name) && /oliver/i.test(c.name));
  if (oliver) console.log(`\nOliver Abboud → ${oliver.after}`);
  if (haveColl) {
    const MAT = new Set(["PS", "MS", "GS"]);
    const matOff = matchStudents.filter(
      (m) => MAT.has(m.level) && !onCollation.has(m.id),
    );
    console.log(
      `\nMaternelle (PS/MS/GS) students NOT on the collation list: ${matOff.length}` +
        (matOff.length
          ? `\n  (informational — the accounting list is the source of truth, they show Non)`
          : ""),
    );
    for (const m of matOff.slice(0, 15))
      console.log(`     - ${m.lastName} ${m.firstName} (${m.className})`);
  }

  if (!CONFIRM) {
    console.log(`\nDry-run only. Re-run with --confirm to write ${changes.length} updates.`);
    await prisma.$disconnect();
    return;
  }

  // ── Write (chunk 5 + retry; rides out connection_limit=1 P2024 timeouts) ──
  console.log(`\nWriting ${changes.length} updates…`);
  let done = 0;
  for (let i = 0; i < changes.length; i += 5) {
    const chunk = changes.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((c) =>
            prisma.student.update({
              where: { id: c.id },
              data: { customAnswers: c.answers as Prisma.InputJsonValue },
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
    if (done % 100 < 5) console.log(`  ${done}/${changes.length}`);
  }
  console.log(`✓ Synced ${done} students.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
