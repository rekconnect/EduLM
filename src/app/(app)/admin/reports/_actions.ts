"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

/**
 * Reports query helpers — each one returns a typed row array that
 * matches the table preview AND the CSV export. The CSV builder
 * (csv() at the bottom) is intentionally tiny — no dependency on
 * papaparse, just RFC 4180-flavoured escaping.
 */

export type CycleOption = { id: string; label: string; targetYearLabel: string };

export async function listCyclesForReports(): Promise<CycleOption[]> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return [];
  return runWithTenant({ tenantId: user.tenantId, slug: null }, () =>
    db.admissionCycle.findMany({
      orderBy: { openAt: "desc" },
      select: { id: true, label: true, targetYearLabel: true },
    }),
  );
}

// ── Transport + Restauration ───────────────────────────────────

export type TransportRow = {
  applicationId: string;
  childName: string;
  niveau: string;
  establishment: string;
  modeAller: string;
  modeRetour: string;
  collation: string;
  cantine: string;
  altAddress: string;
};

export async function transportReport(
  cycleId: string | null,
): Promise<TransportRow[]> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return [];
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const apps = await db.application.findMany({
      where: {
        deletedAt: null,
        archived: false,
        ...(cycleId ? { cycleId } : {}),
      },
      orderBy: [{ childLastName: "asc" }, { childFirstName: "asc" }],
      select: {
        id: true,
        childFirstName: true,
        childLastName: true,
        niveau: true,
        establishment: { select: { name: true } },
        dossierAnswers: true,
      },
    });
    return apps.map((a): TransportRow => {
      const tr =
        a.dossierAnswers && typeof a.dossierAnswers === "object"
          ? (
              (a.dossierAnswers as Record<string, unknown>).transport as
                | Record<string, unknown>
                | undefined
            )
          : undefined;
      const bool = (v: unknown) => (v === true ? "Oui" : v === false ? "Non" : "—");
      return {
        applicationId: a.id,
        childName: `${a.childLastName} ${a.childFirstName}`.trim(),
        niveau: a.niveau ?? "",
        establishment: a.establishment?.name ?? "",
        modeAller: (tr?.modeAller as string) || "",
        modeRetour: (tr?.modeRetour as string) || "",
        collation: bool(tr?.collation),
        cantine: bool(tr?.cantine),
        altAddress: tr?.hasAlternateAddress === true ? "Oui" : "—",
      };
    });
  });
}

// ── Finance ────────────────────────────────────────────────────

export type FinanceRow = {
  applicationId: string;
  childName: string;
  niveau: string;
  ackInterieur: string;
  ackFinancier: string;
  ackMlf: string;
  comite: string;
  caisseLbp: string;
  caisseUsd: string;
};

export async function financeReport(
  cycleId: string | null,
): Promise<FinanceRow[]> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return [];
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const apps = await db.application.findMany({
      where: {
        deletedAt: null,
        archived: false,
        ...(cycleId ? { cycleId } : {}),
      },
      orderBy: [{ childLastName: "asc" }, { childFirstName: "asc" }],
      select: {
        id: true,
        childFirstName: true,
        childLastName: true,
        niveau: true,
        dossierAnswers: true,
      },
    });
    return apps.map((a): FinanceRow => {
      const fin =
        a.dossierAnswers && typeof a.dossierAnswers === "object"
          ? (
              (a.dossierAnswers as Record<string, unknown>).finance as
                | Record<string, unknown>
                | undefined
            )
          : undefined;
      const bool = (v: unknown) => (v === true ? "Oui" : v === false ? "Non" : "—");
      const fmtCaisse = (raw: unknown): string => {
        if (typeof raw !== "string" || raw === "") return "—";
        if (raw === "none") return "Opt-out";
        if (raw === "autre") return "Autre";
        return Number(raw).toLocaleString("fr-FR");
      };
      return {
        applicationId: a.id,
        childName: `${a.childLastName} ${a.childFirstName}`.trim(),
        niveau: a.niveau ?? "",
        ackInterieur: bool(fin?.acknowledgedReglementInterieur),
        ackFinancier: bool(fin?.acknowledgedReglementFinancier),
        ackMlf: bool(fin?.acknowledgedDroitsEntreeMlf),
        comite: bool(fin?.comiteParents),
        caisseLbp: fmtCaisse(fin?.caisseLbp),
        caisseUsd: fmtCaisse(fin?.caisseUsd),
      };
    });
  });
}

// ── Pédagogie (langues + spécialités) ──────────────────────────

