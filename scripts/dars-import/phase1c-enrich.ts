/**
 * Dars → EduLM  ·  Phase 1c: enrich imported parents + students with the
 * full Dars fiche fields (writes customAnswers keyed by the field-set keys).
 *
 * Additive + idempotent — operates on already-imported records (matched by
 * darsParentId / darsStudentId), merges new keys into customAnswers without
 * dropping anything. Bound fields (name/email/phone/nationality/address/
 * image-rights/establishment/niveau) are NOT written here — they mirror the
 * canonical columns the base importer already filled.
 *
 * DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/phase1c-enrich.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/phase1c-enrich.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { CodesTable } from "./lib/codes.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const clean = (s?: string | null) => {
  const v = (s ?? "").toString().trim();
  return v === "--" || v === "" ? "" : v;
};
const yn = (b: boolean | number | null | undefined) =>
  b === null || b === undefined ? "" : b ? "yes" : "no";
const dstr = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? "" : x.toISOString().slice(0, 10);
};
const inList = (ids: number[]) => (ids.length ? ids.join(",") : "-1");
const PHONE_TYPE: Record<number, string> = { 1: "Fixe", 2: "Travail", 3: "Mobile", 4: "Autre" };

async function runChunked<T>(items: T[], size: number, label: string, fn: (i: T) => Promise<void>) {
  let done = 0;
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    // Retry each chunk a few times — rides out transient P2024 connection-pool
    // timeouts (Prisma connection_limit=1 + the dev server querying alongside).
    for (let attempt = 1; ; attempt++) {
      try {
        await Promise.all(chunk.map(fn));
        break;
      } catch (e) {
        if (attempt >= 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    done += chunk.length;
    process.stdout.write(`\r  ${label}: ${done}/${items.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const codes = await CodesTable.load();

  // Active EduLM year → Dars SYear (label "2025-2026" → 2026). Used to pick
  // the right Isc_StudentClass row for year-specific single values (the
  // registration date / class), instead of the latest re-registration.
  const activeYearRow = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  const activeSYear = activeYearRow
    ? Number(activeYearRow.label.split("-")[1])
    : null;

  // Lookup maps
  const qazaRows = await darsQuery<{ ID: number; Qaza: string | null; QazaAR: string | null }>(
    `SELECT ID, Qaza, QazaAR FROM Isc_Qaza WHERE Id_College = ${C}`,
  );
  const qazaFr = new Map(qazaRows.map((q) => [Number(q.ID), clean(q.Qaza)]));
  const townRows = await darsQuery<{ Id_Town: number; TownName: string | null }>(
    `SELECT Id_Town, TownName FROM Isc_Town WHERE Id_College = ${C}`,
  );
  const townName = new Map(townRows.map((t) => [Number(t.Id_Town), clean(t.TownName)]));
  const classRows = await darsQuery<{ ID_Class: number; ClassName: string | null; Section: string | null }>(
    `SELECT ID_Class, ClassName, Section FROM Isc_Classes WHERE Id_College = ${C}`,
  );
  const className = new Map(
    classRows.map((c) => {
      const sec = clean(c.Section);
      return [Number(c.ID_Class), `${clean(c.ClassName)}${sec && sec !== "--" ? " " + sec : ""}`.trim()];
    }),
  );
  const ftRows = await darsQuery<{ ID: number; FamilyType: string | null }>(
    `SELECT ID, FamilyType FROM Isc_FamilyType WHERE Id_College = ${C}`,
  );
  const familyTypeById = new Map(ftRows.map((f) => [Number(f.ID), clean(f.FamilyType)]));

  // ── PARENTS ──
  const eduParents = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: "PARENT", darsParentId: { not: null } },
    select: { id: true, darsParentId: true, customAnswers: true },
  });
  const parentIds = eduParents.map((p) => Number(p.darsParentId));
  console.log(`Imported parents to enrich: ${eduParents.length}`);

  const dParents = await darsQuery<Record<string, unknown>>(
    `SELECT ID_Parent, Id_Religion, Id_FamilySituation, Id_FamilyType, isAlumni, RegisterNum,
            Id_WorkStatus, Id_Occupation, Id_SubOccupation, OccupationDetails, WorkCompany,
            WorkPosition, WorkAddress, FirstNameAr, LastNameAr, MiddleNameAr, RegisterTown,
            RegisterTownAR, Id_RegisterQaza, Id_Address, IsDead, SecondMarriage, Actual
     FROM Isc_Parent WHERE Id_College = ${C} AND ID_Parent IN (${inList(parentIds)})`,
  );
  const parentById = new Map(dParents.map((p) => [Number(p.ID_Parent), p]));

  // Address detail per parent
  const addrIds = [...new Set(dParents.map((p) => Number(p.Id_Address)).filter((x) => x > 0))];
  const addrRows = addrIds.length
    ? await darsQuery<Record<string, unknown>>(
        `SELECT ID, Id_Qaza, Building, AddressFloor, PoBox, AddressRemark, StreetAr, BuildingAr, PlaceDetailsAr
         FROM Isc_Address WHERE Id_College = ${C} AND ID IN (${inList(addrIds)})`,
      )
    : [];
  const addrById = new Map(addrRows.map((a) => [Number(a.ID), a]));

  // Phones per parent → summary string
  const phoneRows = await darsQuery<{ Id_Parent: number; Id_Type: number; PhoneNum: string | null; Ext: string | null; Comment: string | null }>(
    `SELECT Id_Parent, Id_Type, PhoneNum, Ext, Comment FROM Isc_ParentPhone
     WHERE Id_College = ${C} AND Deleted = 0 AND Id_Parent IN (${inList(parentIds)})`,
  );
  const phonesByParent = new Map<number, string[]>();
  for (const ph of phoneRows) {
    const num = clean(ph.PhoneNum);
    if (!num) continue;
    const pid = Number(ph.Id_Parent);
    const ext = clean(ph.Ext) ? ` ext.${clean(ph.Ext)}` : "";
    const cm = clean(ph.Comment) ? ` (${clean(ph.Comment)})` : "";
    const line = `${PHONE_TYPE[Number(ph.Id_Type)] ?? "Tél"}: ${num}${ext}${cm}`;
    const arr = phonesByParent.get(pid) ?? [];
    arr.push(line);
    phonesByParent.set(pid, arr);
  }

  function parentAnswers(p: Record<string, unknown>): Record<string, string> {
    const a = p.Id_Address ? addrById.get(Number(p.Id_Address)) : undefined;
    const pid = Number(p.ID_Parent);
    const out: Record<string, string> = {
      situation_famille: codes.label(p.Id_FamilySituation as number),
      ancien_eleve: yn(p.isAlumni as boolean),
      numero_registre: clean(p.RegisterNum as string),
      communaute: codes.label(p.Id_Religion as number),
      type_famille: familyTypeById.get(Number(p.Id_FamilyType)) ?? "",
      telephones: (phonesByParent.get(pid) ?? []).join("\n"),
      statut_travail: codes.label(p.Id_WorkStatus as number),
      secteur_activite: codes.label(p.Id_Occupation as number),
      profession: codes.label(p.Id_SubOccupation as number),
      profession_detail: clean(p.OccupationDetails as string),
      societe: clean(p.WorkCompany as string),
      position: clean(p.WorkPosition as string),
      adresse_travail: clean(p.WorkAddress as string),
      nom_ar: clean(p.LastNameAr as string),
      prenom_ar: clean(p.FirstNameAr as string),
      nom_pere_ar: clean(p.MiddleNameAr as string),
      lieu_registre: clean((p.RegisterTownAR as string) || (p.RegisterTown as string)),
      caza_registre: qazaFr.get(Number(p.Id_RegisterQaza)) ?? "",
      // Per-parent flags (checkboxes next to Situation).
      ...(p.IsDead ? { decede: "yes" } : {}),
      ...(p.SecondMarriage ? { second_mariage: "yes" } : {}),
      ...(p.Actual != null ? { actuel: yn(p.Actual as boolean) } : {}),
    };
    if (a) {
      out.adresse_immeuble = clean(a.Building as string);
      out.adresse_etage = clean(a.AddressFloor as string);
      out.adresse_qaza = qazaFr.get(Number(a.Id_Qaza)) ?? "";
      out.adresse_bp = clean(a.PoBox as string);
      out.adresse_remarque = clean(a.AddressRemark as string);
      out.adresse_rue_ar = clean(a.StreetAr as string);
      out.adresse_immeuble_ar = clean(a.BuildingAr as string);
      out.adresse_place_ar = clean(a.PlaceDetailsAr as string);
    }
    // Drop empties so we don't bloat customAnswers
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  }

  // ── STUDENTS ──
  const eduStudents = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true, customAnswers: true },
  });
  const studentIds = eduStudents.map((s) => Number(s.darsStudentId));
  console.log(`Imported students to enrich: ${eduStudents.length}`);

  const dStudents = await darsQuery<Record<string, unknown>>(
    `SELECT ID_Student, StudentCode, CountryOfBirth, BirthPlace, BirthPlaceAr, Id_Nation1, Id_Nation2, Id_Religion,
            IdNumber, Email, CollegeEmail, StudentMobile, EntryDate, FirstNameAr, LastNameAr
     FROM Isc_Student WHERE Id_College = ${C} AND ID_Student IN (${inList(studentIds)})`,
  );
  const studentById = new Map(dStudents.map((s) => [Number(s.ID_Student), s]));

  // ALL StudentClass rows per student (every SYear). RegisterDate / class /
  // leaving are year-specific, so the single values use the ACTIVE year's row
  // (the date d'inscription for 2025-2026), falling back to the latest year
  // when the student isn't enrolled in the active year.
  const scRows = await darsQuery<Record<string, unknown>>(
    `SELECT sc.ID_Student, sc.SYear, sc.ID_Class, sc.RegisterDate, sc.HasLeft, sc.LeavingReason, sc.LeftDate
     FROM Isc_StudentClass sc
     WHERE sc.Id_College = ${C} AND sc.ID_Student IN (${inList(studentIds)})`,
  );
  const scByStudent = new Map<number, Map<number, Record<string, unknown>>>();
  for (const r of scRows) {
    const sid = Number(r.ID_Student);
    let m = scByStudent.get(sid);
    if (!m) {
      m = new Map();
      scByStudent.set(sid, m);
    }
    m.set(Number(r.SYear), r);
  }
  const scFor = (sid: number): Record<string, unknown> | undefined => {
    const m = scByStudent.get(sid);
    if (!m || m.size === 0) return undefined;
    if (activeSYear != null && m.has(activeSYear)) return m.get(activeSYear);
    return m.get(Math.max(...m.keys()));
  };

  // ALL Isc_ModifStudents rows per student (every SYear) — registration is
  // year-specific (the form that opened in 2024 fills the current year; the
  // re-registration open now fills next year). We keep each year so imports
  // land in the right year. Grouped: studentId → SYear → row.
  const modRows = await darsQuery<Record<string, unknown>>(
    `SELECT ms.Id_Student, ms.SYear, ms.HasSnack, ms.HasHotMeal, ms.AllowLeaveAlone, ms.BusRegistered,
            ms.Transportation_BusMorning, ms.Transportation_BusEvening,
            ms.Transportation_ParentsMorning, ms.Transportation_ParentsEvening,
            ms.transOtherAddress, ms.transOtherAddressQaza, ms.transOtherAddressTown,
            ms.transOtherAddressStreet, ms.transOtherAddressBuilding, ms.transOtherAddressAddressFloor,
            ms.transOtherAddressPlaceDetails, ms.transOtherAddressRemark,
            ms.AllowPublishImages, ms.AllowPublishToSouvenirBook, ms.AllowPublishToSocialMedia, ms.AllowPublishAudio
     FROM Isc_ModifStudents ms
     WHERE ms.Id_College = ${C} AND ms.Id_Student IN (${inList(studentIds)})`,
  );
  const modsByStudent = new Map<number, Map<number, Record<string, unknown>>>();
  for (const r of modRows) {
    const sid = Number(r.Id_Student);
    let m = modsByStudent.get(sid);
    if (!m) {
      m = new Map();
      modsByStudent.set(sid, m);
    }
    m.set(Number(r.SYear), r);
  }

  // ALSO read Isc_TmpStudent — the IN-PROGRESS registration (drafts not yet
  // finalized into Isc_ModifStudents). Active students' current registration —
  // authorizations, transport, snacks/cafeteria, pickup person — lives here.
  // Same shape, different service column names (Snacks/Cafeteria), so we
  // normalize them to HasSnack/HasHotMeal and reuse regForRow.
  const tmpRows = await darsQuery<Record<string, unknown>>(
    `SELECT t.ID_Student AS Id_Student, t.SYear, t.Snacks, t.Cafeteria, t.AllowLeaveAlone, t.BusRegistered,
            t.Transportation_BusMorning, t.Transportation_BusEvening,
            t.Transportation_ParentsMorning, t.Transportation_ParentsEvening,
            t.transOtherAddress, t.transOtherAddressQaza, t.transOtherAddressTown,
            t.transOtherAddressStreet, t.transOtherAddressBuilding, t.transOtherAddressAddressFloor,
            t.transOtherAddressPlaceDetails, t.transOtherAddressRemark,
            t.AllowPublishImages, t.AllowPublishToSouvenirBook, t.AllowPublishToSocialMedia, t.AllowPublishAudio,
            t.TransPersonName, t.TransPersonPhone
     FROM Isc_TmpStudent t
     WHERE t.Id_College = ${C} AND t.ID_Student IN (${inList(studentIds)})`,
  );
  const tmpByStudent = new Map<number, Map<number, Record<string, unknown>>>();
  for (const r of tmpRows) {
    const sid = Number(r.Id_Student);
    let m = tmpByStudent.get(sid);
    if (!m) {
      m = new Map();
      tmpByStudent.set(sid, m);
    }
    m.set(Number(r.SYear), { ...r, HasSnack: r.Snacks, HasHotMeal: r.Cafeteria });
  }

  // Qaza / Town id → label (used by the transport alternate address).
  const qazaLabel = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? (qazaFr.get(n) ?? "") : clean(v as string);
  };
  const townLabel = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? (townName.get(n) ?? "") : clean(v as string);
  };

  // One Isc_ModifStudents row → the registration fields for that year.
  function regForRow(m: Record<string, unknown>): Record<string, string> {
    const r: Record<string, string> = {};
    if (m.HasSnack != null) r.collations = yn(m.HasSnack as boolean);
    if (m.HasHotMeal != null) r.repas_chaud = yn(m.HasHotMeal as boolean);
    if (m.BusRegistered != null) r.autocar = yn(m.BusRegistered as boolean);
    if (m.Transportation_BusMorning) r.transport_aller = "Avec bus";
    else if (m.Transportation_ParentsMorning) r.transport_aller = "Avec parent";
    if (m.Transportation_BusEvening) r.transport_retour = "Avec bus";
    else if (m.Transportation_ParentsEvening) r.transport_retour = "Avec parent";
    if (m.transOtherAddress) {
      r.transport_adresse_diff = "yes";
      r.transport_caza = qazaLabel(m.transOtherAddressQaza);
      r.transport_village = townLabel(m.transOtherAddressTown);
      r.transport_rue = clean(m.transOtherAddressStreet as string);
      r.transport_immeuble = clean(m.transOtherAddressBuilding as string);
      r.transport_etage = clean(m.transOtherAddressAddressFloor as string);
      r.transport_place = clean(m.transOtherAddressPlaceDetails as string);
      r.transport_remarque = clean(m.transOtherAddressRemark as string);
    }
    if (m.AllowLeaveAlone != null) r.quitter_seul = yn(m.AllowLeaveAlone as boolean);
    if (m.AllowPublishImages != null) r.auth_site = yn(m.AllowPublishImages as boolean);
    if (m.AllowPublishToSouvenirBook != null) r.auth_livre = yn(m.AllowPublishToSouvenirBook as boolean);
    if (m.AllowPublishToSocialMedia != null) r.auth_reseaux = yn(m.AllowPublishToSocialMedia as boolean);
    if (m.AllowPublishAudio != null) r.auth_radio = yn(m.AllowPublishAudio as boolean);
    // Pickup person (Isc_TmpStudent only) — personne autorisée à récupérer.
    const person = clean(m.TransPersonName as string);
    if (person) {
      const phone = clean(m.TransPersonPhone as string);
      r.transport_person = phone ? `${person} (${phone})` : person;
    }
    for (const k of Object.keys(r)) if (!r[k]) delete r[k];
    return r;
  }

  function studentAnswers(s: Record<string, unknown>): Record<string, string> {
    const sid = Number(s.ID_Student);
    const sc = scFor(sid);
    const out: Record<string, string> = {
      dars_student_code: clean(s.StudentCode as string),
      pays_naissance: clean(s.CountryOfBirth as string),
      lieu_naissance: clean(s.BirthPlace as string),
      nationalite: codes.label(s.Id_Nation1 as number),
      nationalite2: codes.label(s.Id_Nation2 as number),
      communaute_eleve: codes.label(s.Id_Religion as number),
      numero_identite: clean(s.IdNumber as string),
      email_eleve: clean(s.Email as string),
      email_college: clean(s.CollegeEmail as string),
      portable_eleve: clean(s.StudentMobile as string),
      date_entree: dstr(s.EntryDate as Date),
      nom_prenom_ar: [clean(s.FirstNameAr as string), clean(s.LastNameAr as string)].filter(Boolean).join(" "),
      lieu_naissance_ar: clean(s.BirthPlaceAr as string),
    };
    if (sc) {
      out.classe = className.get(Number(sc.ID_Class)) ?? "";
      out.date_inscription = dstr(sc.RegisterDate as Date);
      out.a_quitte = yn(sc.HasLeft as boolean);
      out.raison_depart = clean(sc.LeavingReason as string);
      out.date_depart = dstr(sc.LeftDate as Date);
    }
    // Per-year registration snapshot (drives the year-aware fiche) + the
    // single-value consent fields. Both come from ALL the student's
    // Isc_ModifStudents rows. Services (collation / cantine / autocar) come
    // from BILLING, so they're only surfaced per-year here and NOT written as
    // single values. Single-value transport / authorizations / quitter_seul
    // take the most-recently-ANSWERED value across years (sorted ascending →
    // later years overwrite), so a value set in an earlier year still shows
    // even if the latest re-registration omitted those fields.
    const studentMods = modsByStudent.get(sid);
    const studentTmp = tmpByStudent.get(sid);
    if (studentMods || studentTmp) {
      const CONSENT = new Set([
        "quitter_seul",
        "transport_aller",
        "transport_retour",
        "transport_adresse_diff",
        "transport_caza",
        "transport_village",
        "transport_rue",
        "transport_immeuble",
        "transport_etage",
        "transport_place",
        "transport_remarque",
        "transport_person",
        "auth_site",
        "auth_livre",
        "auth_reseaux",
        "auth_radio",
      ]);
      // Each year: merge submitted (Isc_ModifStudents) with in-progress
      // (Isc_TmpStudent), in-progress winning per field (it's the latest draft).
      const sYears = new Set([
        ...(studentMods?.keys() ?? []),
        ...(studentTmp?.keys() ?? []),
      ]);
      const byYear: Record<string, Record<string, string>> = {};
      for (const sy of [...sYears].sort((a, b) => a - b)) {
        const r = {
          ...(studentMods?.has(sy) ? regForRow(studentMods.get(sy)!) : {}),
          ...(studentTmp?.has(sy) ? regForRow(studentTmp.get(sy)!) : {}),
        };
        if (Object.keys(r).length) byYear[`${sy - 1}-${sy}`] = r;
        for (const [k, vv] of Object.entries(r)) if (CONSENT.has(k)) out[k] = vv;
      }
      if (Object.keys(byYear).length)
        out.registration_by_year = JSON.stringify(byYear);
    }

    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  }

  // ── Sample preview ──
  const sp = eduParents.find((p) => parentById.has(Number(p.darsParentId)));
  if (sp) console.log("\nSample parent answers:", JSON.stringify(parentAnswers(parentById.get(Number(sp.darsParentId))!), null, 1));
  const ss = eduStudents.find((s) => studentById.has(Number(s.darsStudentId)));
  if (ss) console.log("\nSample student answers:", JSON.stringify(studentAnswers(studentById.get(Number(ss.darsStudentId))!), null, 1));

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to write.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  console.log("\n🔴 Writing customAnswers…");
  await runChunked(eduParents, 5, "parents", async (p) => {
    const d = parentById.get(Number(p.darsParentId));
    if (!d) return;
    const existing = (p.customAnswers && typeof p.customAnswers === "object" ? p.customAnswers : {}) as Record<string, unknown>;
    await prisma.user.update({
      where: { id: p.id },
      data: { customAnswers: { ...existing, ...parentAnswers(d) } },
    });
  });
  await runChunked(eduStudents, 5, "students", async (s) => {
    const d = studentById.get(Number(s.darsStudentId));
    if (!d) return;
    const existing = (s.customAnswers && typeof s.customAnswers === "object" ? s.customAnswers : {}) as Record<string, unknown>;
    await prisma.student.update({
      where: { id: s.id },
      data: { customAnswers: { ...existing, ...studentAnswers(d) } },
    });
  });

  console.log("\n✓ Enrichment complete.");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("\nERROR:", e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
