/**
 * Read-only: where do the "Aller-Retour" students come from?
 *  - station file: rows whose Trajet column literally says AR (same-car AR),
 *    vs students that become AR by combining an AS row + an RS row (two cars).
 *  - liste file: same breakdown (single AR row vs AS+RS row pairs).
 * The user says true AR should be ~201 max.
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
    type S = { arRows: number; asRows: number; rsRows: number; cars: Set<string> };
    const students = new Map<string, S>();
    let totalRows = 0;
    const trajetCensus = new Map<string, number>();
    for (const ws of wb.worksheets) {
      let car = "";
      let headerRow = 0;
      const cols: Record<string, number> = {};
      for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
        for (let c = 1; c <= Math.min(ws.columnCount, 18); c++) {
          const m = /Car\s*N°\s*(\d+)/i.exec(cellText(ws, r, c));
          if (m && !car) car = m[1]!;
        }
        const rowTexts: string[] = [];
        for (let c = 1; c <= Math.min(ws.columnCount, 18); c++) rowTexts.push(cellText(ws, r, c).trim());
        if (!headerRow && rowTexts.includes("Trajet") && rowTexts.some((x) => x === "Famille")) {
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
        totalRows++;
        const key = (cellText(ws, r, col("Code")).trim() + "|" + fam + "|" + pre).toLowerCase();
        const t = cellText(ws, r, col("Trajet")).trim().toUpperCase();
        trajetCensus.set(t, (trajetCensus.get(t) ?? 0) + 1);
        const cur = students.get(key) ?? { arRows: 0, asRows: 0, rsRows: 0, cars: new Set<string>() };
        if (t === "AR") cur.arRows++;
        else if (t === "AS") cur.asRows++;
        else if (t === "RS") cur.rsRows++;
        cur.cars.add(car);
        students.set(key, cur);
      }
    }
    const vals = [...students.values()];
    const sameCarAR = vals.filter((v) => v.arRows > 0).length;
    const crossAR = vals.filter((v) => v.arRows === 0 && v.asRows > 0 && v.rsRows > 0).length;
    console.log("STATION file:");
    console.log(`  data rows: ${totalRows} · unique students: ${vals.length}`);
    console.log(`  Trajet census:`, Object.fromEntries(trajetCensus));
    console.log(`  students with an explicit AR row (same-car AR): ${sameCarAR}`);
    console.log(`  students AR via AS row + RS row (different rows): ${crossAR}`);
    console.log(`  → total AR as imported: ${sameCarAR + crossAR}`);
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
    type S = { ar: number; as: number; rs: number };
    const students = new Map<string, S>();
    const census = new Map<string, number>();
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const name = cellText(ws, r, 1).trim();
      if (!name || name.startsWith("Nom d")) continue;
      const classe = cellText(ws, r, 3).trim();
      const t = cellText(ws, r, 5).trim().toUpperCase();
      census.set(t, (census.get(t) ?? 0) + 1);
      const key = (name + "|" + classe).toLowerCase();
      const cur = students.get(key) ?? { ar: 0, as: 0, rs: 0 };
      if (t === "AR") cur.ar++;
      else if (t === "AS") cur.as++;
      else if (t === "RS") cur.rs++;
      students.set(key, cur);
    }
    const vals = [...students.values()];
    console.log("\nLISTE file:");
    console.log(`  Type census:`, Object.fromEntries(census));
    console.log(`  students with explicit AR row: ${vals.filter((v) => v.ar > 0).length}`);
    console.log(`  students AR via AS+RS rows: ${vals.filter((v) => v.ar === 0 && v.as > 0 && v.rs > 0).length}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
