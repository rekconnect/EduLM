/**
 * Canonical school-level ordering — the single source of truth for sorting
 * class levels across the app (cantine, transport, infirmerie, classes).
 *
 * Class levels are free-text and arrive in two spellings: the Dars import
 * writes "2nde" / "1ère" / "Terminale", while some seeds use "Seconde" /
 * "Première". Each list page used to keep its own LEVEL_ORDER copy and they
 * DISAGREED — so /classes (which spelled the lycée levels "Seconde"/"Première")
 * dropped the real Dars "2nde"/"1ère" values into the unknown bucket and
 * mis-sorted them. Normalizing both spellings here fixes that.
 */

const LEVEL_ORDER = [
  "TPS",
  "PS",
  "MS",
  "GS",
  "CP",
  "CE1",
  "CE2",
  "CM1",
  "CM2",
  "6ème",
  "5ème",
  "4ème",
  "3ème",
  "2nde",
  "1ère",
  "Terminale",
];

/** Alternate spellings → the canonical LEVEL_ORDER entry. */
const LEVEL_ALIASES: Record<string, string> = {
  Seconde: "2nde",
  Première: "1ère",
  Premiere: "1ère",
  Tle: "Terminale",
  Term: "Terminale",
};

function canonicalLevel(level: string): string {
  const t = level.trim();
  return LEVEL_ALIASES[t] ?? t;
}

/**
 * Sort index for a level string. Accepts either spelling; unknown levels sort
 * last (returns LEVEL_ORDER.length so they land after every known level).
 */
export function lvlIdx(level: string): number {
  const i = LEVEL_ORDER.indexOf(canonicalLevel(level));
  return i < 0 ? LEVEL_ORDER.length : i;
}

/**
 * The level a student advances to on a year rollover. Returns `null` when the
 * student graduates / has no next level — i.e. Terminale (the last level) or an
 * unrecognised level string. Accepts either spelling.
 */
export function nextLevel(level: string): string | null {
  const i = LEVEL_ORDER.indexOf(canonicalLevel(level));
  if (i < 0 || i >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[i + 1]!;
}

/** Dedupe + sort level strings into canonical order (unknowns last, then alpha). */
export function sortLevels(levels: string[]): string[] {
  return [...new Set(levels)].sort((a, b) => {
    const d = lvlIdx(a) - lvlIdx(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}
