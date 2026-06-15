/**
 * Map a student's guardian (père / mère / tuteur) to the parent inscription
 * fields — keyed by parent entity-field id, so the renewal's two-parent
 * editor prefills from each guardian's own stored data. Shared by the
 * renewal server action (creates ApplicationResponsable rows) and the dossier
 * edit page (synthesizes prefilled rows on load when none exist yet).
 */

export type GuardianForPrefill = {
  relation: string | null;
  nationality1?: string | null;
  nationality2?: string | null;
  user: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    email: string;
    customAnswers: unknown;
  };
};

export function relKindOf(relation: string | null): "PERE" | "MERE" | "TUTEUR" | "AUTRE" {
  const m: Record<string, "PERE" | "MERE" | "TUTEUR" | "AUTRE"> = {
    pere: "PERE",
    "père": "PERE",
    mere: "MERE",
    "mère": "MERE",
    tuteur: "TUTEUR",
    parent: "AUTRE",
  };
  return m[(relation ?? "").toLowerCase()] ?? "AUTRE";
}

/** Parent entity-field answers for one guardian (ids match the keys). */
export function guardianToParentAnswers(g: GuardianForPrefill): Record<string, string> {
  const u = g.user;
  const pca = (u.customAnswers ?? {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(pca)) {
    if (k === "authorized_persons") continue; // JSON blob, not a form field
    if (typeof v === "string" && v.trim()) answers[k] = v;
  }
  // Name from columns, splitting a legacy single `name` when needed.
  let fn = u.firstName ?? "";
  let ln = u.lastName ?? "";
  if (!fn && !ln && u.name) {
    const parts = u.name.trim().split(/\s+/);
    ln = parts.length > 1 ? (parts[parts.length - 1] ?? "") : (parts[0] ?? "");
    fn = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  }
  if (fn) answers.prenom = answers.prenom || fn;
  if (ln) answers.nom = answers.nom || ln;
  const realEmail = u.email && !/@import\./i.test(u.email) ? u.email : "";
  if (realEmail) answers.email = answers.email || realEmail;
  // Nationalité lives on the Guardian columns, not in customAnswers.
  if (g.nationality1) answers.nationalite1 = answers.nationalite1 || g.nationality1;
  if (g.nationality2) answers.nationalite2 = answers.nationalite2 || g.nationality2;
  return answers;
}
