/**
 * Per-child registration code, Dars-style.
 *
 * Each child's code is its family code with a 1-based index appended:
 * family "476" → kids "4761", "4762", "4763". This mirrors how Dars numbers
 * siblings, and matches the codes already imported into
 * `Student.customAnswers.dars_student_code`.
 *
 * We keep storing it under the same `dars_student_code` key so imported and
 * EduLM-native students are read the same way everywhere.
 */

export const KID_CODE_KEY = "dars_student_code";

/** Read a student's code from its customAnswers blob (null if unset). */
export function readKidCode(customAnswers: unknown): string | null {
  if (customAnswers && typeof customAnswers === "object") {
    const v = (customAnswers as Record<string, unknown>)[KID_CODE_KEY];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Build a child code from its family code and 1-based index. */
export function buildKidCode(familyCode: string, index: number): string {
  return `${familyCode}${index}`;
}

/**
 * Next free 1-based child index for a family: one past the highest suffix
 * already in use by its siblings (so codes never collide even if a sibling was
 * removed, and imported non-contiguous sequences are respected).
 */
export function nextKidIndex(
  familyCode: string,
  siblings: ReadonlyArray<{ customAnswers: unknown }>,
): number {
  let max = 0;
  for (const s of siblings) {
    const code = readKidCode(s.customAnswers);
    if (code && code.startsWith(familyCode)) {
      const suffix = Number(code.slice(familyCode.length));
      if (Number.isInteger(suffix) && suffix > max) max = suffix;
    }
  }
  return max + 1;
}

/** Merge a code into a customAnswers blob without dropping other keys. */
export function withKidCode(
  customAnswers: unknown,
  code: string,
): Record<string, unknown> {
  const base =
    customAnswers && typeof customAnswers === "object"
      ? { ...(customAnswers as Record<string, unknown>) }
      : {};
  base[KID_CODE_KEY] = code;
  return base;
}
