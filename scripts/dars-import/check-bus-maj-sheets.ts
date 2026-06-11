/** Read-only: exact sheet names of BUS MAJ + first rows of duplicate/odd sheets. */
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
  await wb.xlsx.readFile("C:/Users/raede/Code/EduLM/tmp-bus-maj.xlsx");
  console.log("=== Sheet names (exact) ===");
  for (const ws of wb.worksheets) console.log(`${JSON.stringify(ws.name)} rows=${ws.rowCount}`);

  // Dump first 8 rows of the SECOND sheet whose name starts with "Bus 5",
  // plus any sheet containing weekday legs (e.g. where col4 == "Lundi").
  const bus5s = wb.worksheets.filter((w) => /^Bus\s*5\b/i.test(w.name.trim()));
  for (const ws of bus5s) {
    console.log(`\n=== "${ws.name}" first rows ===`);
    for (let r = 1; r <= Math.min(ws.rowCount, 8); r++) {
      const cells: string[] = [];
      for (let c = 1; c <= 6; c++) cells.push(cellText(ws, r, c).trim());
      console.log(`  R${r}: ${cells.join(" | ")}`);
    }
  }
  for (const ws of wb.worksheets) {
    let hasWeekday = false;
    for (let r = 1; r <= Math.min(ws.rowCount, 40) && !hasWeekday; r++)
      if (/^(lundi|mardi|mercredi|jeudi|vendredi)$/i.test(cellText(ws, r, 4).trim())) hasWeekday = true;
    if (hasWeekday) {
      console.log(`\n=== weekday sheet "${ws.name}" first rows ===`);
      for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
        const cells: string[] = [];
        for (let c = 1; c <= 6; c++) cells.push(cellText(ws, r, c).trim());
        console.log(`  R${r}: ${cells.join(" | ")}`);
      }
      break;
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
