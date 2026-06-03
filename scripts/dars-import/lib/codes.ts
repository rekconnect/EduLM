/**
 * Loads Isc_Codes into memory once and exposes resolvers.
 * Codes are keyed by numeric `ID` and grouped by `CodeType`.
 *   - NAT  Nationalité
 *   - SIT  Situation Famille  (drives monoParental)
 *   - TIT  Titre  (unused in practice — all '--')
 *   - REL  Religion
 *   - PRO/PRO2  Occupation
 */
import { darsQuery, DARS_COLLEGE_ID } from "./dars-pool.js";

type CodeRow = {
  ID: number;
  CodeType: string;
  Code: string;
  CodeValue: string | null;
  CodeValueEn: string | null;
};

export class CodesTable {
  private byId = new Map<number, CodeRow>();
  /** NAT code id for "Libanaise" — resolved at load time. */
  lebaneseNatId: number | null = null;
  /** SIT code ids that imply a single-parent household. */
  monoParentalSitIds = new Set<number>();

  static async load(): Promise<CodesTable> {
    const rows = await darsQuery<CodeRow>(
      `SELECT ID, CodeType, Code, CodeValue, CodeValueEn
       FROM Isc_Codes WHERE Id_College = ${DARS_COLLEGE_ID}`,
    );
    const t = new CodesTable();
    for (const r of rows) {
      t.byId.set(Number(r.ID), { ...r, ID: Number(r.ID) });
      // Lebanese nationality
      if (
        r.CodeType === "NAT" &&
        (/(liban)/i.test(r.CodeValue ?? "") || /(lebanese)/i.test(r.CodeValueEn ?? ""))
      ) {
        t.lebaneseNatId = Number(r.ID);
      }
      // Single-parent family situations: Parent célibataire (C),
      // Mère décédée (DEC_M), Père décédé (DEC_P). Divorced/separated
      // are NOT treated as monoparental (both parents typically active).
      if (r.CodeType === "SIT" && ["C", "DEC_M", "DEC_P"].includes(r.Code)) {
        t.monoParentalSitIds.add(Number(r.ID));
      }
    }
    return t;
  }

  /** French label for a code id, or "" if unknown / placeholder. */
  label(id: number | null | undefined): string {
    if (id == null) return "";
    const row = this.byId.get(Number(id));
    if (!row) return "";
    const v = (row.CodeValue ?? "").trim();
    return v === "--" ? "" : v;
  }

  isLebanese(...natIds: Array<number | null | undefined>): boolean {
    if (this.lebaneseNatId == null) return false;
    return natIds.some((id) => id != null && Number(id) === this.lebaneseNatId);
  }

  isMonoParental(sitId: number | null | undefined): boolean {
    return sitId != null && this.monoParentalSitIds.has(Number(sitId));
  }
}
