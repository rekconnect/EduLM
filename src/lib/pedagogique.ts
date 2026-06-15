/**
 * Pedagogical rules engine for the Scolarité tab.
 *
 * Montaigne's "Renseignements pédagogiques" section is class-conditional:
 *   - CE2 → 3ème: Arabe ALE / ALM (single choice)
 *   - 2nde: LVA + LVB + (LVC, options) + Section Internationale (BFI)
 *   - 1ère: 3 spécialités + LV + options + BFI + complément libanais
 *   - Tle:  2 spécialités + LV + options + maths comp/expertes + compléments
 *
 * `classifyNiveau` maps the niveau string (selected on the Scolarité
 * souhaitée card) into one of four groups; UI renders the matching
 * sub-card. Anything below CE2 (CP, CE1, maternelle) → no pedagogical
 * section, which is correct: there's no choice to make at that age.
 *
 * The catalogue of options (spécialités, langues, etc.) is hardcoded
 * here for now. Phase 5's WYSIWYG editor will let admin edit them
 * per-tenant.
 */

export type NiveauGroup =
  | "ce2_3eme"
  | "seconde"
  | "premiere"
  | "terminale"
  | null;

/** Normalize a niveau string to a stable lowercase key for matching. */
function norm(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const CE2_3EME = new Set([
  "ce2",
  "cm1",
  "cm2",
  "6e",
  "6eme",
  "5e",
  "5eme",
  "4e",
  "4eme",
  "3e",
  "3eme",
]);

/** First year of schooling (Petite Section / Toute Petite Section) — these
 *  pupils have no previous school, so the "antériorité" block is irrelevant. */
export function isFirstYearNiveau(niveau: string | null | undefined): boolean {
  if (!niveau) return false;
  const n = norm(niveau);
  return n === "ps" || n === "tps" || n.endsWith("ps") || n.includes("petitesection");
}

export function classifyNiveau(niveau: string | null | undefined): NiveauGroup {
  if (!niveau) return null;
  const n = norm(niveau);

  // Lycée — match common French abbreviations.
  if (n === "tle" || n.startsWith("term") || n === "t") return "terminale";
  if (n === "1ere" || n === "premiere" || n === "1") return "premiere";
  if (n === "2nde" || n === "seconde" || n === "2") return "seconde";

  if (CE2_3EME.has(n)) return "ce2_3eme";
  return null;
}

// ── Option catalogues (hardcoded; Phase 5 WYSIWYG will make editable) ──

export const SPECIALITES = [
  "LLCE anglais",
  "Physique-Chimie",
  "SVT",
  "Maths",
  "SES",
  "HGGSP",
  "HLP",
] as const;
export type Specialite = (typeof SPECIALITES)[number];

export const LVA_OPTIONS = ["arabe", "anglais"] as const;
export const LVB_OPTIONS_2NDE = ["arabe", "anglais", "espagnol"] as const;
export const LVB_OPTIONS_LYCEE = ["arabe", "anglais", "espagnol"] as const;
export const LVC_OPTIONS = ["arabe", "espagnol"] as const;

// ── Data shapes (all stored under dossierAnswers.pedagogique) ────

export type Ce23emeData = {
  arabe: "ALE" | "ALM" | "";
};

export type SecondeData = {
  lva: string;
  lvb: string;
  lvc: string[]; // multi
  artsPlastiques: boolean;
  siCit: boolean; // Sciences de l'Ingénieur — CIT
  sectionInternationale: boolean; // BFI in 2nde
};

export type PremiereData = {
  specialites: string[]; // ideally 3
  lva: string;
  lvb: string;
  lvc: string[];
  artsPlastiques: boolean;
  bfi: boolean;
  complementLibanaisPhysique: boolean;
};

export type TerminaleData = {
  specialites: string[]; // ideally 2
  lva: string;
  lvb: string;
  lvc: string[];
  artsPlastiques: boolean;
  mathsComplementaire: boolean;
  mathsExpertes: boolean;
  complementLibanaisPhysiqueSvt: boolean;
};

export type PedagogiqueData = {
  ce2_3eme: Ce23emeData;
  seconde: SecondeData;
  premiere: PremiereData;
  terminale: TerminaleData;
};

export function defaultPedagogique(): PedagogiqueData {
  return {
    ce2_3eme: { arabe: "" },
    seconde: {
      lva: "",
      lvb: "",
      lvc: [],
      artsPlastiques: false,
      siCit: false,
      sectionInternationale: false,
    },
    premiere: {
      specialites: [],
      lva: "",
      lvb: "",
      lvc: [],
      artsPlastiques: false,
      bfi: false,
      complementLibanaisPhysique: false,
    },
    terminale: {
      specialites: [],
      lva: "",
      lvb: "",
      lvc: [],
      artsPlastiques: false,
      mathsComplementaire: false,
      mathsExpertes: false,
      complementLibanaisPhysiqueSvt: false,
    },
  };
}

/** Defensive parse — tolerates missing keys, wrong types, and old data. */
export function parsePedagogique(raw: unknown): PedagogiqueData {
  const d = defaultPedagogique();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;

  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const b = (v: unknown) => v === true;
  const sa = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  if (r.ce2_3eme && typeof r.ce2_3eme === "object") {
    const c = r.ce2_3eme as Record<string, unknown>;
    if (c.arabe === "ALE" || c.arabe === "ALM") d.ce2_3eme.arabe = c.arabe;
  }
  if (r.seconde && typeof r.seconde === "object") {
    const c = r.seconde as Record<string, unknown>;
    d.seconde = {
      lva: s(c.lva),
      lvb: s(c.lvb),
      lvc: sa(c.lvc),
      artsPlastiques: b(c.artsPlastiques),
      siCit: b(c.siCit),
      sectionInternationale: b(c.sectionInternationale),
    };
  }
  if (r.premiere && typeof r.premiere === "object") {
    const c = r.premiere as Record<string, unknown>;
    d.premiere = {
      specialites: sa(c.specialites),
      lva: s(c.lva),
      lvb: s(c.lvb),
      lvc: sa(c.lvc),
      artsPlastiques: b(c.artsPlastiques),
      bfi: b(c.bfi),
      complementLibanaisPhysique: b(c.complementLibanaisPhysique),
    };
  }
  if (r.terminale && typeof r.terminale === "object") {
    const c = r.terminale as Record<string, unknown>;
    d.terminale = {
      specialites: sa(c.specialites),
      lva: s(c.lva),
      lvb: s(c.lvb),
      lvc: sa(c.lvc),
      artsPlastiques: b(c.artsPlastiques),
      mathsComplementaire: b(c.mathsComplementaire),
      mathsExpertes: b(c.mathsExpertes),
      complementLibanaisPhysiqueSvt: b(c.complementLibanaisPhysiqueSvt),
    };
  }
  return d;
}

/**
 * Per-group completion. Mathématiques-complémentaire and -expertes
 * are mutually exclusive (a kid can't have both) — UI enforces that
 * by treating them as a 3-state radio (none / comp / expertes).
 */
export function isPedagogiqueCompleteFor(
  group: NiveauGroup,
  d: PedagogiqueData,
): boolean {
  switch (group) {
    case null:
      return true; // no pedagogical section required
    case "ce2_3eme":
      return d.ce2_3eme.arabe.length > 0;
    case "seconde":
      return d.seconde.lva.length > 0 && d.seconde.lvb.length > 0;
    case "premiere":
      return (
        d.premiere.specialites.length >= 3 &&
        d.premiere.lva.length > 0 &&
        d.premiere.lvb.length > 0
      );
    case "terminale":
      return (
        d.terminale.specialites.length >= 2 &&
        d.terminale.lva.length > 0 &&
        d.terminale.lvb.length > 0 &&
        // mutually exclusive maths flags
        !(d.terminale.mathsComplementaire && d.terminale.mathsExpertes)
      );
  }
}
