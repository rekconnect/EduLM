/**
 * Config-native bridge for the Scolarité tab.
 *
 * Scolarité is the last hardcoded parent dossier tab. Its data model is the
 * most complex of all tabs:
 *   - flat `ScolariteData`     (antériorité, EBEP flags, bilans, dispense, wishlist)
 *   - nested `PedagogiqueData` (4 niveau groups, each with arrays: lvc, spécialités)
 *   - Application columns      (establishmentId, niveau) — edited by the tab but
 *                              NOT part of the entity-fields config
 *
 * The entity-fields config (System A) stores answers as a FLAT
 * `Record<fieldId, string>`. This module is the single source of truth that
 * maps between that flat shape and the two nested canonical stores, so the
 * seed script, the parent tab, and `saveScolariteTab` all agree on field ids.
 *
 * Gating: the pédagogique sub-cards + the antériorité / dispense blocks are
 * niveau-conditional. Raw niveau strings ("3ème" vs "3e" vs "3EME") need the
 * `classifyNiveau` / `isFirstYearNiveau` normalisation that `showIf` (exact
 * string match) can't do — so the tab injects two SYNTHETIC gating answers
 * (`__niveauGroup`, `__firstYear`) that the seeded `showIf` rules reference.
 * These are never persisted; they're recomputed from the niveau select.
 */

import type { ConditionalRule, FieldType, SubFieldDef } from "./entity-fields";
import {
  BILAN_FLAGS_LIST,
  defaultScolarite,
  EBEP_FLAGS_LIST,
  type BilanFlag,
  type EbepFlag,
  type ScolariteData,
} from "./dossier-content";
import {
  classifyNiveau,
  defaultPedagogique,
  isFirstYearNiveau,
  LVA_OPTIONS,
  LVB_OPTIONS_2NDE,
  LVB_OPTIONS_LYCEE,
  LVC_OPTIONS,
  type PedagogiqueData,
  SPECIALITES,
} from "./pedagogique";

export const SCOLARITE_CATEGORY_NAME = "Scolarité";

/** Synthetic (non-persisted) gating fields injected into the answers map. */
export const NIVEAU_GROUP_FIELD = "__niveauGroup";
export const FIRST_YEAR_FIELD = "__firstYear";

/** Stable field ids — id === key === answer key (see parseEntityFieldsConfig). */
export const SCOLARITE_IDS = {
  // Antériorité (établissement précédent)
  previousSchool: "scolarite_previousSchool",
  previousClass: "scolarite_previousClass",
  previousNetwork: "scolarite_previousNetwork",
  attendedMlfBefore: "scolarite_attendedMlfBefore",
  history: "scolarite_history",
  // EBEP
  ebepPrevious: "scolarite_ebepPrevious",
  ebepCurrent: "scolarite_ebepCurrent",
  dispenseLibanais: "scolarite_dispenseLibanais",
  // Wishlist extras
  entryDate: "scolarite_entryDate",
  section: "scolarite_section",
  // Pédagogique — CE2 → 3ème
  arabe: "peda_ce2_arabe",
  // Pédagogique — 2nde
  s2_lva: "peda_2nde_lva",
  s2_lvb: "peda_2nde_lvb",
  s2_lvc: "peda_2nde_lvc",
  s2_arts: "peda_2nde_artsPlastiques",
  s2_siCit: "peda_2nde_siCit",
  s2_si: "peda_2nde_sectionInternationale",
  // Pédagogique — 1ère
  p1_spec: "peda_1ere_specialites",
  p1_lva: "peda_1ere_lva",
  p1_lvb: "peda_1ere_lvb",
  p1_lvc: "peda_1ere_lvc",
  p1_arts: "peda_1ere_artsPlastiques",
  p1_bfi: "peda_1ere_bfi",
  p1_compLib: "peda_1ere_complementLibanaisPhysique",
  // Pédagogique — Tle
  t_spec: "peda_tle_specialites",
  t_lva: "peda_tle_lva",
  t_lvb: "peda_tle_lvb",
  t_lvc: "peda_tle_lvc",
  t_arts: "peda_tle_artsPlastiques",
  // Single 3-state select (aucune / complémentaire / expertes) — the two are
  // MUTUALLY EXCLUSIVE (isPedagogiqueCompleteFor rejects both), so modelling
  // them as one select structurally forbids the impossible both-true state.
  t_maths: "peda_tle_maths",
  t_compLib: "peda_tle_complementLibanaisPhysiqueSvt",
} as const;

