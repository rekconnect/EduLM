/**
 * Import the "Renseignements pédagogiques" choices (LVA/LVB/LVC, spécialités,
 * options, BFI/SI, maths) from Dars Isc_TmpClasse_Choices — the lycée-options
 * page of the Dars online réinscription form. Only students whose family used
 * that online form have a row (≈168 for 2026, ≈104 for 2027); everyone else
 * stays empty until they answer through EduLM's own inscription form.
 *
 * Writes registration_by_year[<year>].<key> for each choice year, plus the
 * flat customAnswers key when the year is the ACTIVE year (same pattern as
 * import-quitter-seul-from-dfv). Only true bits are written ("yes" / option
 * label) — false bits are left untouched (unanswered ≠ "no", most rows have
 * many untouched sections). arabe_langue has its own import (ALE/ALM).
 *
 * Unmapped bits (no EduLM field yet): SEC_SCI_ING (sciences de l'ingénieur),
 * PREM_MATH_ENSEIG — reported in the dry-run when set.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-pedago-choices-from-sql.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const yearLabel = (sy: number) => `${sy - 1}-${sy}`;

type Bits = Record<string, boolean> & { ID_Student: number; SYear: number };

const SPECIALITES: Array<[string, string]> = [
  ["PREM_LLCE_ENG", "LLCE Anglais"],
  ["PREM_PHY_CHE", "Physique-Chimie"],
  ["PREM_SVT", "SVT"],
  ["PREM_MATH", "Mathématiques"],
  ["PREM_SES", "SES"],
  ["PREM_HGGSP", "HGGSP"],
  ["PREM_HLP", "HLP"],
];

function mapChoices(b: Bits): Record<string, string> {
  const out: Record<string, string> = {};
  if (b.SEC_LVA_AR || b.PREM_LVA_AR) out.lva = "Arabe";
  else if (b.SEC_LVA_ENG || b.PREM_LVA_ENG) out.lva = "Anglais";
  if (b.SEC_LVB_AR || b.PREM_LVB_AR) out.lvb = "Arabe";
  else if (b.SEC_LVB_ENG || b.PREM_LVB_ENG) out.lvb = "Anglais";
  else if (b.SEC_LVB_ESP || b.PREM_LVB_ESP) out.lvb = "Espagnol";
  if (b.SEC_LVC_AR || b.PREM_LVC_AR) out.lvc = "Arabe";
  else if (b.SEC_LVC_ESP || b.PREM_LVC_ESP) out.lvc = "Espagnol";
  const spec = SPECIALITES.filter(([k]) => b[k]).map(([, label]) => label);
  if (spec.length) out.specialites = spec.join(", ");
  if (b.SEC_ART_PLASTIC || b.PREM_ART_PLASTIC) out.opt_arts_plastiques = "yes";
  if (b.SEC_SI) out.opt_section_internationale = "yes";
  if (b.PREM_BFI) out.opt_bfi = "yes";
  if (b.PREM_MATH_COMP || b.TLE_MATH_COMP) out.maths_complementaire = "yes";
  if (b.TLE_MATH_EXP) out.maths_expertes = "yes";
  if (b.PREM_MATH_COMP_LIB || b.TLE_MATH_COMP_LIB) out.comp_libanais_physique = "yes";
  return out;
}

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const rows = await darsQuery<Bits>(
    `SELECT ts.ID_Student, ts.SYear, cc.*
     FROM Isc_TmpClasse_Choices cc
     JOIN Isc_TmpStudent ts ON ts.ID_Student = cc.Id_TmpStudent AND ts.Id_College=${C}
     WHERE cc.Id_College=${C}`,
  );
  // darsStudentId → { yearLabel → mapped keys }
  const byStudent = new Map<number, Map<string, Record<string, string>>>();
  let unmappedSciIng = 0;
  let unmappedMathEnseig = 0;
  for (const r of rows) {
    if (r.SEC_SCI_ING) unmappedSciIng++;
    if (r.PREM_MATH_ENSEIG) unmappedMathEnseig++;
    const mapped = mapChoices(r);
    if (!Object.keys(mapped).length) continue;
    const sid = Number(r.ID_Student);
    let m = byStudent.get(sid);
    if (!m) {
      m = new Map();
      byStudent.set(sid, m);
    }
    m.set(yearLabel(Number(r.SYear)), mapped);
  }
  console.log(
    `Choice rows: ${rows.length} · students with mapped choices: ${byStudent.size}` +
      ` · unmapped bits: SCI_ING ${unmappedSciIng}, MATH_ENSEIG ${unmappedMathEnseig}`,
  );

  const activeYear = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  const ACTIVE = activeYear?.label ?? "";

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { in: [...byStudent.keys()] } },
    select: { id: true, darsStudentId: true, firstName: true, lastName: true, customAnswers: true },
  });

  type Update = { id: string; ca: Prisma.InputJsonValue; label: string };
  const updates: Update[] = [];
  for (const s of students) {
    const perYear = byStudent.get(Number(s.darsStudentId))!;
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    let reg: Record<string, Record<string, string>> = {};
    try {
      const v = JSON.parse(String(ca.registration_by_year ?? "{}"));
      if (v && typeof v === "object") reg = v;
    } catch {
      /* ignore */
    }
    let changed = false;
    const bits: string[] = [];
    for (const [yl, mapped] of perYear) {
      const cur = reg[yl] ?? {};
      for (const [k, v] of Object.entries(mapped)) {
        if (cur[k] === v) continue;
        cur[k] = v;
        changed = true;
      }
      reg[yl] = cur;
      if (yl === ACTIVE) {
        for (const [k, v] of Object.entries(mapped)) {
          if (ca[k] === v) continue;
          ca[k] = v;
          changed = true;
        }
      }
      bits.push(`${yl}: ${Object.entries(mapped).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
    }
    if (!changed) continue;
    ca.registration_by_year = JSON.stringify(reg);
    updates.push({
      id: s.id,
      ca: ca as Prisma.InputJsonValue,
      label: `${s.lastName} ${s.firstName} — ${bits.join(" | ")}`,
    });
  }

  console.log(`\nÉlèves à mettre à jour: ${updates.length}`);
  for (const u of updates.slice(0, 20)) console.log(`  + ${u.label}`);
  if (updates.length > 20) console.log(`  … (+${updates.length - 20} autres)`);

  if (!CONFIRM) {
    console.log("\nDry-run. Relancer avec --confirm pour écrire.");
  } else {
    for (const u of updates) {
      await prisma.student.update({ where: { id: u.id }, data: { customAnswers: u.ca } });
    }
    console.log(`✓ ${updates.length} élèves mis à jour.`);
  }
  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
