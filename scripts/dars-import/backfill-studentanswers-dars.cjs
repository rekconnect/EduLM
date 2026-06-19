// Phase-1 convergence backfill: copy existing Application child état-civil
// columns into Application.studentAnswers (Dars field ids), for in-progress
// dossiers (DRAFT/SUBMITTED). Accepted apps already wrote the student record.
// Dry-run by default; --confirm to write.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
(async () => {
  const apps = await p.application.findMany({
    where: { status: { in: ["DRAFT", "SUBMITTED"] } },
    select: {
      id: true, childFirstName: true, childLastName: true, status: true,
      childBirthCountry: true, childPlaceOfBirth: true, childPlaceOfBirthAr: true,
      childFirstNameAr: true, childLastNameAr: true, childNationality: true,
      childNationality2: true, childPassportLebanese: true, childIsLebanese: true,
      studentAnswers: true,
    },
  });
  let changed = 0;
  for (const a of apps) {
    const sa = (a.studentAnswers && typeof a.studentAnswers === "object") ? { ...a.studentAnswers } : {};
    const set = (k, v) => { if (typeof v === "string" && v.trim()) sa[k] = v.trim(); };
    set("pays_naissance", a.childBirthCountry);
    set("lieu_naissance", a.childPlaceOfBirth);
    set("lieu_naissance_ar", a.childPlaceOfBirthAr);
    set("nationalite", a.childNationality);
    set("nationalite2", a.childNationality2);
    if (a.childIsLebanese) set("numero_identite", a.childPassportLebanese);
    if (typeof a.childIsLebanese === "boolean") sa.isLebanese = a.childIsLebanese ? "yes" : "no";
    const npa = [a.childLastNameAr, a.childFirstNameAr].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
    if (npa) sa.nom_prenom_ar = npa;
    changed++;
    console.log(" ", a.status, a.childFirstName, a.childLastName, "->", JSON.stringify(sa));
    if (CONFIRM) await p.application.update({ where: { id: a.id }, data: { studentAnswers: sa } });
  }
  console.log(`\n${changed} in-progress apps ${CONFIRM ? "updated" : "(dry-run)"}.`);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());
