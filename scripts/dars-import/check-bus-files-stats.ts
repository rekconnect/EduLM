/**
 * Read-only: per-FILE stats of the two Dars transport exports (no DB) —
 * unique students, AS/RS totals, montant sum — to localize the gap vs the
 * Dars dashboard (507 / 373 / 477 / $155,960).
 */
import ExcelJS from "exceljs";

const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};
const cellText = (ws: ExcelJS.Worksheet, r: number, c: number): string => {
  const v = ws.getRow(r).getCell(c).value as unknown;
  if (v && typeof v === "object") {
    const o = v as { text?: string; richText?: Array<{ text: string }>; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
  }
  return v == null ? "" : String(v);
};

async function main() {
  // ── STATION ──
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(arg("station"));
    const students = new Map<
      string,
      { as: boolean; rs: boolean; montant: number; paye: number; montantMax: number; payeMax: number }
    >();
    for (const ws of wb.worksheets) {
      let headerRow = 0;
      const cols: Record<string, number> = {};
      for (let r = 1; r <= Math.min(ws.rowCount, 12) && !headerRow; r++) {
        const rowTexts: string[] = [];
        for (let c = 1; c <= Math.min(ws.columnCount, 18); c++) rowTexts.push(cellText(ws, r, c).trim());
        if (rowTexts.includes("Trajet") && rowTexts.some((x) => x === "Famille")) {
          headerRow = r;
          for (let c = 1; c <= rowTexts.length; c++) {
            const label = rowTexts[c - 1]!;
            if (label && cols[label] == null) cols[label] = c;
          }
        }
      }
      if (!headerRow) continue;
      const col = (l: string) => cols[l] ?? 0;
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const fam = cellText(ws, r, col("Famille")).trim();
        const pre = cellText(ws, r, col("Prénom")).trim();
        if (!fam && !pre) continue;
        const key = (cellText(ws, r, col("Code")).trim() + "|" + fam + "|" + pre).toLowerCase();
        const t = cellText(ws, r, col("Trajet")).trim().toUpperCase();
        const cur =
          students.get(key) ??
          { as: false, rs: false, montant: 0, paye: 0, montantMax: 0, payeMax: 0 };
        if (t === "AS" || t === "AR") cur.as = true;
        if (t === "RS" || t === "AR") cur.rs = true;
        const m = Number(cellText(ws, r, col("Montant")).trim()) || 0;
        const p = Number(cellText(ws, r, col("Payé")).trim()) || 0;
        cur.montant += m;
        cur.paye += p;
        cur.montantMax = Math.max(cur.montantMax, m);
        cur.payeMax = Math.max(cur.payeMax, p);
        students.set(key, cur);
      }
    }
    const vals = [...students.values()];
    console.log("STATION file:");
    console.log(`  unique students: ${vals.length}`);
    console.log(`  AS total=${vals.filter((v) => v.as).length}  RS total=${vals.filter((v) => v.rs).length}  AR=${vals.filter((v) => v.as && v.rs).length}`);
    console.log(`  montant SUM=$${vals.reduce((a, v) => a + v.montant, 0).toLocaleString("en-US")}  MAX=$${vals.reduce((a, v) => a + v.montantMax, 0).toLocaleString("en-US")}`);
    console.log(`  payé   SUM=$${vals.reduce((a, v) => a + v.paye, 0).toLocaleString("en-US")}  MAX=$${vals.reduce((a, v) => a + v.payeMax, 0).toLocaleString("en-US")}`);
  }

  // ── LISTE ──
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(arg("liste"));
    const ws = wb.worksheets[0]!;
    let headerRow = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r++)
      if (cellText(ws, r, 1).trim().startsWith("Nom d")) {
        headerRow = r;
        break;
      }
    const students = new Map<string, { as: boolean; rs: boolean }>();
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const name = cellText(ws, r, 1).trim();
      if (!name || name.startsWith("Nom d")) continue;
      const classe = cellText(ws, r, 3).trim();
      const t = cellText(ws, r, 5).trim().toUpperCase();
      const key = (name + "|" + classe).toLowerCase();
      const cur = students.get(key) ?? { as: false, rs: false };
      if (t === "AS" || t === "AR") cur.as = true;
      if (t === "RS" || t === "AR") cur.rs = true;
      students.set(key, cur);
    }
    const vals = [...students.values()];
    console.log("\nLISTE file:");
    console.log(`  unique students: ${vals.length}`);
    console.log(`  AS total=${vals.filter((v) => v.as).length}  RS total=${vals.filter((v) => v.rs).length}  AR=${vals.filter((v) => v.as && v.rs).length}`);
  }
  console.log(`\nDars dashboard:  inscrits=507  aller=373  retour=477  montant=$155,960`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
