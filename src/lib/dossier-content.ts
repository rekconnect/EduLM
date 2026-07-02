/**
 * Typed shapes for Phase 2 dossier tabs. All "answer" objects are
 * stored in Application.dossierAnswers JSON, namespaced by tab name so
 * Phase 5's WYSIWYG editor can replace any one of them without touching
 * the others.
 *
 * Each tab exports:
 *   - parse{Tab}(raw): defensive parse from unknown JSON
 *   - {tab}Complete(answers): true when all required fields are filled
 *
 * Required-ness here is the Montaigne-default baseline. The WYSIWYG
 * editor will later let the tenant flip required on/off per field.
 */

// ── Foyer ───────────────────────────────────────────────
// The Foyer tab writes shared household state directly onto Family
// (address + image rights), and writes the per-application siblings
// table into ApplicationSibling rows. Nothing lands in dossierAnswers.

export type FoyerData = {
  // Address — Family fields
  addressCaza: string;
  addressVillage: string;
  addressStreet: string;
  addressBuilding: string;
  addressFloor: string;
  addressDetails: string;
  addressNotes: string;
  // Image rights — Family fields, three-state (null = not answered)
  imageRightsSite: boolean | null;
  imageRightsBook: boolean | null;
  imageRightsSocial: boolean | null;
  imageRightsRadio: boolean | null;
};

export function isFoyerComplete(d: FoyerData): boolean {
  return (
    d.addressCaza.length > 0 &&
    d.addressVillage.length > 0 &&
    d.addressStreet.length > 0 &&
    d.imageRightsSite !== null &&
    d.imageRightsBook !== null &&
    d.imageRightsSocial !== null &&
    d.imageRightsRadio !== null
  );
}

// ── Scolarité ───────────────────────────────────────────
// All of scolarite.* lives inside Application.dossierAnswers JSON.

const EBEP_FLAGS = ["PAI", "PAP", "PPS", "PPRE", "AESH"] as const;
export type EbepFlag = (typeof EBEP_FLAGS)[number];
export const EBEP_FLAGS_LIST: ReadonlyArray<EbepFlag> = EBEP_FLAGS;

const BILAN_FLAGS = [
  "orthophonique",
  "psychologique",
  "psychomoteur",
  "psychoPediatrique",
] as const;
export type BilanFlag = (typeof BILAN_FLAGS)[number];
export const BILAN_FLAGS_LIST: ReadonlyArray<BilanFlag> = BILAN_FLAGS;

export type ScolariteData = {
  // Établissement précédent
  previousSchool: string;
  previousClass: string;
  previousNetwork: string; // "MLF" | "AEFE" | "autre"
  attendedMlfBefore: boolean | null;
  // 3-year history table (informational)
  history: Array<{ year: string; className: string; school: string }>;
  // EBEP (élèves à besoins éducatifs particuliers)
  ebepPrevious: boolean | null;
  ebepPreviousFlags: Record<EbepFlag, boolean>;
  ebepCurrent: boolean | null; // "au sein de notre établissement"
  ebepCurrentFlags: Record<EbepFlag, boolean>;
  bilansRealises: Record<BilanFlag, boolean>;
  // Dispense des examens libanais (valid à partir du CE2)
  dispenseLibanais: "non" | "oui" | null;
  // Wishlist (niveau souhaité) — establishment + niveau already on
  // Application; we ALSO capture date d'entrée + section here.
  entryDate: string; // YYYY-MM-DD
  section: string;
};

export function defaultScolarite(): ScolariteData {
  return {
    previousSchool: "",
    previousClass: "",
    previousNetwork: "",
    attendedMlfBefore: null,
    history: [],
    ebepPrevious: null,
    ebepPreviousFlags: {
      PAI: false,
      PAP: false,
      PPS: false,
      PPRE: false,
      AESH: false,
    },
    ebepCurrent: null,
    ebepCurrentFlags: {
      PAI: false,
      PAP: false,
      PPS: false,
      PPRE: false,
      AESH: false,
    },
    bilansRealises: {
      orthophonique: false,
      psychologique: false,
      psychomoteur: false,
      psychoPediatrique: false,
    },
    dispenseLibanais: null,
    entryDate: "",
    section: "",
  };
}