export type PedagogiqueRow = {
  applicationId: string;
  childName: string;
  niveau: string;
  arabe: string;
  lva: string;
  lvb: string;
  lvc: string;
  specialites: string;
  bfi: string;
};

export async function pedagogiqueReport(
  cycleId: string | null,
): Promise<PedagogiqueRow[]> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return [];
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const apps = await db.application.findMany({
      where: {
        deletedAt: null,
        archived: false,
        ...(cycleId ? { cycleId } : {}),
      },
      orderBy: [{ childLastName: "asc" }, { childFirstName: "asc" }],
      select: {
        id: true,
        childFirstName: true,
        childLastName: true,
        niveau: true,
        dossierAnswers: true,
      },
    });
    return apps.map((a): PedagogiqueRow => {
      const ped =
        a.dossierAnswers && typeof a.dossierAnswers === "object"
          ? (
              (a.dossierAnswers as Record<string, unknown>).pedagogique as
                | Record<string, unknown>
                | undefined
            )
          : undefined;
      const n = (a.niveau ?? "").toLowerCase();
      // Pick the niveau-relevant slice.
      let group: Record<string, unknown> | undefined;
      if (["2nde", "seconde"].includes(n)) group = ped?.seconde as Record<string, unknown> | undefined;
      else if (["1ère", "1ere", "premiere"].includes(n)) group = ped?.premiere as Record<string, unknown> | undefined;
      else if (["tle", "terminale", "terminale"].includes(n)) group = ped?.terminale as Record<string, unknown> | undefined;
      else if (
        ["ce2", "cm1", "cm2", "6e", "6ème", "5e", "5ème", "4e", "4ème", "3e", "3ème"].includes(n)
      )
        group = ped?.ce2_3eme as Record<string, unknown> | undefined;

      const arr = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
      return {
        applicationId: a.id,
        childName: `${a.childLastName} ${a.childFirstName}`.trim(),
        niveau: a.niveau ?? "",
        arabe: (group?.arabe as string) || "",
        lva: (group?.lva as string) || "",
        lvb: (group?.lvb as string) || "",
        lvc: arr(group?.lvc),
        specialites: arr(group?.specialites),
        bfi:
          group?.bfi === true ||
          group?.sectionInternationale === true
            ? "Oui"
            : "Non",
      };
    });
  });
}

// ── Nationalités ───────────────────────────────────────────────

export type NationaliteRow = {
  applicationId: string;
  childName: string;
  niveau: string;
  childIsLebanese: string;
  childPassportLebanese: string;
  childNationality1: string;
  childNationality2: string;
  countryOfBirth: string;
};

export async function nationalitesReport(
  cycleId: string | null,
): Promise<NationaliteRow[]> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return [];
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const apps = await db.application.findMany({
      where: {
        deletedAt: null,
        archived: false,
        ...(cycleId ? { cycleId } : {}),
      },
      orderBy: [{ childLastName: "asc" }, { childFirstName: "asc" }],
      select: {
        id: true,
        childFirstName: true,
        childLastName: true,
        niveau: true,
        childIsLebanese: true,
        childPassportLebanese: true,
        childNationality: true,
        childNationality2: true,
        childBirthCountry: true,
      },
    });
    return apps.map((a) => ({
      applicationId: a.id,
      childName: `${a.childLastName} ${a.childFirstName}`.trim(),
      niveau: a.niveau ?? "",
      childIsLebanese:
        a.childIsLebanese === true
          ? "Oui"
          : a.childIsLebanese === false
            ? "Non"
            : "—",
      childPassportLebanese: a.childPassportLebanese ?? "",
      childNationality1: a.childNationality ?? "",
      childNationality2: a.childNationality2 ?? "",
      countryOfBirth: a.childBirthCountry ?? "",
    }));
  });
}

// ── CSV builder ────────────────────────────────────────────────

/** Minimal RFC 4180 CSV. Wraps fields containing commas, quotes, or
 * newlines in double-quotes; doubles internal quotes. */
export function csv<T extends Record<string, unknown>>(
  rows: T[],
  columns: ReadonlyArray<{ key: keyof T; header: string }>,
): string {
  const escape = (v: unknown): string => {
    let s = v == null ? "" : String(v);
    // Formula-injection guard: many columns are parent-controlled dossier
    // answers (child name, nationality, …). A value starting with = + - @
    // (or tab/CR) is evaluated as a formula by Excel/LibreOffice, so prefix a
    // single quote to force it to be treated as text. (OWASP CSV injection.)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push(columns.map((c) => escape(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(","));
  }
  // BOM so Excel opens UTF-8 cleanly.
  return "﻿" + lines.join("\r\n");
}
