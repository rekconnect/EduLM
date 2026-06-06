import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const has = (ca: unknown, key: string) => {
  const v = (ca as Record<string, unknown>)?.[key];
  return typeof v === "string" && v.trim().length > 0;
};

async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const T = t!.id;

  // ── Parents ──
  const parents = await p.user.findMany({
    where: { tenantId: T, role: "PARENT", darsParentId: { not: null } },
    select: {
      customAnswers: true,
      guardianProfile: {
        select: {
          nationality1: true, nationality2: true,
          family: { select: { imageRightsSite: true } },
        },
      },
    },
  });
  const pTot = parents.length;
  const pc = {
    situation_famille: 0, actuel: 0, type_famille: 0,
    nationality1: 0, nationality2: 0, photos: 0,
  };
  for (const u of parents) {
    if (has(u.customAnswers, "situation_famille")) pc.situation_famille++;
    if (has(u.customAnswers, "actuel")) pc.actuel++;
    if (has(u.customAnswers, "type_famille")) pc.type_famille++;
    if (u.guardianProfile?.nationality1) pc.nationality1++;
    if (u.guardianProfile?.nationality2) pc.nationality2++;
    if (u.guardianProfile?.family?.imageRightsSite != null) pc.photos++;
  }
  console.log(`\n══════ PARENTS (${pTot}) ══════`);
  for (const [k, v] of Object.entries(pc)) console.log(`  ${k.padEnd(20)} ${v}`);

  // ── Students ──
  const students = await p.student.findMany({
    where: { tenantId: T, darsStudentId: { not: null } },
    select: { customAnswers: true, nationality: true },
  });
  const sTot = students.length;
  const sc = {
    nationalite: 0, nationalite2: 0, autocar: 0, repas_chaud: 0,
    collations: 0, quitter_seul: 0, auth_site: 0,
  };
  for (const s of students) {
    if (has(s.customAnswers, "nationalite")) sc.nationalite++;
    if (has(s.customAnswers, "nationalite2")) sc.nationalite2++;
    if (has(s.customAnswers, "autocar")) sc.autocar++;
    if (has(s.customAnswers, "repas_chaud")) sc.repas_chaud++;
    if (has(s.customAnswers, "collations")) sc.collations++;
    if (has(s.customAnswers, "quitter_seul")) sc.quitter_seul++;
    if (has(s.customAnswers, "auth_site")) sc.auth_site++;
  }
  console.log(`\n══════ STUDENTS (${sTot}) ══════`);
  for (const [k, v] of Object.entries(sc)) console.log(`  ${k.padEnd(20)} ${v}`);

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
