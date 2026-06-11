/** Read-only: columns 14-25 of the ActiviteTarif export (zones, tarifs…). */
import ExcelJS from "exceljs";
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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/raede/Downloads/rptTrsEleveActiviteTarif.xlsx");
  const ws = wb.worksheets[0]!;
  for (const r of [1, 2, 3, 6, 8, 9, 10, 650, 655]) {
    const cells: string[] = [];
    for (let c = 14; c <= 25; c++) cells.push(`[${c}]${cellText(ws, r, c).trim()}`);
    console.log(`R${r}: ${cells.join(" | ")}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