export const ebepPrevId = (f: EbepFlag) => `scolarite_ebepPrev_${f}`;
export const ebepCurId = (f: EbepFlag) => `scolarite_ebepCur_${f}`;
export const bilanId = (f: BilanFlag) => `scolarite_bilan_${f}`;

// ── Categories (rendered as sections; distinct names avoid the live cat_scol
//    "Scolarité" admin-fiche category + the ghost "Renseignements pédagogiques"). ──

export const CAT_SOUHAIT = "Souhait d'inscription";
export const CAT_PARCOURS = "Parcours scolaire";
export const CAT_EBEP = "Accompagnement (EBEP)";
export const CAT_PEDAGO = "Options pédagogiques";

/** The 4 sections of the config-native Scolarité tab, in render order. */
export const SCOLARITE_CATEGORIES: Array<{ name: string; order: number }> = [
  { name: CAT_SOUHAIT, order: 20 },
  { name: CAT_PARCOURS, order: 21 },
  { name: CAT_EBEP, order: 22 },
  { name: CAT_PEDAGO, order: 23 },
];

/** The 4 category names the Scolarité tab renders — the single list that the
 *  parent page filter, the /settings editor tab, and the seeder all consume. */
export const SCOLARITE_CATEGORY_NAMES: string[] = SCOLARITE_CATEGORIES.map(
  (c) => c.name,
);

/** Stable seed ids for the 4 categories (deterministic → idempotent seeding). */
export const SCOLARITE_CATEGORY_IDS: Record<string, string> = {
  [CAT_SOUHAIT]: "scol_dossier_souhait",
  [CAT_PARCOURS]: "scol_dossier_parcours",
  [CAT_EBEP]: "scol_dossier_ebep",
  [CAT_PEDAGO]: "scol_dossier_pedago",
};

/** Which section a field belongs to (keeps specs free of per-field category noise). */
export function categoryForSpec(id: string): string {
  if (id === SCOLARITE_IDS.entryDate || id === SCOLARITE_IDS.section) {
    return CAT_SOUHAIT;
  }
  if (id.startsWith("peda_")) return CAT_PEDAGO;
  if (
    id === SCOLARITE_IDS.ebepPrevious ||
    id === SCOLARITE_IDS.ebepCurrent ||
    id === SCOLARITE_IDS.dispenseLibanais ||
    id.startsWith("scolarite_ebepPrev_") ||
    id.startsWith("scolarite_ebepCur_") ||
    id.startsWith("scolarite_bilan_")
  ) {
    return CAT_EBEP;
  }
  // previousSchool / previousClass / previousNetwork / attendedMlfBefore / history
  return CAT_PARCOURS;
}

// ── Option catalogues (value|label — the renderer splits on the first "|") ──

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lvOpts = (vals: readonly string[]): string[] =>
  vals.map((v) => `${v}|${cap(v)}`);

const NETWORK_OPTS = ["MLF|MLF", "AEFE|AEFE", "autre|Autre"];
const ARABE_OPTS = [
  "ALE|Arabe langue étrangère (ALE)",
  "ALM|Arabe langue maternelle (ALM)",
];
const DISPENSE_OPTS = ["non|Non", "oui|Oui"];

const HISTORY_COLUMNS: SubFieldDef[] = [
  { key: "year", label: "Année", type: "short_text" },
  { key: "className", label: "Classe", type: "short_text" },
  { key: "school", label: "Établissement", type: "short_text" },
];

// ── Field specs (seed source of truth; ordered as they render) ──────────────

export type ScolariteFieldSpec = {
  id: string;
  label: string;
  type: FieldType;
  /**
   * NOTE: intentionally never set true. Like every other migrated dossier tab
   * (Foyer/Santé/Finance/…), these fields store to dossierAnswers, NOT
   * Application.studentAnswers — but `submitDossier` scans studentConfig
   * required fields against studentAnswers, so a config-level `required` here
   * would flag the field as permanently empty and block submission forever.
   * Actual required-ness is enforced server-side in `saveScolariteTab`
   * (isPedagogiqueCompleteFor + the System-B registry) → tabsCompleted.
   */
  required?: boolean;
  hint?: string;
  options?: string[];
  subFields?: SubFieldDef[];
  showIf?: ConditionalRule;
  hideIf?: ConditionalRule;
};

