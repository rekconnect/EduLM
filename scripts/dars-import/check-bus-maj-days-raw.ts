/** Read-only: dump EVERY row of the BUS MAJ workbook that mentions a weekday
 *  in ANY of the first 8 columns — no other filters. Find the full 45. */
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
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  let count = 0;
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= ws.rowCount; r++) {
      const cells = Array.from({ length: 8 }, (_, i) => cellText(ws, r, i + 1).trim());
      const hasDay = cells.some((c) => /lundi|mardi|mercredi|jeudi|vendredi/i.test(deburr(c)));
      if (!hasDay) continue;
      count++;
      console.log(`[${ws.name}] r${r}: ${cells.map((c) => c || "·").join(" | ")}`);
    }
  }
  console.log(`\nTotal lignes avec un jour: ${count}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