export function parseScolarite(raw: unknown): ScolariteData {
  const d = defaultScolarite();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;

  // Defensive helpers — accept anything JSON-deserializable and coerce.
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const b3 = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null;
  const flags = <K extends string>(
    v: unknown,
    keys: readonly K[],
  ): Record<K, boolean> => {
    const out = {} as Record<K, boolean>;
    for (const k of keys) out[k] = false;
    if (v && typeof v === "object") {
      for (const k of keys) {
        if ((v as Record<string, unknown>)[k] === true) out[k] = true;
      }
    }
    return out;
  };

  d.previousSchool = s(r.previousSchool);
  d.previousClass = s(r.previousClass);
  d.previousNetwork = s(r.previousNetwork);
  d.attendedMlfBefore = b3(r.attendedMlfBefore);
  d.ebepPrevious = b3(r.ebepPrevious);
  d.ebepPreviousFlags = flags(r.ebepPreviousFlags, EBEP_FLAGS);
  d.ebepCurrent = b3(r.ebepCurrent);
  d.ebepCurrentFlags = flags(r.ebepCurrentFlags, EBEP_FLAGS);
  d.bilansRealises = flags(r.bilansRealises, BILAN_FLAGS);
  d.entryDate = s(r.entryDate);
  d.section = s(r.section);

  const disp = r.dispenseLibanais;
  if (disp === "oui" || disp === "non") d.dispenseLibanais = disp;

  if (Array.isArray(r.history)) {
    d.history = r.history
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        year: s((row as Record<string, unknown>).year),
        className: s((row as Record<string, unknown>).className),
        school: s((row as Record<string, unknown>).school),
      }));
  }
  return d;
}

export function isScolariteComplete(d: ScolariteData): boolean {
  return (
    d.previousSchool.length > 0 &&
    d.previousClass.length > 0 &&
    d.attendedMlfBefore !== null &&
    d.ebepPrevious !== null &&
    d.ebepCurrent !== null &&
    d.dispenseLibanais !== null &&
    d.entryDate.length > 0
  );
}

// ── Transport & restauration ─────────────────────────────

export type TransportMode = "bus" | "parents" | "";

export type TransportData = {
  modeAller: TransportMode;
  modeRetour: TransportMode;
  // Alternate pickup/dropoff address — used when the kid is dropped at
  // a different address than the family home (grand-parents, etc.).
  hasAlternateAddress: boolean;
  altCaza: string;
  altVillage: string;
  altStreet: string;
  altBuilding: string;
  altFloor: string;
  altDetails: string;
  altNotes: string;
  // Restauration. Collation is mandatory for maternelle — the UI
  // enforces that based on the chosen niveau.
  collation: boolean | null;
  cantine: boolean | null;
};

export function defaultTransport(): TransportData {
  return {
    modeAller: "",
    modeRetour: "",
    hasAlternateAddress: false,
    altCaza: "",
    altVillage: "",
    altStreet: "",
    altBuilding: "",
    altFloor: "",
    altDetails: "",
    altNotes: "",
    collation: null,
    cantine: null,
  };
}

export function parseTransport(raw: unknown): TransportData {
  const d = defaultTransport();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const b3 = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null;
  if (r.modeAller === "bus" || r.modeAller === "parents") d.modeAller = r.modeAller;
  if (r.modeRetour === "bus" || r.modeRetour === "parents") d.modeRetour = r.modeRetour;
  d.hasAlternateAddress = r.hasAlternateAddress === true;
  d.altCaza = s(r.altCaza);
  d.altVillage = s(r.altVillage);
  d.altStreet = s(r.altStreet);
  d.altBuilding = s(r.altBuilding);
  d.altFloor = s(r.altFloor);
  d.altDetails = s(r.altDetails);
  d.altNotes = s(r.altNotes);
  d.collation = b3(r.collation);
  d.cantine = b3(r.cantine);

  // Config-native (Services entity-fields) shape: the Transport tab can save
  // answers under the Dars "registration" vocabulary (transport_aller/retour,
  // collations, repas_chaud, transport_adresse_diff + transport_* address)
  // instead of the legacy TransportData keys. Map those onto TransportData so
  // every consumer (bridge, completion, admin view) keeps working unchanged.
  // Purely additive — legacy dossiers carry none of these keys.
  const yn = (v: unknown): boolean | null => {
    const x = s(v).toLowerCase();
    if (x === "yes" || x === "true" || x === "oui") return true;
    if (x === "no" || x === "false" || x === "non") return false;
    return null;
  };
  const modeOf = (v: unknown): TransportMode =>
    s(v) === "Avec bus" ? "bus" : s(v) === "Avec parent" ? "parents" : "";
  if ("transport_aller" in r && modeOf(r.transport_aller)) d.modeAller = modeOf(r.transport_aller);
  if ("transport_retour" in r && modeOf(r.transport_retour)) d.modeRetour = modeOf(r.transport_retour);
  if ("transport_adresse_diff" in r) {
    const diff = yn(r.transport_adresse_diff);
    if (diff !== null) d.hasAlternateAddress = diff;
  }
  if (s(r.transport_caza)) d.altCaza = s(r.transport_caza);
  if (s(r.transport_village)) d.altVillage = s(r.transport_village);
  if (s(r.transport_rue)) d.altStreet = s(r.transport_rue);
  if (s(r.transport_immeuble)) d.altBuilding = s(r.transport_immeuble);
  if (s(r.transport_etage)) d.altFloor = s(r.transport_etage);
  if (s(r.transport_place)) d.altDetails = s(r.transport_place);
  if (s(r.transport_remarque)) d.altNotes = s(r.transport_remarque);
  if ("collations" in r) {
    const c = yn(r.collations);
    if (c !== null) d.collation = c;
  }
  if ("repas_chaud" in r) {
    const c = yn(r.repas_chaud);
    if (c !== null) d.cantine = c;
  }
  return d;
}

