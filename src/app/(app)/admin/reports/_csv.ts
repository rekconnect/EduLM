// ── CSV builder ────────────────────────────────────────────────
// Pure helper — lives outside _actions.ts because a "use server" module may
// only export async server actions (production builds enforce it).

/** Minimal RFC 4180 CSV. Wraps fields containing commas, quotes, or
 * newlines in double-quotes; doubles internal quotes. */
export function csv<T extends Record<string, unknown>>(
  rows: T[],
  columns: ReadonlyArray<{ key: keyof T; header: string }>,
): string {
  const escape = (v: unknown): string => {
    let s = v == null ? "" : String(v);
    // Formula-injection guard: many columns are parent-controlled dossier
    // answers (child name, nationality, …). A value starting with = + - @
    // (or tab/CR) is evaluated as a formula by Excel/LibreOffice, so prefix a
    // single quote to force it to be treated as text. (OWASP CSV injection.)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push(columns.map((c) => escape(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(","));
  }
  // BOM so Excel opens UTF-8 cleanly.
  return "﻿" + lines.join("\r\n");
}
