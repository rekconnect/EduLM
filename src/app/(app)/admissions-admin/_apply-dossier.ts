import type { Prisma } from "@prisma/client";
import { parseTransport, parseSante, parseScolarite } from "@/lib/dossier-content";
import { parseEntityFieldsConfig } from "@/lib/entity-fields";

/**
 * The ACCEPTANCE BRIDGE — field matching between the online inscription /
 * ré-inscription dossier and the student record. Called when an application
 * is accepted; targets the cycle's year (2026-2027 today, every future year
 * automatically).
 *
 * What maps where:
 *  - dossierAnswers.transport  → registration_by_year[year] (autocar,
 *    transport_aller/retour "Avec bus"/"Avec parent", adresse alternative),
 *    collations / repas_chaud, services_by_year tokens, and a seeded
 *    bus_periods["<year>|T1"] entry so the pupil shows up in /transport
 *    ready for bus assignment.
 *  - dossierAnswers.sante      → StudentMedicalRecord (allergies, traitement,
 *    pédiatre, remarques) — only non-empty values, never clobbers existing.
 *  - studentAnswers (custom inscription fields) → Student.customAnswers
 *    merge — any custom field whose key matches a fiche field shows up
 *    automatically (the "field matching" for the custom-fields editor).
 *  - parentAnswers → the submitting parent's User.customAnswers merge.
 *  - ApplicationContact rows (PICKUP/URGENCE) → the parent's
 *    authorized_persons list (replaces it when the dossier provides one).
 *  - Foyer (adresse + droits à l'image) already writes straight to Family
 *    during the dossier — nothing to bridge.
 */

type Tx = Prisma.TransactionClient;

type ContactRow = {
  kind: "URGENCE" | "PICKUP";
  firstName: string;
  lastName: string;
  relation: string | null;
  phoneMobile: string | null;
  phoneHome: string | null;
};

/** A Père/Mère row from the two-responsable editor. */
type ResponsableRow = {
  kind: string; // PERE | MERE | TUTEUR | AUTRE
  customAnswers: unknown;
};

/** État-civil columns captured on the Application that have no dedicated
 *  Student column — they map into Student.customAnswers fiche keys. */
type ChildCivil = {
  birthCountry?: string | null;
  placeOfBirth?: string | null;
  nationality?: string | null;
  nationality2?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
  passportLebanese?: string | null;
  isLebanese?: boolean | null;
};

