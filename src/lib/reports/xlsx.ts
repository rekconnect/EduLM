import ExcelJS from "exceljs";
import type { ResolvedReport } from "./registry";

const BRAND = "FF2C7DB3"; // EduLM sky-blue (--color-brand-500 light)
const SUBTLE = "FF64748B";

/**
 * Build a styled .xlsx for a resolved report. Layout:
 *   row 1 → report title (bold)
 *   row 2 → filter summary + generation date (subtle)
 *   row 3 → column headers (brand fill, white bold, autofilter, frozen)
 *   row 4+ → data
 */
export async function buildWorkbook(opts: {
  title: string;
  subtitle: string;
  generatedOn: string;
  report: ResolvedReport;
}): Promise<ArrayBuffer> {
  const { title, subtitle, generatedOn, report } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "EduLM";

  const ws = wb.addWorksheet("Rapport", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  const n = report.columns.length;

  // Column widths + keys (no auto-header — we write our own at row 3).
  ws.columns = report.columns.map((c) => ({
    key: c.key,
    width: c.width ?? 18,
  }));

  // Title.
  ws.mergeCells(1, 1, 1, n);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };

  // Subtitle.
  ws.mergeCells(2, 1, 2, n);
  const subCell = ws.getCell(2, 1);
  subCell.value = `${subtitle} — généré le ${generatedOn}`;
  subCell.font = { size: 10, color: { argb: SUBTLE } };

  // Header row (row 3).
  const headerRow = ws.getRow(3);
  report.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFB9C8DA" } },
    };
  });
  headerRow.height = 18;

  // Data rows.
  for (const r of report.rows) {
    ws.addRow(r);
  }

  // Autofilter across the header row.
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: n },
  };

  const buf = await wb.xlsx.writeBuffer();
  // Copy into a standalone ArrayBuffer — an unambiguous BodyInit for Response
  // (avoids the Uint8Array<ArrayBufferLike> generic mismatch).
  const src = new Uint8Array(buf as ArrayBuffer);
  const out = new ArrayBuffer(src.byteLength);
  new Uint8Array(out).set(src);
  return out;
}
