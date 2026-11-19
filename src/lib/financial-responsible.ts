/**
 * The "responsable financier" of a dossier: the parent who pays, as DECLARED
 * by the family on the registration form. For the school this is the parent
 * who carries the family code (the accounting unit) — shown on the school's
 * screens as the child's "parent principal".
 *
 * Storage: `ApplicationResponsable.financiallyResponsible`, set on at most one
 * responsable row of a dossier and null on the others. The value is that row's
 * own kind in the column's documented vocabulary (pere / mere / autre);
 * readers only test "is it set".
 *
 * Only an explicit choice is ever stored. When the family says nothing the
 * column stays empty and the school applies its usual rule (the father for a
 * new child, the child's current parent principal on a re-inscription): a
 * default is never written as if it had been declared.
 */

export type ResponsableKind = "PERE" | "MERE" | "TUTEUR" | "AUTRE";

/** What to store on the row declared as the financially responsible parent. */
export function financialValueFor(kind: ResponsableKind): "pere" | "mere" | "autre" {
  return kind === "PERE" ? "pere" : kind === "MERE" ? "mere" : "autre";
}
