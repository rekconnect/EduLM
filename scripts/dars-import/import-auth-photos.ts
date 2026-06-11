/**
 * Apply the photo-authorizations Excel ("Bilan Autorisation Photos" — the
 * EXCEPTIONS list, maintained by the school): students listed get the OUI/NON
 * values of the file; EVERY OTHER active-year student gets OUI × 4 (per Raed:
 * the file holds "who has auth other than oui oui oui oui").
 *
 * Writes registration_by_year["2025-2026"].auth_* (the year the fiche shows)
 * AND the single-value auth_* consents (used as fallback for other years).
 * Re-runnable. DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-auth-photos.ts --tenant-name="Lycée Montaigne" \
 *     --file="C:\...\auto photos MAJ 25 sept 2025.xlsx" [--confirm]
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { coreTokens, normFirst } from "./lib/match-services.js";

const prisma = new PrismaClient();
const YEAR = "2025-2026";
const CONFIRM = process.argv.includes("--confirm");
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
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const squash = (t: string) =>
  t
    .replace(/y/g, "i")
    .replace(/sh/g, "ch")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/eh$/g, "e")
    .replace(/(.)\1+/g, "$1");
const yn = (v: string) => (/^oui/i.test(v.trim()) ? "yes" : "no");
const AUTH_KEYS = ["auth_site", "auth_livre", "auth_reseaux", "auth_radio"] as const;

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const file = arg("file");

  // ── Parse exceptions ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  type XRow = { name: string; classe: string; vals: Record<string, string> };
  const xrows: XRow[] = [];
  for (const ws of wb.worksheets) {
    // header row: contains "Nom Complet"
    let headerRow = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 6); r++)
      if (/nom complet/i.test(cellText(ws, r, 1))) {
        headerRow = r;
        break;
      }
    if (!headerRow) continue;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const name = cellText(ws, r, 1).trim();
      if (!name) continue;
      xrows.push({
        name,
        classe: cellText(ws, r, 2).trim(),
        vals: {
          auth_site: yn(cellText(ws, r, 3)),
          auth_livre: yn(cellText(ws, r, 4)),
          auth_reseaux: yn(cellText(ws, r, 5)),
          auth_radio: yn(cellText(ws, r, 6)),
        },
      });
    }
  }
  console.log(`Exceptions dans le fichier: ${xrows.length}`);

  // ── Students + matcher ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: YEAR } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        where: { academicYear: { label: YEAR } },
        select: { class: { select: { level: true } } },
        take: 1,
      },
    },
  });
  const normLevel = (s: string) => deburr(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName).map(squash)),
    first: squash(normFirst(st.firstName)),
    level: normLevel(st.enrollments[0]?.class.level ?? ""),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
  function match(name: string, classe: string) {
    const tokens = new Set(coreTokens(name).map(squash));
    const lvl = normLevel(classe).replace(/[abcd]$/, "");
    let best: (typeof prepared)[number] | null = null;
    let tie = false;
    let bestScore = -1;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => tokens.has(t)).length;
      if (inter !== p.last.size) continue;
      const rest = [...tokens].filter((t) => !p.last.has(t));
      if (!rest.some((t) => firstOk(p.first, t))) continue;
      const levelOk = lvl !== "" && p.level === lvl;
      const score = inter * 2 + (levelOk ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
        tie = false;
      } else if (score === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  const exceptions = new Map<string, Record<string, string>>();
  const unmatched: string[] = [];
  for (const r of xrows) {
    const t = match(r.name, r.classe);
    if (!t) {
      unmatched.push(`${r.name} (${r.classe}) → ${Object.values(r.vals).join("/")}`);
      continue;
    }
    exceptions.set(t.id, r.vals);
  }
  console.log(`Appariées: ${exceptions.size} · NON TROUVÉES: ${unmatched.length}`);
  for (const u of unmatched) console.log(`   ✗ ${u}`);

  // ── Build updates: exceptions → file values; everyone else → yes×4 ──
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  let exceptionApplied = 0;
  let allYes = 0;
  for (const s of students) {
    const target = exceptions.get(s.id) ?? {
      auth_site: "yes",
      auth_livre: "yes",
      auth_reseaux: "yes",
      auth_radio: "yes",
    };
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    let reg: Record<string, Record<string, string>> = {};
    if (typeof ca.registration_by_year === "string") {
      try {
        reg = JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>;
      } catch {
        reg = {};
      }
    }
    const yearEntry = { ...(reg[YEAR] ?? {}) };
    let changed = false;
    for (const k of AUTH_KEYS) {
      if (yearEntry[k] !== target[k]) {
        yearEntry[k] = target[k]!;
        changed = true;
      }
      if (ca[k] !== target[k]) {
        ca[k] = target[k];
        changed = true;
      }
    }
    if (!changed) continue;
    reg[YEAR] = yearEntry;
    ca.registration_by_year = JSON.stringify(reg);
    if (exceptions.has(s.id)) exceptionApplied++;
    else allYes++;
    updates.push({
      id: s.id,
      ca,
      label: `${s.lastName} ${s.firstName}: ${AUTH_KEYS.map((k) => target[k] === "yes" ? "O" : "N").join("")}`,
    });
  }

  console.log(`\nÀ mettre à jour: ${updates.length} élèves (exceptions: ${exceptionApplied}, passage à OUI×4: ${allYes})`);
  for (const u of updates.filter((u) => /N/.test(u.label.split(": ")[1] ?? "")).slice(0, 50))
    console.log(`   • ${u.label}`);

  if (!CONFIRM) {
    console.log("\n🟡 DRY-RUN — relancez avec --confirm pour écrire.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) =>
            prisma.student.update({
              where: { id: u.id },
              data: { customAnswers: u.ca as Prisma.InputJsonValue },
            }),
          ),
        );
        done += chunk.length;
        break;
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    if (done % 200 < 5) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`✓ Autorisations photos appliquées: ${done} élèves.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