export async function applyDossierToStudent(
  tx: Tx,
  opts: {
    tenantId: string;
    studentId: string;
    yearLabel: string;
    dossierAnswers: unknown;
    studentAnswers: unknown;
    parentAnswers: unknown;
    submittedByUserId: string;
    submitterEmail?: string | null;
    contacts: ContactRow[];
    childPlaceOfBirthAr?: string | null;
    childCivil?: ChildCivil;
    responsables?: ResponsableRow[];
    imageRights?: {
      site: boolean | null;
      book: boolean | null;
      social: boolean | null;
      radio: boolean | null;
    };
    inscriptionDate?: string | null; // yyyy-mm-dd
  },
): Promise<void> {
  const { tenantId, studentId, yearLabel } = opts;
  const dossier =
    opts.dossierAnswers && typeof opts.dossierAnswers === "object"
      ? (opts.dossierAnswers as Record<string, unknown>)
      : {};
  const transport = parseTransport(dossier.transport);
  const sante = parseSante(dossier.sante);
  const scolarite = parseScolarite(dossier.scolarite);

  // ── Student.customAnswers ──
  const st = await tx.student.findUnique({
    where: { id: studentId },
    select: { customAnswers: true, previousSchool: true },
  });
  if (!st) return;
  const ca: Record<string, unknown> =
    st.customAnswers && typeof st.customAnswers === "object"
      ? { ...(st.customAnswers as Record<string, unknown>) }
      : {};

  // 1. Transport & restauration → per-year registration keys.
  const busAller = transport.modeAller === "bus";
  const busRetour = transport.modeRetour === "bus";
  const answered = transport.modeAller !== "" || transport.modeRetour !== "";
  let reg: Record<string, Record<string, string>> = {};
  if (typeof ca.registration_by_year === "string") {
    try {
      reg = JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>;
    } catch { /* ignore */ }
  }
  const year: Record<string, string> = { ...(reg[yearLabel] ?? {}) };
  if (answered) {
    year.autocar = busAller || busRetour ? "yes" : "no";
    if (transport.modeAller) year.transport_aller = busAller ? "Avec bus" : "Avec parent";
    if (transport.modeRetour) year.transport_retour = busRetour ? "Avec bus" : "Avec parent";
    year.transport_adresse_diff = transport.hasAlternateAddress ? "yes" : "no";
    if (transport.hasAlternateAddress) {
      if (transport.altStreet) year.transport_rue = transport.altStreet;
      if (transport.altBuilding) year.transport_immeuble = transport.altBuilding;
      if (transport.altFloor) year.transport_etage = transport.altFloor;
      if (transport.altVillage) year.transport_village = transport.altVillage;
      if (transport.altCaza) year.transport_caza = transport.altCaza;
      // Complete the Dars transport vocabulary so a form-filled dossier seeds
      // the same registration_by_year keys a Dars restore/import produces.
      if (transport.altDetails) year.transport_place = transport.altDetails;
      if (transport.altNotes) year.transport_remarque = transport.altNotes;
    }
  }
  if (transport.collation !== null) year.collations = transport.collation ? "yes" : "no";
  if (transport.cantine !== null) year.repas_chaud = transport.cantine ? "yes" : "no";
  // "Autorisé à quitter seul" — from the Autorisations tab.
  const autz =
    dossier.autorisations && typeof dossier.autorisations === "object"
      ? (dossier.autorisations as Record<string, unknown>)
      : {};
  if (typeof autz.quitterSeul === "boolean") {
    year.quitter_seul = autz.quitterSeul ? "yes" : "no";
  }
  // Image rights live on Family; mirror them into the per-year authorizations
  // (auth_site/livre/reseaux/radio) so the student fiche's "Autorisations" tab
  // shows them, plus single fallback keys for stable display.
  const ir = opts.imageRights;
  if (ir) {
    const ynOf = (b: boolean | null) => (b === true ? "yes" : b === false ? "no" : "");
    const pairs: Array<[string, boolean | null]> = [
      ["auth_site", ir.site],
      ["auth_livre", ir.book],
      ["auth_reseaux", ir.social],
      ["auth_radio", ir.radio],
    ];
    for (const [key, b] of pairs) {
      const v = ynOf(b);
      if (v) {
        year[key] = v;
        ca[key] = v; // single fallback the fiche reads for enrolled years
      }
    }
  }
  reg[yearLabel] = year;
  ca.registration_by_year = JSON.stringify(reg);

  // Scolarité → fiche keys (date d'entrée / date d'inscription). The bound
  // établissement/niveau come from the enrollment, not customAnswers.
  if (scolarite.entryDate) ca.date_entree = scolarite.entryDate;
  if (opts.inscriptionDate) ca.date_inscription = opts.inscriptionDate;

  // Billing tokens — the Cantine module reads these.
  if (transport.collation !== null || transport.cantine !== null) {
    let sby: Record<string, string> = {};
    if (typeof ca.services_by_year === "string") {
      try {
        sby = JSON.parse(ca.services_by_year) as Record<string, string>;
      } catch { /* ignore */ }
    }
    let tokens = (sby[yearLabel] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (transport.collation !== null) {
      tokens = tokens.filter((t) => t !== "Collation");
      if (transport.collation) tokens.push("Collation");
    }
    if (transport.cantine !== null) {
      tokens = tokens.filter((t) => t !== "Cantine");
      if (transport.cantine) tokens.push("Cantine");
    }
    sby[yearLabel] = tokens.join(", ");
    ca.services_by_year = JSON.stringify(sby);
  }

  // Seed the T1 trajets so the pupil appears in /transport, ready for the
  // bus admin to assign car/zone/station. Never overwrites an existing entry.
  if (busAller || busRetour) {
    let periods: Record<string, Record<string, string>> = {};
    if (typeof ca.bus_periods === "string") {
      try {
        periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
      } catch { /* ignore */ }
    }
    const key = `${yearLabel}|T1`;
    const prev = periods[key] ?? {};
    if (prev.as !== "yes" && prev.rs !== "yes") {
      periods[key] = {
        ...prev,
        as: busAller ? "yes" : "",
        rs: busRetour ? "yes" : "",
        car_matin: "", zoneno_matin: "", zone_matin: "", station_matin: "",
        car_soir: "", zoneno_soir: "", zone_soir: "", station_soir: "",
        activite_matin: "", activite_soir: "",
        remarques: prev.remarques ?? "",
      };
      ca.bus_periods = JSON.stringify(periods);
    }
  }

  // 2. Custom inscription fields → fiche fields with the same keys.
  if (opts.studentAnswers && typeof opts.studentAnswers === "object") {
    for (const [k, v] of Object.entries(opts.studentAnswers as Record<string, unknown>)) {
      if (v == null) continue;
      const t = typeof v === "string" ? v.trim() : String(v);
      if (t !== "") ca[k] = t;
    }
  }

  // Arabic place of birth (form field) → fiche key lieu_naissance_ar.
  if (opts.childPlaceOfBirthAr && opts.childPlaceOfBirthAr.trim()) {
    ca.lieu_naissance_ar = opts.childPlaceOfBirthAr.trim();
  }

  // 2b. État-civil columns captured on the Application but with no dedicated
  // Student column → the fiche keys the student dossier renders from
  // customAnswers (pays_naissance, nationalite, nationalite2, numero_identite,
  // nom_prenom_ar, isLebanese). Without this the fiche shows them empty even
  // though the parent filled them in. Only write non-empty values.
  const civil = opts.childCivil ?? {};
  const setCa = (key: string, v: string | null | undefined) => {
    if (typeof v === "string" && v.trim()) ca[key] = v.trim();
  };
  setCa("pays_naissance", civil.birthCountry);
  setCa("lieu_naissance", civil.placeOfBirth);
  setCa("nationalite", civil.nationality);
  setCa("nationalite2", civil.nationality2);
  setCa("numero_identite", civil.passportLebanese);
  const nomPrenomAr = [civil.lastNameAr, civil.firstNameAr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (nomPrenomAr) ca.nom_prenom_ar = nomPrenomAr;
  if (typeof civil.isLebanese === "boolean") {
    ca.isLebanese = civil.isLebanese ? "yes" : "no";
  }

  // Responsable resolution — the row for the submitting account (match by
  // email, else Père, else first). Reused below for the User/Guardian writes.
  const submitterEmail = (opts.submitterEmail ?? "").trim().toLowerCase();
  const responsables = Array.isArray(opts.responsables) ? opts.responsables : [];
  const caOf = (r: ResponsableRow): Record<string, string> => {
    const out: Record<string, string> = {};
    if (r.customAnswers && typeof r.customAnswers === "object") {
      for (const [k, v] of Object.entries(r.customAnswers as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
      }
    }
    return out;
  };
  const submitterResp =
    responsables.find((r) => caOf(r).email?.toLowerCase() === submitterEmail && submitterEmail) ??
    responsables.find((r) => r.kind === "PERE") ??
    responsables[0] ??
    null;
  const submitterCa = submitterResp ? caOf(submitterResp) : {};

  // Configurable "inherit from the father" bindings. Any student field with
  // `inheritParentKey` set seeds its value from the father's answer for that
  // parent key (submitterCa is resolved father-first above), only when the
  // student has no value of its own. In Lebanon the child shares the family
  // sijill (registre) and community/religion — those two fields ship with this
  // binding configured, and the admin can add more from Réglages → Champs.
  const studentCfg = parseEntityFieldsConfig(
    (
      await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { studentFieldsConfig: true },
      })
    )?.studentFieldsConfig,
  );
  for (const f of studentCfg.fields) {
    const pk = f.inheritParentKey?.trim();
    if (pk && !ca[f.key] && submitterCa[pk]) ca[f.key] = submitterCa[pk];
  }

  // Previous school (dossier) → Student.previousSchool column when the accept
  // flow didn't already set it (it reads app.currentSchool, often empty).
  const prevSchoolUpdate =
    !st.previousSchool && scolarite.previousSchool
      ? { previousSchool: scolarite.previousSchool }
      : {};

  await tx.student.update({
    where: { id: studentId },
    data: { customAnswers: ca as Prisma.InputJsonValue, ...prevSchoolUpdate },
  });

  // 3. Santé → infirmerie record (only fields the dossier actually filled).
  const santeHasContent =
    sante.allergies || sante.traitement || sante.doctorName || sante.doctorPhone ||
    sante.paiDetails || sante.diet || sante.notes || sante.hasPai !== null;
  if (santeHasContent) {
    const remarks = [
      sante.notes,
      sante.diet ? `Régime alimentaire: ${sante.diet}` : "",
      sante.hasPai === true ? `PAI: oui${sante.paiDetails ? ` — ${sante.paiDetails}` : ""}` : "",
      sante.vaccinationsUpToDate === false ? "Vaccinations non à jour (déclaré à l'inscription)" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const existing = await tx.studentMedicalRecord.findUnique({
      where: { studentId },
      select: { id: true },
    });
    const data = {
      ...(sante.allergies ? { allergies: sante.allergies } : {}),
      ...(sante.traitement ? { medications: sante.traitement } : {}),
      ...(sante.doctorName ? { pediatricianName: sante.doctorName } : {}),
      ...(sante.doctorPhone ? { pediatricianPhone: sante.doctorPhone } : {}),
      ...(remarks ? { remarks } : {}),
    };
    if (existing) {
      if (Object.keys(data).length > 0) {
        await tx.studentMedicalRecord.update({ where: { studentId }, data });
      }
    } else {
      await tx.studentMedicalRecord.create({
        data: { tenantId, studentId, ...data },
      });
    }
  }

  // 4. Parent answers + authorized persons → submitting parent's User +
  // Guardian. The two-responsable editor stores each parent on its own
  // ApplicationResponsable.customAnswers row — that's the real source now;
  // the legacy parentAnswers blob is kept only as a fallback (empty for new
  // dossiers). We merge the submitter's responsable answers into the parent's
  // User.customAnswers (which is what the fiche + Arabic section read) and
  // mirror the column-backed ones onto the Guardian row.
  const parent = await tx.user.findFirst({
    where: { id: opts.submittedByUserId, tenantId },
    select: { customAnswers: true },
  });
  if (parent) {
    const pca: Record<string, unknown> =
      parent.customAnswers && typeof parent.customAnswers === "object"
        ? { ...(parent.customAnswers as Record<string, unknown>) }
        : {};
    let changed = false;
    // Legacy blob (fallback).
    if (opts.parentAnswers && typeof opts.parentAnswers === "object") {
      for (const [k, v] of Object.entries(opts.parentAnswers as Record<string, unknown>)) {
        if (v == null) continue;
        const t = typeof v === "string" ? v.trim() : String(v);
        if (t !== "") {
          pca[k] = t;
          changed = true;
        }
      }
    }
    // Responsable answers (the real source). These keys are the parent fiche
    // field ids, so merging them populates every parent + Arabic fiche field.
    if (submitterResp) {
      const rca = caOf(submitterResp);
      for (const [k, v] of Object.entries(rca)) {
        pca[k] = v;
        changed = true;
      }
      // Mirror the column-backed parent fields onto the Guardian row.
      const guardian = await tx.guardian.findUnique({
        where: { userId: opts.submittedByUserId },
        select: { id: true },
      });
      if (guardian) {
        const gData: Record<string, unknown> = {};
        if (rca.portable) gData.phone = rca.portable.slice(0, 40);
        if (rca.nationalite1) gData.nationality1 = rca.nationalite1;
        if (rca.nationalite2) gData.nationality2 = rca.nationalite2;
        if (rca.nationalite1) {
          gData.isLebanese = /liban/i.test(rca.nationalite1);
        }
        // Set the relation so the student fiche's Arabic "father" block (which
        // reads the guardian with relation === "pere") resolves it. The accept
        // flow created the guardian with the generic relation "parent".
        const relByKind: Record<string, string> = {
          PERE: "pere",
          MERE: "mere",
          TUTEUR: "tuteur",
          AUTRE: "autre",
        };
        const rel = relByKind[submitterResp.kind];
        if (rel) gData.relation = rel;
        if (Object.keys(gData).length > 0) {
          await tx.guardian.update({ where: { id: guardian.id }, data: gData });
        }
      }
    }
    if (opts.contacts.length > 0) {
      const persons = opts.contacts
        .map((c) => ({
          relation: (c.relation ?? "").trim().slice(0, 120),
          name: `${c.firstName} ${c.lastName}`.trim().slice(0, 160),
          phone: (c.phoneMobile || c.phoneHome || "").trim().slice(0, 40),
          emergency: c.kind === "URGENCE",
        }))
        .filter((p) => p.name);
      if (persons.length > 0) {
        pca.authorized_persons = JSON.stringify(persons);
        changed = true;
      }
    }
    if (changed) {
      await tx.user.update({
        where: { id: opts.submittedByUserId },
        data: { customAnswers: pca as Prisma.InputJsonValue },
      });
    }
  }
}
