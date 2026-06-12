/** Read-only: raw tarif-file rows (circuit, type, montant, remise, net) for
 *  the students with suspect bus numbers. */
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
const WANT = [
  "bou akl", "akl jason", "jabbour ivy", "abi rizk nathan", "baaklini",
  "chedid cherif", "fayad chlo", "haddad kiyan", "haddad sofia", "hakim",
  "khoury el raphael", "sacy",
];
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  console.log("code | nom | prénom | circuit(14) | type(15) | zone(18) | quartier(19) | montant(22) | pourc(24) | net(25)");
  for (let r = 2; r <= ws.rowCount; r++) {
    const nom = cellText(ws, r, 4).trim();
    const prenom = cellText(ws, r, 5).trim();
    const full = deburr(`${nom} ${prenom}`);
    if (!WANT.some((w) => full.includes(w))) continue;
    console.log(
      [2, 4, 5, 14, 15, 18, 19, 22, 24, 25].map((c) => cellText(ws, r, c).trim().slice(0, 40) || "·").join(" | "),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
