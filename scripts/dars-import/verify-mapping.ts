import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { CodesTable } from "./lib/codes.js";
const p = new PrismaClient();

async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const codes = await CodesTable.load();
  const darsPid = Number(process.argv[2] ?? 409); // Jean-Pierre Beaine

  const u = await p.user.findFirst({
    where: { tenantId: t!.id, darsParentId: darsPid },
    select: { firstName: true, lastName: true, customAnswers: true, guardianProfile: { select: { nationality1: true, nationality2: true, family: { select: { imageRightsSite: true, imageRightsBook: true } } } } },
  });
  const ca = (u?.customAnswers ?? {}) as Record<string, unknown>;

  const d = (await darsQuery(
    `SELECT FirstName, LastName, Id_FamilySituation, Id_FamilyType, Id_Religion, Id_WorkStatus,
            Id_SubOccupation, RegisterNum, IsDead, SecondMarriage, FirstNameAr, LastNameAr
     FROM Isc_Parent WHERE Id_College=${C} AND ID_Parent=${darsPid}`,
  ))[0] as Record<string, unknown>;

  console.log(`\n══ PARENT ${u?.firstName} ${u?.lastName} (dars ${darsPid}) — EduLM vs Dars ══\n`);
  const row = (label: string, edulm: string, dars: string) =>
    console.log(`  ${label.padEnd(22)} EduLM: ${(edulm || "—").padEnd(24)} Dars: ${dars || "—"}`);

  row("Situation", String(ca.situation_famille ?? ""), codes.label(d.Id_FamilySituation as number));
  row("Type famille", String(ca.type_famille ?? ""), `Id=${d.Id_FamilyType} (label via lookup)`);
  row("Communauté", String(ca.communaute ?? ""), codes.label(d.Id_Religion as number));
  row("Statut travail", String(ca.statut_travail ?? ""), codes.label(d.Id_WorkStatus as number));
  row("Profession", String(ca.profession ?? ""), codes.label(d.Id_SubOccupation as number));
  row("Registre", String(ca.numero_registre ?? ""), String(d.RegisterNum ?? ""));
  row("Nationalité 1", u?.guardianProfile?.nationality1 ?? "", "(Guardian col)");
  row("Décédé", String(ca.decede ?? ""), d.IsDead ? "true" : "false");
  row("Second mariage", String(ca.second_mariage ?? ""), d.SecondMarriage ? "true" : "false");
  row("Nom AR", String(ca.nom_ar ?? ""), String(d.LastNameAr ?? ""));
  row("Prénom AR", String(ca.prenom_ar ?? ""), String(d.FirstNameAr ?? ""));
  row("actuel (removed)", String(ca.actuel ?? "(gone from UI)"), "—");

  await closeDars();
  await p.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await p.$disconnect(); process.exit(1); });
