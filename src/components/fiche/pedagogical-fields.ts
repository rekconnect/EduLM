/**
 * Level-dependent "Renseignements pédagogiques" field definitions. Plain
 * module (NO "use client") so the server page can call fieldsForLevel() to
 * decide whether to show the tab, while the client editor imports the same
 * definitions. Keys are the shared contract the inscription form fills.
 */

export type PField =
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "yesno" }
  | { key: string; label: string; type: "multi"; options: string[]; pick?: number };

const SPECIALITES = [
  "LLCE anglais",
  "Physique-Chimie",
  "SVT",
  "Maths",
  "SES",
  "HGGSP",
  "HLP",
];
const LVA: PField = { key: "lva", label: "LVA", type: "select", options: ["Arabe", "Anglais"] };
const LVB: PField = { key: "lvb", label: "LVB", type: "select", options: ["Arabe", "Anglais", "Espagnol"] };
const LVC: PField = { key: "lvc", label: "LVC (option)", type: "select", options: ["Arabe", "Espagnol"] };
const ARTS: PField = { key: "opt_arts_plastiques", label: "Arts plastiques", type: "yesno" };
const BFI: PField = { key: "opt_bfi", label: "BFI", type: "yesno" };

// Levels for the Arabic-track choice (CE2 à la 3ème).
const ARABIC_TRACK = new Set(["CE2", "CM1", "CM2", "6ème", "5ème", "4ème", "3ème"]);

export function fieldsForLevel(level: string): PField[] {
  if (ARABIC_TRACK.has(level))
    return [
      {
        key: "arabe_langue",
        label: "Arabe",
        type: "select",
        options: ["Langue maternelle", "Langue étrangère"],
      },
    ];
  if (level === "2nde")
    return [
      LVA,
      LVB,
      LVC,
      ARTS,
      { key: "opt_section_internationale", label: "Section internationale (SI)", type: "yesno" },
    ];
  if (level === "1ère")
    return [
      { key: "specialites", label: "Spécialités (3)", type: "multi", options: SPECIALITES, pick: 3 },
      LVA,
      LVB,
      LVC,
      ARTS,
      BFI,
      { key: "comp_libanais_physique", label: "Complément libanais – Physique", type: "yesno" },
    ];
  if (level === "Terminale" || level === "Tle")
    return [
      { key: "specialites", label: "Spécialités (2)", type: "multi", options: SPECIALITES, pick: 2 },
      LVA,
      LVB,
      LVC,
      ARTS,
      BFI,
      { key: "maths_complementaire", label: "Maths complémentaire", type: "yesno" },
      { key: "maths_expertes", label: "Maths expertes", type: "yesno" },
      { key: "comp_libanais_physique_svt", label: "Complément libanais – Physique + SVT", type: "yesno" },
    ];
  return [];
}