/**
 * Inverse of parseTransport's config-native mapping: TransportData → the Dars
 * "Services" vocabulary (the exact keys the config form + Dars import use). Lets
 * the config-rendered Transport tab load a legacy dossier (or re-emit a new one)
 * with every field pre-filled. autocar is derived from the per-direction modes.
 */
export function serviceAnswersFromTransport(
  d: TransportData,
): Record<string, string> {
  const answered = d.modeAller !== "" || d.modeRetour !== "";
  const modeStr = (m: TransportMode) =>
    m === "bus" ? "Avec bus" : m === "parents" ? "Avec parent" : "";
  const yn3 = (b: boolean | null) => (b === true ? "yes" : b === false ? "no" : "");
  return {
    autocar:
      d.modeAller === "bus" || d.modeRetour === "bus"
        ? "yes"
        : answered
          ? "no"
          : "",
    transport_aller: modeStr(d.modeAller),
    transport_retour: modeStr(d.modeRetour),
    transport_adresse_diff: d.hasAlternateAddress ? "yes" : "no",
    transport_caza: d.altCaza,
    transport_village: d.altVillage,
    transport_rue: d.altStreet,
    transport_immeuble: d.altBuilding,
    transport_etage: d.altFloor,
    transport_place: d.altDetails,
    transport_remarque: d.altNotes,
    collations: yn3(d.collation),
    repas_chaud: yn3(d.cantine),
  };
}

export function isTransportComplete(d: TransportData): boolean {
  if (!d.modeAller || !d.modeRetour) return false;
  if (d.hasAlternateAddress) {
    if (!d.altCaza || !d.altVillage || !d.altStreet) return false;
  }
  if (d.collation === null || d.cantine === null) return false;
  return true;
}

// ── Santé ──────────────────────────────────────────────
// Stored under Application.dossierAnswers.sante. Hidden by default for
// Lycée Montaigne; other MLF schools flip the tab on via tenant config.

export type SanteData = {
  allergies: string;
  traitement: string;
  doctorName: string;
  doctorPhone: string;
  vaccinationsUpToDate: boolean | null;
  hasPai: boolean | null;
  paiDetails: string;
  diet: string;
  notes: string;
};

export function defaultSante(): SanteData {
  return {
    allergies: "",
    traitement: "",
    doctorName: "",
    doctorPhone: "",
    vaccinationsUpToDate: null,
    hasPai: null,
    paiDetails: "",
    diet: "",
    notes: "",
  };
}

export function parseSante(raw: unknown): SanteData {
  const d = defaultSante();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  // Shape-tolerant: legacy dossiers store booleans; config-native dossiers
  // store "yes"/"no" strings from the yes_no fields. Accept both.
  const b3 = (v: unknown): boolean | null => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const x = v.toLowerCase();
      if (x === "yes" || x === "true" || x === "oui") return true;
      if (x === "no" || x === "false" || x === "non") return false;
    }
    return null;
  };
  return {
    allergies: s(r.allergies),
    traitement: s(r.traitement),
    doctorName: s(r.doctorName),
    doctorPhone: s(r.doctorPhone),
    vaccinationsUpToDate: b3(r.vaccinationsUpToDate),
    hasPai: b3(r.hasPai),
    paiDetails: s(r.paiDetails),
    diet: s(r.diet),
    notes: s(r.notes),
  };
}

