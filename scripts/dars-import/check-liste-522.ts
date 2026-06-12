/**
 * Read-only: compare the Dars liste export (TrsRptListeEleveAutocarParClasse)
 * with EduLM's assigned students for 2025-2026|T3 — explain 522 vs 507.
 *   --file="...xlsx" --tenant-name="Lycée Montaigne"
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

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
const tkey = (s: string) => [...tokens(s)].sort().join(" ");

type FRow = { name: string; classe: string; bus: string; type: string };

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  let headerRow = 0;
  for (let r = 1; r <= 12; r++)
    if (cellText(ws, r, 1).trim().startsWith("Nom d")) {
      headerRow = r;
      break;
    }
  const rows: FRow[] = [];
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
  // Distinct students in the file (name+classe).
  const fileStudents = new Map<string, { name: string; classe: string; rows: FRow[] }>();
  for (const r of rows) {
    const k = `${tkey(r.name)}|${r.classe.toLowerCase()}`;
    const e = fileStudents.get(k) ?? { name: r.name, classe: r.classe, rows: [] };
    e.rows.push(r);
    fileStudents.set(k, e);
  }
  console.log(`Fichier: ${rows.length} lignes · ${fileStudents.size} élèves distincts`);
  const types = { AS: 0, RS: 0, AR: 0 };
  for (const e of fileStudents.values())
    for (const r of e.rows) if (r.type in types) types[r.type as keyof typeof types]++;
  console.log(`Lignes par type: AS ${types.AS} · RS ${types.RS} · AR ${types.AR}`);

  // EduLM assigned.
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  type Edu = { name: string; as: boolean; rs: boolean; net: string; montant: string };
  const eduAssigned: Edu[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { /* ignore */ }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    eduAssigned.push({
      name: `${s.lastName} ${s.firstName}`,
      as: p.as === "yes",
      rs: p.rs === "yes",
      net: (p.net ?? "").trim(),
      montant: (p.montant ?? "").trim(),
    });
  }
  console.log(`EduLM affectés (${PERIOD}): ${eduAssigned.length}`);

  // Match EduLM → file by name tokens (subset match, either direction).
  const fileByName: Array<{ toks: Set<string>; e: { name: string; classe: string; rows: FRow[] }; used: boolean }> =
    [...fileStudents.values()].map((e) => ({ toks: tokens(e.name), e, used: false }));
  const matchOne = (name: string) => {
    const lt = tokens(name);
    let best: (typeof fileByName)[number] | undefined;
    let bestScore = 0;
    for (const f of fileByName) {
      const inter = [...lt].filter((t) => f.toks.has(t)).length;
      const subset = inter === lt.size || inter === f.toks.size;
      const score = subset ? inter * 2 : inter;
      if (inter >= 2 && score > bestScore) {
        best = f;
        bestScore = score;
      }
    }
    return bestScore >= 4 || (best && (bestScore >= 3 || tokens(name).size <= 2)) ? best : undefined;
  };

  const notInFile: Edu[] = [];
  for (const e of eduAssigned) {
    const m = matchOne(e.name);
    if (m) m.used = true;
    else notInFile.push(e);
  }
  console.log(`\n— Affectés EduLM ABSENTS du fichier (${notInFile.length}) —`);
  for (const e of notInFile) {
    console.log(`  ${e.name} — ${e.as ? "AS" : ""}${e.rs ? " RS" : ""} — net "${e.net}" montant "${e.montant}"`);
  }

  const unused = fileByName.filter((f) => !f.used);
  console.log(`\n— Élèves du fichier NON appariés dans EduLM (${unused.length}) —`);
  for (const f of unused) {
    console.log(`  ${f.e.name} (${f.e.classe}) — ${f.e.rows.map((r) => `${r.type} bus ${r.bus}`).join(" · ")}`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
