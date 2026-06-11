/**
 * Read-only COMPARISON: the authoritative rptTrsEleveActiviteTarif.xlsx (one
 * row per student×direction: Code · Car · Type AS/RS/AR · Zone n° · Quartier-
 * Station · Montant/Fixe/Pourc/Net) vs EduLM bus_periods["2025-2026|T3"].
 * Matching primarily by student Code ↔ customAnswers.dars_student_code,
 * fallback spelling-tolerant name+classe. WRITES NOTHING.
 *   --file="C:\Users\raede\Downloads\rptTrsEleveActiviteTarif.xlsx"
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { coreTokens, normFirst, normClass } from "./lib/match-services.js";

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

type XDir = { car: string; zone: string; quartier: string; heure: string };
type X = {
  code: string;
  nom: string;
  prenom: string;
  classe: string;
  matin?: XDir;
  soir?: XDir;
  montant: number;
  net: number;
  pourc: number;
  telPere: string;
  telMere: string;
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // ── Parse the export (one row per direction; aggregate per student code) ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  const byCode = new Map<string, X>();
  let rowCount = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = cellText(ws, r, 2).trim().toUpperCase();
    const nom = cellText(ws, r, 4).trim();
    if (!code || !nom) continue;
    rowCount++;
    const type = cellText(ws, r, 15).trim().toUpperCase();
    const dir: XDir = {
      car: cellText(ws, r, 14).trim(),
      zone: cellText(ws, r, 18).trim(),
      quartier: cellText(ws, r, 19).trim(),
      heure: cellText(ws, r, 16).trim(),
    };
    const cur: X =
      byCode.get(code) ??
      ({
        code,
        nom,
        prenom: cellText(ws, r, 5).trim(),
        classe: cellText(ws, r, 10).trim() + " " + cellText(ws, r, 11).trim(),
        montant: 0,
        net: 0,
        pourc: 0,
        telPere: cellText(ws, r, 12).trim(),
        telMere: cellText(ws, r, 13).trim(),
      } as X);
    if (type === "AS" || type === "AR") cur.matin = dir;
    if (type === "RS" || type === "AR") cur.soir = dir;
    cur.montant += Number(cellText(ws, r, 22).trim()) || 0;
    cur.net += Number(cellText(ws, r, 25).trim()) || 0;
    cur.pourc = Math.max(cur.pourc, Number(cellText(ws, r, 24).trim()) || 0);
    byCode.set(code, cur);
  }
  console.log(`Fichier: ${rowCount} lignes → ${byCode.size} élèves uniques`);

  // ── EduLM students ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: "2025-2026" } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        where: { academicYear: { label: "2025-2026" } },
        select: { class: { select: { name: true } } },
        take: 1,
      },
    },
  });
  const byDarsCode = new Map<string, (typeof students)[number]>();
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const c = String(ca.dars_student_code ?? "").trim().toUpperCase();
    if (c) byDarsCode.set(c, s);
  }
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName).map(squash)),
    first: squash(normFirst(st.firstName)),
    cls: normClass(st.enrollments[0]?.class.name ?? ""),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
  function matchByName(nom: string, prenom: string, classe: string) {
    const lastT = new Set(coreTokens(nom).map(squash));
    const firstN = squash(normFirst(prenom));
    const cls = normClass(classe);
    let best: (typeof prepared)[number] | null = null;
    let tie = false;
    let bestScore = -1;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => lastT.has(t)).length;
      const lastOkFlag = inter > 0 && (inter === p.last.size || inter === lastT.size);
      if (!lastOkFlag) continue;
      if (!firstOk(p.first, firstN)) continue;
      const classOk = cls !== "" && p.cls === cls;
      const score = inter * 2 + (classOk ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
        tie = false;
      } else if (score === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  let byCodeHits = 0;
  let byNameHits = 0;
  const unmatched: string[] = [];
  const fileById = new Map<string, X>();
  for (const x of byCode.values()) {
    let target = byDarsCode.get(x.code) ?? null;
    if (target) byCodeHits++;
    else {
      target = matchByName(x.nom, x.prenom, x.classe);
      if (target) byNameHits++;
    }
    if (!target) {
      unmatched.push(`${x.nom} ${x.prenom} (${x.classe}, code ${x.code})`);
      continue;
    }
    fileById.set(target.id, x);
  }
  console.log(`Appariement: par CODE ${byCodeHits} · par nom ${byNameHits} · NON TROUVÉS ${unmatched.length}`);
  for (const u of unmatched) console.log(`   ✗ ${u}`);

  // ── Current EduLM state ──
  type Cur = { as: boolean; rs: boolean; cm: string; cs: string; montant: string; paye: string };
  const current = new Map<string, Cur>();
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    try {
      const p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
      if (p && (p.as === "yes" || p.rs === "yes"))
        current.set(s.id, {
          as: p.as === "yes",
          rs: p.rs === "yes",
          cm: (p.car_matin ?? "").trim(),
          cs: (p.car_soir ?? "").trim(),
          montant: p.montant ?? "",
          paye: p.paye ?? "",
        });
    } catch {
      /* ignore */
    }
  }

  // ── Diff ──
  const nameOf = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));
  let identical = 0;
  const trajetChanges: string[] = [];
  const busChanges: string[] = [];
  const restored: string[] = [];
  const amountChanges: string[] = [];
  for (const [id, x] of fileById) {
    const nAs = !!x.matin;
    const nRs = !!x.soir;
    const nCm = x.matin?.car ?? "";
    const nCs = x.soir?.car ?? "";
    const cur = current.get(id);
    const lbl = `[${nAs ? "AS " + nCm : ""}${nAs && nRs ? " + " : ""}${nRs ? "RS " + nCs : ""}] net ${x.net}$${x.pourc ? ` (remise ${x.pourc}%)` : ""}`;
    if (!cur) {
      restored.push(`${nameOf.get(id)} → ${lbl}`);
      continue;
    }
    const trajetSame = cur.as === nAs && cur.rs === nRs;
    const busSame = cur.cm === nCm && cur.cs === nCs;
    const amountSame = String(x.net) === cur.montant;
    if (trajetSame && busSame && amountSame) {
      identical++;
      continue;
    }
    const label = `${nameOf.get(id)}: [${cur.as ? "AS " + (cur.cm || "?") : ""}${cur.as && cur.rs ? " + " : ""}${cur.rs ? "RS " + (cur.cs || "?") : ""}] (${cur.montant || "0"}$) → ${lbl}`;
    if (!trajetSame) trajetChanges.push(label);
    else if (!busSame) busChanges.push(label);
    else amountChanges.push(label);
  }
  const absent: string[] = [];
  for (const [id, cur] of current)
    if (!fileById.has(id))
      absent.push(`${nameOf.get(id)} [${cur.as ? "AS " + (cur.cm || "?") : ""}${cur.as && cur.rs ? "+" : ""}${cur.rs ? "RS " + (cur.cs || "?") : ""}]`);

  console.log(`\n=== DIFF vs EduLM (${PERIOD}) ===`);
  console.log(`identiques (trajet+bus+net): ${identical}`);
  console.log(`\nTRAJET différent: ${trajetChanges.length}`);
  for (const c of trajetChanges.slice(0, 25)) console.log(`   • ${c}`);
  if (trajetChanges.length > 25) console.log(`   … +${trajetChanges.length - 25}`);
  console.log(`\nBUS différent: ${busChanges.length}`);
  for (const c of busChanges.slice(0, 25)) console.log(`   • ${c}`);
  if (busChanges.length > 25) console.log(`   … +${busChanges.length - 25}`);
  console.log(`\nMONTANT seul différent: ${amountChanges.length}`);
  for (const c of amountChanges.slice(0, 15)) console.log(`   • ${c}`);
  if (amountChanges.length > 15) console.log(`   … +${amountChanges.length - 15}`);
  console.log(`\nÀ (RE)CRÉER — dans le fichier, sans affectation EduLM (inclut les 30 retirés): ${restored.length}`);
  for (const c of restored) console.log(`   • ${c}`);
  console.log(`\nABSENTS du fichier (affectés dans EduLM): ${absent.length}`);
  for (const c of absent) console.log(`   • ${c}`);

  // ── Projected stats ──
  const xs = [...fileById.values()];
  const pAs = xs.filter((x) => x.matin).length;
  const pRs = xs.filter((x) => x.soir).length;
  const both = xs.filter((x) => x.matin && x.soir);
  const sameBus = both.filter((x) => x.matin!.car === x.soir!.car).length;
  const totalNet = xs.reduce((a, x) => a + x.net, 0);
  const totalMontant = xs.reduce((a, x) => a + x.montant, 0);
  const withDiscount = xs.filter((x) => x.pourc > 0).length;
  const zones = new Set(xs.flatMap((x) => [x.matin?.zone, x.soir?.zone].filter(Boolean)));
  console.log(`\n=== Stats si ce fichier est appliqué ===`);
  console.log(
    `Inscrits=${fileById.size}  Aller=${pAs}  Retour=${pRs}  AR=${both.length} (même bus=${sameBus}, 2 bus=${both.length - sameBus})`,
  );
  console.log(`Montant brut=$${totalMontant.toLocaleString("en-US")} · NET=$${totalNet.toLocaleString("en-US")} · remises: ${withDiscount} élèves`);
  console.log(`Zones numérotées: ${[...zones].sort((a, b) => Number(a) - Number(b)).join(", ")}`);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