/**
 * SanteData → config-native answers (yes_no booleans → "yes"/"no" strings) for
 * the entity-fields Santé tab. Lets a legacy or new dossier prefill the form.
 */
export function santeAnswers(d: SanteData): Record<string, string> {
  const yn = (b: boolean | null) => (b === true ? "yes" : b === false ? "no" : "");
  return {
    allergies: d.allergies,
    traitement: d.traitement,
    doctorName: d.doctorName,
    doctorPhone: d.doctorPhone,
    vaccinationsUpToDate: yn(d.vaccinationsUpToDate),
    hasPai: yn(d.hasPai),
    paiDetails: d.paiDetails,
    diet: d.diet,
    notes: d.notes,
  };
}

export function isSanteComplete(d: SanteData): boolean {
  // Both yes/no questions answered = complete. Free-text fields don't
  // gate the tab.
  return d.vaccinationsUpToDate !== null && d.hasPai !== null;
}

// ── Finance ────────────────────────────────────────────
// Stored under Application.dossierAnswers.finance. Hidden by default
// for Lycée Montaigne (paper form handles it).

export type FinanceData = {
  acknowledgedReglementInterieur: boolean;
  acknowledgedReglementFinancier: boolean;
  acknowledgedDroitsEntreeMlf: boolean;
  comiteParents: boolean | null;
  caisseLbp: string;
  caisseLbpAutreAmount: string;
  caisseUsd: string;
  caisseUsdAutreAmount: string;
};

export function defaultFinance(): FinanceData {
  return {
    acknowledgedReglementInterieur: false,
    acknowledgedReglementFinancier: false,
    acknowledgedDroitsEntreeMlf: false,
    comiteParents: null,
    caisseLbp: "",
    caisseLbpAutreAmount: "",
    caisseUsd: "",
    caisseUsdAutreAmount: "",
  };
}

export function parseFinance(raw: unknown): FinanceData {
  const d = defaultFinance();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  // Shape-tolerant: legacy booleans OR config-native "yes"/"no" strings.
  const b = (v: unknown) => v === true || v === "yes" || v === "true";
  const b3 = (v: unknown): boolean | null => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const x = v.toLowerCase();
      if (x === "yes" || x === "true" || x === "oui") return true;
      if (x === "no" || x === "false" || x === "non") return false;
    }
    return null;
  };
  return {
    acknowledgedReglementInterieur: b(r.acknowledgedReglementInterieur),
    acknowledgedReglementFinancier: b(r.acknowledgedReglementFinancier),
    acknowledgedDroitsEntreeMlf: b(r.acknowledgedDroitsEntreeMlf),
    comiteParents: b3(r.comiteParents),
    caisseLbp: s(r.caisseLbp),
    caisseLbpAutreAmount: s(r.caisseLbpAutreAmount),
    caisseUsd: s(r.caisseUsd),
    caisseUsdAutreAmount: s(r.caisseUsdAutreAmount),
  };
}

/**
 * FinanceData → config-native answers (acknowledgements + comité as yes_no
 * "yes"/"no" strings) for the entity-fields Finance tab. caisse* stay as their
 * stored value/amount strings.
 */
export function financeAnswers(d: FinanceData): Record<string, string> {
  const yn = (b: boolean | null) => (b === true ? "yes" : b === false ? "no" : "");
  return {
    acknowledgedReglementInterieur: d.acknowledgedReglementInterieur ? "yes" : "",
    acknowledgedReglementFinancier: d.acknowledgedReglementFinancier ? "yes" : "",
    acknowledgedDroitsEntreeMlf: d.acknowledgedDroitsEntreeMlf ? "yes" : "",
    comiteParents: yn(d.comiteParents),
    caisseLbp: d.caisseLbp,
    caisseLbpAutreAmount: d.caisseLbpAutreAmount,
    caisseUsd: d.caisseUsd,
    caisseUsdAutreAmount: d.caisseUsdAutreAmount,
  };
}

export function isFinanceComplete(d: FinanceData): boolean {
  // Three required acks ticked + comité answered = complete. Caisse
  // de solidarité is optional.
  return (
    d.acknowledgedReglementInterieur &&
    d.acknowledgedReglementFinancier &&
    d.acknowledgedDroitsEntreeMlf &&
    d.comiteParents !== null
  );
}
