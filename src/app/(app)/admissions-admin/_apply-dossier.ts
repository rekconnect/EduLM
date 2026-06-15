import type { Prisma } from "@prisma/client";
import { parseTransport, parseSante } from "@/lib/dossier-content";

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
    contacts: ContactRow[];
    childPlaceOfBirthAr?: string | null;
  },
): Promise<void> {
  const { tenantId, studentId, yearLabel } = opts;
  const dossier =
    opts.dossierAnswers && typeof opts.dossierAnswers === "object"
      ? (opts.dossierAnswers as Record<string, unknown>)
      : {};
  const transport = parseTransport(dossier.transport);
  const sante = parseSante(dossier.sante);

  // ── Student.customAnswers ──
  const st = await tx.student.findUnique({
    where: { id: studentId },
    select: { customAnswers: true },
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
  reg[yearLabel] = year;
  ca.registration_by_year = JSON.stringify(reg);

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

  await tx.student.update({
    where: { id: studentId },
    data: { customAnswers: ca as Prisma.InputJsonValue },
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

  // 4. Parent custom answers + authorized persons → submitting parent.
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
