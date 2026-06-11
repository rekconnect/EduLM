/**
 * Read-only: (1) scan the tarif export for Activité/circuit section markers
 * ("0 - Ordinaire" … "24 - Ordinaire"); (2) list the Dars circuit/activity
 * tables (Fct_Activite*, Trs_*) to see the full circuit list including any
 * non-Ordinaire (activity-return) circuits.
 */
import ExcelJS from "exceljs";
import { darsQuery, closeDars } from "./lib/dars-pool.js";

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
  // 1. Scan the tarif file for activité markers anywhere.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/raede/Downloads/rptTrsEleveActiviteTarif.xlsx");
  const ws = wb.worksheets[0]!;
  console.log(`Tarif file: ${ws.rowCount} rows × ${ws.columnCount} cols`);
  let markers = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
      const t = cellText(ws, r, c);
      if (/ordinaire|activit/i.test(t)) {
        markers++;
        if (markers <= 10) console.log(`  R${r}C${c}: "${t.trim().slice(0, 60)}"`);
      }
    }
  }
  console.log(`Marqueurs "Activité/Ordinaire" dans le fichier: ${markers}`);

  // 2. Dars circuit tables.
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (LOWER(TABLE_NAME) LIKE '%activit%' OR TABLE_NAME LIKE 'Trs[_]%')
     ORDER BY TABLE_NAME`,
  );
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`).catch(() => [{ n: -1 }]);
    console.log(`\n=== ${t.TABLE_NAME} (rows=${n[0]?.n}) ===`);
    if ((n[0]?.n ?? 0) > 0 && (n[0]?.n ?? 0) <= 80) {
      const cols = await darsQuery<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION`,
      );
      console.log("   cols: " + cols.map((c) => c.COLUMN_NAME).join(", "));
      const rows = await darsQuery<Record<string, unknown>>(`SELECT * FROM [${t.TABLE_NAME}]`).catch(() => []);
      for (const r of rows.slice(0, 40)) console.log("   ", JSON.stringify(r).slice(0, 180));
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