/** Hide when the pupil is in their first year of schooling (PS/TPS). */
const HIDE_IF_FIRST_YEAR: ConditionalRule = {
  fieldId: FIRST_YEAR_FIELD,
  equals: "yes",
};
const SHOW_IF_NOT_FIRST_YEAR: ConditionalRule = {
  fieldId: FIRST_YEAR_FIELD,
  equals: "no",
};
const showIfGroup = (group: string): ConditionalRule => ({
  fieldId: NIVEAU_GROUP_FIELD,
  equals: group,
});
const showIfYes = (fieldId: string): ConditionalRule => ({
  fieldId,
  equals: "yes",
});

export function scolariteFieldSpecs(): ScolariteFieldSpec[] {
  const specs: ScolariteFieldSpec[] = [
    // ── Antériorité ──
    {
      id: SCOLARITE_IDS.previousSchool,
      label: "Établissement précédent",
      type: "short_text",      hideIf: HIDE_IF_FIRST_YEAR,
    },
    {
      id: SCOLARITE_IDS.previousClass,
      label: "Dernière classe suivie",
      type: "short_text",      hideIf: HIDE_IF_FIRST_YEAR,
    },
    {
      id: SCOLARITE_IDS.previousNetwork,
      label: "Réseau de l'établissement précédent",
      type: "select",
      options: NETWORK_OPTS,
      hideIf: HIDE_IF_FIRST_YEAR,
    },
    {
      id: SCOLARITE_IDS.attendedMlfBefore,
      label: "A déjà été scolarisé dans un établissement du réseau MLF ?",
      type: "yes_no",
      hideIf: HIDE_IF_FIRST_YEAR,
    },
    {
      id: SCOLARITE_IDS.history,
      label: "Parcours scolaire (3 dernières années)",
      type: "repeater",
      subFields: HISTORY_COLUMNS,
      hideIf: HIDE_IF_FIRST_YEAR,
    },
    // ── EBEP ──
    {
      id: SCOLARITE_IDS.ebepPrevious,
      label:
        "Élève à besoins éducatifs particuliers dans l'établissement précédent ?",
      type: "yes_no",
    },
    ...EBEP_FLAGS_LIST.map(
      (f): ScolariteFieldSpec => ({
        id: ebepPrevId(f),
        label: f,
        type: "yes_no",
        showIf: showIfYes(SCOLARITE_IDS.ebepPrevious),
      }),
    ),
    {
      id: SCOLARITE_IDS.ebepCurrent,
      label: "Un accompagnement est-il en cours au sein de notre établissement ?",
      type: "yes_no",
    },
    ...EBEP_FLAGS_LIST.map(
      (f): ScolariteFieldSpec => ({
        id: ebepCurId(f),
        label: f,
        type: "yes_no",
        showIf: showIfYes(SCOLARITE_IDS.ebepCurrent),
      }),
    ),
    ...BILAN_FLAGS_LIST.map(
      (f): ScolariteFieldSpec => ({
        id: bilanId(f),
        label: `Bilan ${f} réalisé`,
        type: "yes_no",
      }),
    ),
    {
      id: SCOLARITE_IDS.dispenseLibanais,
      label: "Demande de dispense des examens libanais",
      type: "select",
      options: DISPENSE_OPTS,
      showIf: SHOW_IF_NOT_FIRST_YEAR,
    },
    // ── Wishlist extras ──
    {
      id: SCOLARITE_IDS.entryDate,
      label: "Date d'entrée souhaitée",
      type: "date",    },
    { id: SCOLARITE_IDS.section, label: "Section", type: "short_text" },
    // ── Pédagogique — CE2 → 3ème ──
    {
      id: SCOLARITE_IDS.arabe,
      label: "Arabe",
      type: "select",      options: ARABE_OPTS,
      showIf: showIfGroup("ce2_3eme"),
    },
    // ── Pédagogique — 2nde ──
    {
      id: SCOLARITE_IDS.s2_lva,
      label: "LVA",
      type: "select",      options: lvOpts(LVA_OPTIONS),
      showIf: showIfGroup("seconde"),
    },
    {
      id: SCOLARITE_IDS.s2_lvb,
      label: "LVB",
      type: "select",      options: lvOpts(LVB_OPTIONS_2NDE),
      showIf: showIfGroup("seconde"),
    },
    {
      id: SCOLARITE_IDS.s2_lvc,
      label: "LVC (options)",
      type: "multi_select",
      options: lvOpts(LVC_OPTIONS),
      showIf: showIfGroup("seconde"),
    },
    {
      id: SCOLARITE_IDS.s2_arts,
      label: "Arts plastiques",
      type: "yes_no",
      showIf: showIfGroup("seconde"),
    },
    {
      id: SCOLARITE_IDS.s2_siCit,
      label: "Sciences de l'Ingénieur (CIT)",
      type: "yes_no",
      showIf: showIfGroup("seconde"),
    },
    {
      id: SCOLARITE_IDS.s2_si,
      label: "Section internationale (BFI)",
      type: "yes_no",
      showIf: showIfGroup("seconde"),
    },
    // ── Pédagogique — 1ère ──
    {
      id: SCOLARITE_IDS.p1_spec,
      label: "Spécialités (choisir 3)",
      type: "multi_select",      options: [...SPECIALITES],
      showIf: showIfGroup("premiere"),
    },
    {
      id: SCOLARITE_IDS.p1_lva,
      label: "LVA",
      type: "select",      options: lvOpts(LVA_OPTIONS),
      showIf: showIfGroup("premiere"),
    },
    {
      id: SCOLARITE_IDS.p1_lvb,
      label: "LVB",
      type: "select",      options: lvOpts(LVB_OPTIONS_LYCEE),
      showIf: showIfGroup("premiere"),
    },
    {
      id: SCOLARITE_IDS.p1_lvc,
      label: "LVC (options)",
      type: "multi_select",
      options: lvOpts(LVC_OPTIONS),
      showIf: showIfGroup("premiere"),
    },
    {
      id: SCOLARITE_IDS.p1_arts,
      label: "Arts plastiques",
      type: "yes_no",
      showIf: showIfGroup("premiere"),
    },
    {
      id: SCOLARITE_IDS.p1_bfi,
      label: "Section internationale (BFI)",
      type: "yes_no",
      showIf: showIfGroup("premiere"),
    },
    {
      id: SCOLARITE_IDS.p1_compLib,
      label: "Complément libanais (Physique)",
      type: "yes_no",
      showIf: showIfGroup("premiere"),
    },
    // ── Pédagogique — Tle ──
    {
      id: SCOLARITE_IDS.t_spec,
      label: "Spécialités (choisir 2)",
      type: "multi_select",      options: [...SPECIALITES],
      showIf: showIfGroup("terminale"),
    },
    {
      id: SCOLARITE_IDS.t_lva,
      label: "LVA",
      type: "select",      options: lvOpts(LVA_OPTIONS),
      showIf: showIfGroup("terminale"),
    },
    {
      id: SCOLARITE_IDS.t_lvb,
      label: "LVB",
      type: "select",      options: lvOpts(LVB_OPTIONS_LYCEE),
      showIf: showIfGroup("terminale"),
    },
    {
      id: SCOLARITE_IDS.t_lvc,
      label: "LVC (options)",
      type: "multi_select",
      options: lvOpts(LVC_OPTIONS),
      showIf: showIfGroup("terminale"),
    },
    {
      id: SCOLARITE_IDS.t_arts,
      label: "Arts plastiques",
      type: "yes_no",
      showIf: showIfGroup("terminale"),
    },
    {
      id: SCOLARITE_IDS.t_maths,
      label: "Mathématiques (option)",
      type: "select",
      options: [
        "none|Aucune",
        "complementaire|Mathématiques complémentaires",
        "expertes|Mathématiques expertes",
      ],
      showIf: showIfGroup("terminale"),
    },
    {
      id: SCOLARITE_IDS.t_compLib,
      label: "Complément libanais (Physique / SVT)",
      type: "yes_no",
      showIf: showIfGroup("terminale"),
    },
  ];
  return specs;
}

