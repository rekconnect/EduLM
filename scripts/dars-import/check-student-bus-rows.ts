/** Read-only: list EVERY row for one student across all car sheets of the
 *  station export (+ the liste file) — verifies multi-car (matin/soir) cases.
 *    npx tsx ... --station="..." --liste="..." --name="ABOU RAHAL"
 */
import ExcelJS from "exceljs";

const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};
const cellText = (ws: ExcelJS.Worksheet, r: number, c: number): string => {
  const v = ws.getRow(r).getCell(c).value as unknown;
  if (v && typeof v === "object") {
    const o = v as { text?: string; richText?: Array<{ text: string }> };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
  }
  return v == null ? "" : String(v);
};

async function main() {
  const needle = (arg("name") || "ABOU RAHAL").toLowerCase();

  const stationPath = arg("station");
  if (stationPath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(stationPath);
    console.log("=== STATION file rows ===");
    for (const ws of wb.worksheets) {
      let car = "";
      for (let r = 1; r <= Math.min(ws.rowCount, 12); r++)
        for (let c = 1; c <= Math.min(ws.columnCount, 18); c++) {
          const m = /Car\s*N°\s*(\d+)/i.exec(cellText(ws, r, c));
          if (m && !car) car = m[1]!;
        }
      for (let r = 1; r <= ws.rowCount; r++) {
        const rowTxt: string[] = [];
        for (let c = 1; c <= Math.min(ws.columnCount, 16); c++) rowTxt.push(cellText(ws, r, c).trim());
        if (rowTxt.join(" ").toLowerCase().includes(needle))
          console.log(`  [Car ${car}] ${ws.name} R${r}: ${rowTxt.filter(Boolean).join(" | ")}`);
      }
    }
  }

  const listePath = arg("liste");
  if (listePath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(listePath);
    console.log("\n=== LISTE file rows ===");
    for (const ws of wb.worksheets) {
      for (let r = 1; r <= ws.rowCount; r++) {
        const rowTxt: string[] = [];
        for (let c = 1; c <= Math.min(ws.columnCount, 7); c++) rowTxt.push(cellText(ws, r, c).trim());
        if (rowTxt.join(" ").toLowerCase().includes(needle))
          console.log(`  R${r}: ${rowTxt.filter(Boolean).join(" | ")}`);
      }
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
