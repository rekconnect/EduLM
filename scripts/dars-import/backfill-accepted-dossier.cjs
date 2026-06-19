/**
 * One-off backfill: re-apply the (fixed) acceptance bridge mapping to an
 * application that was ACCEPTED before the bridge was completed. Mirrors
 * src/app/(app)/admissions-admin/_apply-dossier.ts:
 *   - child état-civil columns → student fiche customAnswers
 *   - scolarité (date d'entrée / d'inscription, école précédente)
 *   - image rights (Family) → per-year auth_site/livre/reseaux/radio
 *   - responsables' answers → submitter User.customAnswers + Guardian columns
 *     (phone, nationalité, isLebanese, relation=pere/mere)
 *
 * Dry-run by default. Pass --confirm to write. Target with --app=<applicationId>.
 * Run with DATABASE_URL pointed at the DIRECT (5432) port.
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const CONFIRM = process.argv.includes("--confirm");
const appArg = process.argv.find((a) => a.startsWith("--app="));
const APP_ID = appArg ? appArg.split("=")[1] : null;

function caStrings(raw) {
  const out = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  }
  return out;
}
const ynOf = (b) => (b === true ? "yes" : b === false ? "no" : "");

(async () => {
  if (!APP_ID) { console.error("Missing --app=<applicationId>"); process.exit(1); }
  const app = await p.application.findUnique({
    where: { id: APP_ID },
    include: {
      cycle: { select: { targetYearLabel: true } },
      responsables: { orderBy: { order: "asc" }, select: { kind: true, customAnswers: true } },
      submittedBy: { select: { id: true, email: true, customAnswers: true } },
    },
  });
  if (!app) { console.error("Application not found"); process.exit(1); }
  const studentId = app.resultingStudentId ?? app.existingStudentId;
  if (!studentId) { console.error("No student on this application"); process.exit(1); }
  const yearLabel = app.cycle.targetYearLabel;
  const student = await p.student.findUnique({
    where: { id: studentId },
    select: { id: true, firstName: true, lastName: true, previousSchool: true, customAnswers: true },
  });
  const dossier = (app.dossierAnswers && typeof app.dossierAnswers === "object") ? app.dossierAnswers : {};
  const scol = (dossier.scolarite && typeof dossier.scolarite === "object") ? dossier.scolarite : {};

  // ── Student fiche customAnswers ──
  const ca = { ...(student.customAnswers || {}) };
  const setCa = (k, v) => { if (typeof v === "string" && v.trim()) ca[k] = v.trim(); };
  setCa("pays_naissance", app.childBirthCountry);
  setCa("lieu_naissance", app.childPlaceOfBirth);
  setCa("nationalite", app.childNationality);
  setCa("nationalite2", app.childNationality2);
  setCa("numero_identite", app.childPassportLebanese);
  const nomPrenomAr = [app.childLastNameAr, app.childFirstNameAr].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  if (nomPrenomAr) ca.nom_prenom_ar = nomPrenomAr;
  if (typeof app.childIsLebanese === "boolean") ca.isLebanese = app.childIsLebanese ? "yes" : "no";
  if (app.childPlaceOfBirthAr && app.childPlaceOfBirthAr.trim()) ca.lieu_naissance_ar = app.childPlaceOfBirthAr.trim();
  if (typeof scol.entryDate === "string" && scol.entryDate) ca.date_entree = scol.entryDate;
  ca.date_inscription = (app.decisionAt ?? new Date()).toISOString().slice(0, 10);

  // ── Guardian + family image rights → per-year auth_* ──
  const email = (app.submittedBy.email || "").toLowerCase();
  const resp =
    app.responsables.find((r) => caStrings(r.customAnswers).email?.toLowerCase() === email && email) ||
    app.responsables.find((r) => r.kind === "PERE") || app.responsables[0] || null;
  const rca = resp ? caStrings(resp.customAnswers) : {};
  // Child inherits the father's registre + communauté (shared family sijill + religion).
  if (!ca.registerNum && rca.numero_registre) ca.registerNum = rca.numero_registre;
  if (!ca.communaute_eleve && rca.communaute) ca.communaute_eleve = rca.communaute;
  const guardian = await p.guardian.findUnique({ where: { userId: app.submittedBy.id }, select: { id: true, familyId: true } });
  let fam = null;
  if (guardian?.familyId) {
    fam = await p.family.findUnique({ where: { id: guardian.familyId }, select: { imageRightsSite: true, imageRightsBook: true, imageRightsSocial: true, imageRightsRadio: true } });
  }
  let reg = {};
  try { reg = ca.registration_by_year ? JSON.parse(ca.registration_by_year) : {}; } catch {}
  const year = { ...(reg[yearLabel] || {}) };
  if (fam) {
    const pairs = [["auth_site", fam.imageRightsSite], ["auth_livre", fam.imageRightsBook], ["auth_reseaux", fam.imageRightsSocial], ["auth_radio", fam.imageRightsRadio]];
    for (const [k, b] of pairs) { const v = ynOf(b); if (v) { year[k] = v; ca[k] = v; } }
  }
  reg[yearLabel] = year;
  ca.registration_by_year = JSON.stringify(reg);

  const userCa = { ...(app.submittedBy.customAnswers || {}), ...rca };
  const gData = {};
  if (rca.portable) gData.phone = rca.portable.slice(0, 40);
  if (rca.nationalite1) { gData.nationality1 = rca.nationalite1; gData.isLebanese = /liban/i.test(rca.nationalite1); }
  if (rca.nationalite2) gData.nationality2 = rca.nationalite2;
  const relByKind = { PERE: "pere", MERE: "mere", TUTEUR: "tuteur", AUTRE: "autre" };
  if (resp && relByKind[resp.kind]) gData.relation = relByKind[resp.kind];

  const prevSchool = (!student.previousSchool && typeof scol.previousSchool === "string" && scol.previousSchool) ? scol.previousSchool : null;

  console.log("=== BACKFILL", CONFIRM ? "(WRITING)" : "(dry-run)", "===");
  console.log("Student", student.id, student.firstName, student.lastName, "year", yearLabel);
  console.log("  student.customAnswers ->", JSON.stringify(ca));
  if (prevSchool) console.log("  student.previousSchool ->", prevSchool);
  console.log("Guardian", guardian?.id, "->", JSON.stringify(gData));
  console.log("User", app.submittedBy.id, "customAnswers keys ->", JSON.stringify(Object.keys(userCa)));

  if (!CONFIRM) { console.log("\nDry-run only. Re-run with --confirm to write."); return; }
  await p.student.update({ where: { id: student.id }, data: { customAnswers: ca, ...(prevSchool ? { previousSchool: prevSchool } : {}) } });
  await p.user.update({ where: { id: app.submittedBy.id }, data: { customAnswers: userCa } });
  if (guardian && Object.keys(gData).length > 0) await p.guardian.update({ where: { id: guardian.id }, data: gData });
  console.log("\nDONE — written.");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());