// ── Synthetic gating answers ────────────────────────────────────────────────

/** Recompute the (non-persisted) gating answers from the selected niveau. */
export function scolariteGatingAnswers(
  niveau: string | null | undefined,
): Record<string, string> {
  return {
    [NIVEAU_GROUP_FIELD]: classifyNiveau(niveau) ?? "",
    [FIRST_YEAR_FIELD]: isFirstYearNiveau(niveau) ? "yes" : "no",
  };
}

// ── Nested → flat (load) ────────────────────────────────────────────────────

function jsonArray(arr: string[]): string {
  return JSON.stringify(arr ?? []);
}

/** Canonical nested data → flat config answers for FieldsRenderer. */
export function scolariteAnswers(
  data: ScolariteData,
  peda: PedagogiqueData,
): Record<string, string> {
  const yn = (b: boolean | null) =>
    b === true ? "yes" : b === false ? "no" : "";
  const flag = (b: boolean) => (b ? "yes" : "no");

  const out: Record<string, string> = {
    [SCOLARITE_IDS.previousSchool]: data.previousSchool,
    [SCOLARITE_IDS.previousClass]: data.previousClass,
    [SCOLARITE_IDS.previousNetwork]: data.previousNetwork,
    [SCOLARITE_IDS.attendedMlfBefore]: yn(data.attendedMlfBefore),
    [SCOLARITE_IDS.history]: JSON.stringify(data.history ?? []),
    [SCOLARITE_IDS.ebepPrevious]: yn(data.ebepPrevious),
    [SCOLARITE_IDS.ebepCurrent]: yn(data.ebepCurrent),
    [SCOLARITE_IDS.dispenseLibanais]: data.dispenseLibanais ?? "",
    [SCOLARITE_IDS.entryDate]: data.entryDate,
    [SCOLARITE_IDS.section]: data.section,
    // ce2_3eme
    [SCOLARITE_IDS.arabe]: peda.ce2_3eme.arabe,
    // seconde
    [SCOLARITE_IDS.s2_lva]: peda.seconde.lva,
    [SCOLARITE_IDS.s2_lvb]: peda.seconde.lvb,
    [SCOLARITE_IDS.s2_lvc]: jsonArray(peda.seconde.lvc),
    [SCOLARITE_IDS.s2_arts]: flag(peda.seconde.artsPlastiques),
    [SCOLARITE_IDS.s2_siCit]: flag(peda.seconde.siCit),
    [SCOLARITE_IDS.s2_si]: flag(peda.seconde.sectionInternationale),
    // premiere
    [SCOLARITE_IDS.p1_spec]: jsonArray(peda.premiere.specialites),
    [SCOLARITE_IDS.p1_lva]: peda.premiere.lva,
    [SCOLARITE_IDS.p1_lvb]: peda.premiere.lvb,
    [SCOLARITE_IDS.p1_lvc]: jsonArray(peda.premiere.lvc),
    [SCOLARITE_IDS.p1_arts]: flag(peda.premiere.artsPlastiques),
    [SCOLARITE_IDS.p1_bfi]: flag(peda.premiere.bfi),
    [SCOLARITE_IDS.p1_compLib]: flag(peda.premiere.complementLibanaisPhysique),
    // terminale
    [SCOLARITE_IDS.t_spec]: jsonArray(peda.terminale.specialites),
    [SCOLARITE_IDS.t_lva]: peda.terminale.lva,
    [SCOLARITE_IDS.t_lvb]: peda.terminale.lvb,
    [SCOLARITE_IDS.t_lvc]: jsonArray(peda.terminale.lvc),
    [SCOLARITE_IDS.t_arts]: flag(peda.terminale.artsPlastiques),
    // 3-state maths select: expertes wins, else complémentaire, else none.
    [SCOLARITE_IDS.t_maths]: peda.terminale.mathsExpertes
      ? "expertes"
      : peda.terminale.mathsComplementaire
        ? "complementaire"
        : "none",
    [SCOLARITE_IDS.t_compLib]: flag(
      peda.terminale.complementLibanaisPhysiqueSvt,
    ),
  };
  for (const f of EBEP_FLAGS_LIST) {
    out[ebepPrevId(f)] = flag(data.ebepPreviousFlags[f]);
    out[ebepCurId(f)] = flag(data.ebepCurrentFlags[f]);
  }
  for (const f of BILAN_FLAGS_LIST) {
    out[bilanId(f)] = flag(data.bilansRealises[f]);
  }
  return out;
}

