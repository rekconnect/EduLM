/**
 * Read-only: are the 30 students we removed ("pas de bus" + paiement effacé)
 * present in the FRESH Dars liste export (Downloads)? For each: their rows
 * (Type AS/RS, Bus N°) in the new file. Also diffs old vs new liste files.
 *   --new="...Downloads\TrsRptListeEleveAutocarParClasse.xlsx"
 *   --old="...Desktop\TrsRptListeEleveAutocarParClasse.xlsx"
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
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const squash = (t: string) =>
  t.replace(/y/g, "i").replace(/sh/g, "ch").replace(/ph/g, "f").replace(/th/g, "t").replace(/eh$/g, "e").replace(/(.)\1+/g, "$1");
const tokens = (s: string) =>
  new Set(
    deburr(s)
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !["el", "al", "le", "la", "les"].includes(t))
      .map(squash),
  );

type Row = { name: string; classe: string; bus: string; type: string };
async function readListe(path: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0]!;
  let headerRow = 0;
  for (let r = 1; r <= 12; r++)
    if (cellText(ws, r, 1).trim().startsWith("Nom d")) {
      headerRow = r;
      break;
    }
  const rows: Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const name = cellText(ws, r, 1).trim();
    if (!name || name.startsWith("Nom d")) continue;
    rows.push({
      name,
      classe: cellText(ws, r, 3).trim(),
      bus: cellText(ws, r, 4).trim(),
      type: cellText(ws, r, 5).trim().toUpperCase(),
    });
  }
  return rows;
}

// The 30 removed students (EduLM "Last First" labels).
const REMOVED = [
  "Jabbour Michael", "Baaklini Elie", "Bou Dib Kyle", "Jabbour Marc",
  "Khoury Ayla", "Nassif Joseph", "Nemer Théa", "Jamati Alexandre Mattéo",
  "Kamal Alex", "Kahi Karl", "Challita Thalia", "Jabbour Maelle",
  "Roukoz Jad", "Gebrael Eden Noel Margaux", "Khoury Karen", "Iskandar Peter",
  "Labaky Maroun", "Kassis Matteo", "Estephan Lucas", "Aouad Naya",
  "Raad Jackie Marie", "Khoury Alexandre", "Iskandar Rafael", "Estephan Luciana",
  "Baaklini Marc", "Baaklini Charbel", "Hatem Louie Dowan", "Daoud Léa",
  "Aouad Rayan", "Manoukian Tara",
];

async function main() {
  const newRows = await readListe(arg("new"));
  const oldRows = await readListe(arg("old"));
  console.log(`Nouveau fichier: ${newRows.length} lignes · Ancien: ${oldRows.length} lignes`);

  // Old vs new row-level diff (key: name|classe|type).
  const key = (r: Row) => `${[...tokens(r.name)].sort().join(" ")}|${r.classe}|${r.type}`;
  const oldKeys = new Set(oldRows.map(key));
  const newKeys = new Set(newRows.map(key));
  const added = newRows.filter((r) => !oldKeys.has(key(r)));
  const gone = oldRows.filter((r) => !newKeys.has(key(r)));
  console.log(`\nLignes NOUVELLES vs ancien fichier: ${added.length}`);
  for (const r of added.slice(0, 20)) console.log(`   + ${r.name} (${r.classe}) ${r.type} bus ${r.bus}`);
  console.log(`Lignes DISPARUES vs ancien fichier: ${gone.length}`);
  for (const r of gone.slice(0, 20)) console.log(`   - ${r.name} (${r.classe}) ${r.type} bus ${r.bus}`);

  // Are the 30 in the NEW file?
  console.log(`\n=== Les 30 retirés — présence dans le NOUVEAU fichier ===`);
  let found = 0;
  for (const label of REMOVED) {
    const lt = tokens(label);
    const hits = newRows.filter((r) => {
      const rt = tokens(r.name);
      return (
        [...lt].every((t) => rt.has(t)) ||
        (rt.size > 0 && [...lt].filter((t) => rt.has(t)).length >= Math.min(lt.size, 2))
      );
    });
    const strong = newRows.filter((r) => {
      const rt = tokens(r.name);
      return [...lt].every((t) => rt.has(t));
    });
    const show = strong.length ? strong : hits;
    if (show.length) {
      found++;
      console.log(`   ✓ ${label}: ${show.map((r) => `${r.type} bus ${r.bus} (${r.classe})`).join(" · ")}`);
    } else {
      console.log(`   ✗ ${label}: ABSENT du nouveau fichier`);
    }
  }
  console.log(`\n→ ${found}/30 présents dans le nouveau fichier`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
