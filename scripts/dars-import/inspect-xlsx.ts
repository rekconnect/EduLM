/**
 * Read-only: dump the structure of one or more .xlsx files — sheet names,
 * dimensions, the header row and the first few data rows — so we can see how
 * students are identified before building any sync.
 *   npx tsx scripts/dars-import/inspect-xlsx.ts "C:\path\a.xlsx" "C:\path\b.xlsx"
 */
import ExcelJS from "exceljs";

async function inspect(path: string) {
  console.log(`\n\n########## ${path}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  wb.eachSheet((ws) => {
    console.log(`\n=== Sheet: "${ws.name}"  (rows=${ws.rowCount}, cols=${ws.columnCount}) ===`);
    const maxRows = Math.min(ws.rowCount, 8);
    for (let r = 1; r <= maxRows; r++) {
      const row = ws.getRow(r);
      const vals: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 15); c++) {
        const cell = row.getCell(c);
        let v: unknown = cell.value;
        if (v && typeof v === "object") {
          const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
          if (o.richText) v = o.richText.map((t) => t.text).join("");
          else if (o.text != null) v = o.text;
          else if (o.result != null) v = o.result;
          else v = JSON.stringify(v);
        }
        vals.push(v == null ? "" : String(v).slice(0, 22));
      }
      console.log(`  R${r}: ${vals.map((x, i) => `[${i + 1}]${x}`).join(" | ")}`);
    }
  });
}

async function main() {
  const files = process.argv.slice(2).filter((a) => a.toLowerCase().endsWith(".xlsx"));
  if (files.length === 0) {
    console.error("Pass one or more .xlsx paths.");
    process.exit(1);
  }
  for (const f of files) {
    try {
      await inspect(f);
    } catch (e) {
      console.error(`\n!! Could not read ${f}:`, (e as Error).message);
    }
  }
}
main();
