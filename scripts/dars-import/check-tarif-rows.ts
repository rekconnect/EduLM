/**
 * Read-only: verify the tariff-on-one-row rule in rptTrsEleveActiviteTarif —
 * for students with MULTIPLE rows (AS + RS, different buses), the montant
 * should appear on exactly ONE row (the other(s) at 0). Flags any student
 * with amounts on 2+ rows (would be double-counted by the SUM) and shows the
 * distribution.
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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  type Row = { type: string; car: string; montant: number; net: number };
  const byCode = new Map<string, { name: string; rows: Row[] }>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = cellText(ws, r, 2).trim().toUpperCase();
    const nom = cellText(ws, r, 4).trim();
    if (!code || !nom) continue;
    const cur = byCode.get(code) ?? { name: `${nom} ${cellText(ws, r, 5).trim()}`, rows: [] };
    cur.rows.push({
      type: cellText(ws, r, 15).trim().toUpperCase(),
      car: cellText(ws, r, 14).trim(),
      montant: Number(cellText(ws, r, 22).trim()) || 0,
      net: Number(cellText(ws, r, 25).trim()) || 0,
    });
    byCode.set(code, cur);
  }

  let single = 0;
  let multi = 0;
  let multiOnePaid = 0;
  let multiAllZero = 0;
  const anomalies: string[] = [];
  for (const s of byCode.values()) {
    if (s.rows.length === 1) {
      single++;
      continue;
    }
    multi++;
    const paidRows = s.rows.filter((r) => r.montant > 0);
    if (paidRows.length <= 1) {
      if (paidRows.length === 1) multiOnePaid++;
      else multiAllZero++;
      continue;
    }
    anomalies.push(
      `${s.name}: ${s.rows.map((r) => `${r.type} bus ${r.car} = ${r.montant}$ (net ${r.net})`).join(" | ")}`,
    );
  }
  console.log(`Élèves à 1 ligne: ${single} · à 2+ lignes: ${multi}`);
  console.log(`  2+ lignes avec tarif sur UNE seule ligne: ${multiOnePaid} ✓`);
  console.log(`  2+ lignes toutes à 0$: ${multiAllZero}`);
  console.log(`\n⚠ ANOMALIES — montant sur PLUSIEURS lignes (risque de double comptage): ${anomalies.length}`);
  for (const a of anomalies) console.log(`   • ${a}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