// ── Flat → nested (save) ────────────────────────────────────────────────────

function parseJsonStringArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a)
      ? a.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function parseHistory(
  raw: string | undefined,
): Array<{ year: string; className: string; school: string }> {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    return a
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const r = row as Record<string, unknown>;
        return { year: s(r.year), className: s(r.className), school: s(r.school) };
      });
  } catch {
    return [];
  }
}

/** Flat config answers → canonical nested data (ScolariteData + PedagogiqueData). */
export function scolariteFromAnswers(answers: Record<string, string>): {
  scolarite: ScolariteData;
  pedagogique: PedagogiqueData;
} {
  const raw = (id: string) => answers[id] ?? "";
  const yn = (id: string): boolean | null => {
    const v = raw(id);
    return v === "yes" ? true : v === "no" ? false : null;
  };
  const flag = (id: string) => raw(id) === "yes";

  const scolarite = defaultScolarite();
  scolarite.previousSchool = raw(SCOLARITE_IDS.previousSchool);
  scolarite.previousClass = raw(SCOLARITE_IDS.previousClass);
  scolarite.previousNetwork = raw(SCOLARITE_IDS.previousNetwork);
  scolarite.attendedMlfBefore = yn(SCOLARITE_IDS.attendedMlfBefore);
  scolarite.history = parseHistory(answers[SCOLARITE_IDS.history]);
  scolarite.ebepPrevious = yn(SCOLARITE_IDS.ebepPrevious);
  scolarite.ebepCurrent = yn(SCOLARITE_IDS.ebepCurrent);
  scolarite.entryDate = raw(SCOLARITE_IDS.entryDate);
  scolarite.section = raw(SCOLARITE_IDS.section);
  const disp = raw(SCOLARITE_IDS.dispenseLibanais);
  scolarite.dispenseLibanais = disp === "oui" || disp === "non" ? disp : null;
  for (const f of EBEP_FLAGS_LIST) {
    scolarite.ebepPreviousFlags[f] = flag(ebepPrevId(f));
    scolarite.ebepCurrentFlags[f] = flag(ebepCurId(f));
  }
  for (const f of BILAN_FLAGS_LIST) {
    scolarite.bilansRealises[f] = flag(bilanId(f));
  }

  const peda = defaultPedagogique();
  const ar = raw(SCOLARITE_IDS.arabe);
  peda.ce2_3eme.arabe = ar === "ALE" || ar === "ALM" ? ar : "";
  peda.seconde = {
    lva: raw(SCOLARITE_IDS.s2_lva),
    lvb: raw(SCOLARITE_IDS.s2_lvb),
    lvc: parseJsonStringArray(answers[SCOLARITE_IDS.s2_lvc]),
    artsPlastiques: flag(SCOLARITE_IDS.s2_arts),
    siCit: flag(SCOLARITE_IDS.s2_siCit),
    sectionInternationale: flag(SCOLARITE_IDS.s2_si),
  };
  peda.premiere = {
    specialites: parseJsonStringArray(answers[SCOLARITE_IDS.p1_spec]),
    lva: raw(SCOLARITE_IDS.p1_lva),
    lvb: raw(SCOLARITE_IDS.p1_lvb),
    lvc: parseJsonStringArray(answers[SCOLARITE_IDS.p1_lvc]),
    artsPlastiques: flag(SCOLARITE_IDS.p1_arts),
    bfi: flag(SCOLARITE_IDS.p1_bfi),
    complementLibanaisPhysique: flag(SCOLARITE_IDS.p1_compLib),
  };
  peda.terminale = {
    specialites: parseJsonStringArray(answers[SCOLARITE_IDS.t_spec]),
    lva: raw(SCOLARITE_IDS.t_lva),
    lvb: raw(SCOLARITE_IDS.t_lvb),
    lvc: parseJsonStringArray(answers[SCOLARITE_IDS.t_lvc]),
    artsPlastiques: flag(SCOLARITE_IDS.t_arts),
    mathsComplementaire: raw(SCOLARITE_IDS.t_maths) === "complementaire",
    mathsExpertes: raw(SCOLARITE_IDS.t_maths) === "expertes",
    complementLibanaisPhysiqueSvt: flag(SCOLARITE_IDS.t_compLib),
  };

  return { scolarite, pedagogique: peda };
}
