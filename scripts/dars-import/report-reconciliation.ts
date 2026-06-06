/**
 * Tenant-wide reconciliation report — surfaces the data-quality patterns
 * worth cleaning (in Dars before re-import, or via targeted EduLM patches):
 *
 *   1. CURRENT families (≥1 enrolled kid) with NO usable login
 *      (every guardian is disabled / placeholder email).
 *   2. Parents with MULTIPLE accounts (blended families / Dars duplicates).
 *   3. STRANDED real emails (real email sits on an all-withdrawn record while
 *      the person's enrolled record has only a placeholder).
 *   4. DUPLICATE students (same name appears both WITHDRAWN and ENROLLED).
 *
 * Read-only. Writes imports/reconciliation-report.md + prints a summary.
 *   npx tsx scripts/dars-import/report-reconciliation.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PLACEHOLDER = "@import.lyceemontaigne.local";
const isReal = (e: string) => !e.endsWith(PLACEHOLDER);
const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;

  const out: string[] = [];
  const w = (s = "") => out.push(s);

  // ── Load families with students + guardians ──
  const families = await prisma.family.findMany({
    where: { tenantId: T, darsRootParentId: { not: null } },
    select: {
      code: true,
      students: { select: { firstName: true, lastName: true, status: true } },
      guardians: {
        select: { relation: true, user: { select: { firstName: true, lastName: true, status: true, email: true } } },
      },
    },
  });

  // 1. Current families with no usable login
  const noLogin = families.filter((f) => {
    const hasEnrolled = f.students.some((s) => s.status === "ENROLLED");
    if (!hasEnrolled) return false;
    const hasUsable = f.guardians.some((g) => g.user.status === "ACTIVE" && isReal(g.user.email));
    return !hasUsable;
  });

  // 2. Parents with multiple accounts (by normalized name)
  const parents = await prisma.user.findMany({
    where: { tenantId: T, role: "PARENT", darsParentId: { not: null } },
    select: {
      firstName: true, lastName: true, status: true, email: true, darsParentId: true,
      guardianProfile: {
        select: {
          family: { select: { code: true } },
          childLinks: { select: { student: { select: { status: true } } } },
        },
      },
    },
  });
  const byName = new Map<string, typeof parents>();
  for (const p of parents) {
    const k = `${norm(p.firstName)}|${norm(p.lastName)}`;
    if (!k.trim().startsWith("|") || norm(p.lastName)) {
      (byName.get(k) ?? byName.set(k, []).get(k)!).push(p);
    }
  }
  const multi = [...byName.values()].filter((g) => g.length > 1);

  // 3. Stranded real emails
  const stranded = multi
    .map((group) => {
      const realWithdrawn = group.find(
        (p) =>
          isReal(p.email) &&
          (p.guardianProfile?.childLinks ?? []).length > 0 &&
          (p.guardianProfile?.childLinks ?? []).every((l) => l.student.status !== "ENROLLED"),
      );
      const enrolledPlaceholder = group.find(
        (p) =>
          !isReal(p.email) &&
          (p.guardianProfile?.childLinks ?? []).some((l) => l.student.status === "ENROLLED"),
      );
      return realWithdrawn && enrolledPlaceholder ? { group, realWithdrawn, enrolledPlaceholder } : null;
    })
    .filter(Boolean) as Array<{ group: typeof parents; realWithdrawn: (typeof parents)[number]; enrolledPlaceholder: (typeof parents)[number] }>;

  // 4. Duplicate students (same name both withdrawn + enrolled)
  const students = await prisma.student.findMany({
    where: { tenantId: T },
    select: { firstName: true, lastName: true, status: true },
  });
  const stuByName = new Map<string, Set<string>>();
  for (const s of students) {
    const k = `${norm(s.firstName)}|${norm(s.lastName)}`;
    if (!stuByName.has(k)) stuByName.set(k, new Set());
    stuByName.get(k)!.add(s.status);
  }
  const dupStudents = [...stuByName.entries()].filter(
    ([, st]) => st.has("ENROLLED") && st.has("WITHDRAWN"),
  );

  // ── Build report ──
  w(`# Reconciliation report — ${tenant.name}`);
  w("");
  w("## Summary");
  w(`- Current families with NO usable login: **${noLogin.length}**`);
  w(`- Parents with multiple accounts: **${multi.length}**`);
  w(`- Stranded real emails (move email + enable): **${stranded.length}**`);
  w(`- Duplicate students (withdrawn + enrolled same name): **${dupStudents.length}**`);
  w("");

  w("## 1. Current families with no usable login");
  w("These have enrolled children but every parent is disabled / placeholder email.");
  w("");
  for (const f of noLogin) {
    const enrolled = f.students.filter((s) => s.status === "ENROLLED").map((s) => `${s.firstName} ${s.lastName}`);
    const conts = f.guardians.map((g) => `${g.user.firstName} ${g.user.lastName} [${g.user.status}, ${isReal(g.user.email) ? "real" : "placeholder"}]`);
    w(`- **${f.code}** — kids: ${enrolled.join(", ")} · parents: ${conts.join(" / ")}`);
  }
  w("");

  w("## 2. Parents with multiple accounts");
  for (const g of multi) {
    const p0 = g[0];
    w(`- **${p0.firstName} ${p0.lastName}** — ${g.length} accounts:`);
    for (const p of g) {
      const kids = p.guardianProfile?.childLinks ?? [];
      const enr = kids.filter((l) => l.student.status === "ENROLLED").length;
      w(`    - dars ${p.darsParentId} · ${p.status} · ${isReal(p.email) ? p.email : "placeholder"} · fam ${p.guardianProfile?.family?.code ?? "—"} · ${enr}/${kids.length} enrolled`);
    }
  }
  w("");

  w("## 3. Stranded real emails (recommend: move email → enrolled record + enable)");
  for (const s of stranded) {
    w(`- **${s.realWithdrawn.firstName} ${s.realWithdrawn.lastName}** — email \`${s.realWithdrawn.email}\` is on dars ${s.realWithdrawn.darsParentId} (withdrawn kids); needs to move to dars ${s.enrolledPlaceholder.darsParentId} (fam ${s.enrolledPlaceholder.guardianProfile?.family?.code}).`);
  }
  w("");

  w("## 4. Duplicate students (same name, withdrawn + enrolled)");
  for (const [k] of dupStudents) {
    const [f, l] = k.split("|");
    w(`- ${f} ${l}`);
  }

  const report = out.join("\n");
  writeFileSync("imports/reconciliation-report.md", report);

  // Console summary
  console.log("══════ Reconciliation summary ══════");
  console.log(`  Current families with NO usable login: ${noLogin.length}`);
  console.log(`  Parents with multiple accounts:        ${multi.length}`);
  console.log(`  Stranded real emails:                  ${stranded.length}`);
  console.log(`  Duplicate students:                    ${dupStudents.length}`);
  console.log("\nFull report → imports/reconciliation-report.md");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
