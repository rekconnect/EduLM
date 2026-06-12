"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const TYPES = ["bus", "minibus", "van"] as const;
const FUELS = ["diesel", "essence", "hybride", "electrique"] as const;

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown): number | null => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** Add a bus to the fleet ("Listes des autocars"). */
export async function createAutocar(input: {
  number: string;
  type: string;
  capacity: string;
  plate: string;
  cylinders: string;
  couleur: string;
  dateAchat: string;
  moteur: string;
  fuel: string;
  modele: string;
  anneeFabrication: string;
  vin: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const number = s(input.number, 10);
  if (!/^\d{1,3}$/.test(number)) return { ok: false, error: "Numéro d'autocar invalide" };
  const type = s(input.type, 20);
  if (type && !(TYPES as readonly string[]).includes(type)) return { ok: false, error: "Type invalide" };
  const fuel = s(input.fuel, 20);
  if (fuel && !(FUELS as readonly string[]).includes(fuel)) return { ok: false, error: "Carburant invalide" };
  const dateAchat = s(input.dateAchat, 10);
  if (dateAchat && !/^\d{4}-\d{2}-\d{2}$/.test(dateAchat)) return { ok: false, error: "Date d'achat invalide" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const dup = await db.autocar.findFirst({ where: { tenantId, number } });
    if (dup) return { ok: false, error: `L'autocar n° ${number} existe déjà` };
    await db.autocar.create({
      data: {
        tenantId,
        number,
        type: type || null,
        capacity: int(input.capacity),
        plate: s(input.plate, 40) || null,
        cylinders: int(input.cylinders),
        couleur: s(input.couleur, 40) || null,
        dateAchat: dateAchat || null,
        moteur: s(input.moteur, 80) || null,
        fuel: fuel || null,
        modele: s(input.modele, 80) || null,
        anneeFabrication: int(input.anneeFabrication),
        vin: s(input.vin, 60) || null,
      },
    });
    revalidatePath("/transport");
    return { ok: true };
  });
}

/** Edit a fleet bus — same validation as create. */
export async function updateAutocar(
  id: string,
  input: {
    number: string;
    type: string;
    capacity: string;
    plate: string;
    cylinders: string;
    couleur: string;
    dateAchat: string;
    moteur: string;
    fuel: string;
    modele: string;
    anneeFabrication: string;
    vin: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const number = s(input.number, 10);
  if (!/^\d{1,3}$/.test(number)) return { ok: false, error: "Numéro d'autocar invalide" };
  const type = s(input.type, 20);
  if (type && !(TYPES as readonly string[]).includes(type)) return { ok: false, error: "Type invalide" };
  const fuel = s(input.fuel, 20);
  if (fuel && !(FUELS as readonly string[]).includes(fuel)) return { ok: false, error: "Carburant invalide" };
  const dateAchat = s(input.dateAchat, 10);
  if (dateAchat && !/^\d{4}-\d{2}-\d{2}$/.test(dateAchat)) return { ok: false, error: "Date d'achat invalide" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const dup = await db.autocar.findFirst({
      where: { tenantId, number, id: { not: id } },
    });
    if (dup) return { ok: false, error: `L'autocar n° ${number} existe déjà` };
    await db.autocar.updateMany({
      where: { id, tenantId },
      data: {
        number,
        type: type || null,
        capacity: int(input.capacity),
        plate: s(input.plate, 40) || null,
        cylinders: int(input.cylinders),
        couleur: s(input.couleur, 40) || null,
        dateAchat: dateAchat || null,
        moteur: s(input.moteur, 80) || null,
        fuel: fuel || null,
        modele: s(input.modele, 80) || null,
        anneeFabrication: int(input.anneeFabrication),
        vin: s(input.vin, 60) || null,
      },
    });
    revalidatePath("/transport");
    return { ok: true };
  });
}

/** Remove a bus from the fleet. */
export async function deleteAutocar(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  return runWithTenant({ tenantId, slug: null }, async () => {
    await db.autocar.deleteMany({ where: { id, tenantId } });
    revalidatePath("/transport");
    return { ok: true };
  });
}

/** Add a circuit row ("Autocar - Circuit"), e.g. autocar 8 + "Ordinaire". */
export async function createBusCircuit(input: {
  autocarNumber: string;
  activite: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const autocarNumber = s(input.autocarNumber, 10);
  const activite = s(input.activite, 60) || "Ordinaire";
  if (!/^\d{1,3}$/.test(autocarNumber)) return { ok: false, error: "Numéro d'autocar invalide" };
  return runWithTenant({ tenantId, slug: null }, async () => {
    const dup = await db.busCircuit.findFirst({ where: { tenantId, autocarNumber, activite } });
    if (dup) return { ok: false, error: `Le circuit « ${autocarNumber} - ${activite} » existe déjà` };
    await db.busCircuit.create({ data: { tenantId, autocarNumber, activite } });
    revalidatePath("/transport");
    return { ok: true };
  });
}

/** Edit a circuit row (autocar number and/or activité). */
export async function updateBusCircuit(
  id: string,
  input: { autocarNumber: string; activite: string },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const autocarNumber = s(input.autocarNumber, 10);
  const activite = s(input.activite, 60) || "Ordinaire";
  if (!/^\d{1,3}$/.test(autocarNumber)) return { ok: false, error: "Numéro d'autocar invalide" };
  return runWithTenant({ tenantId, slug: null }, async () => {
    const dup = await db.busCircuit.findFirst({
      where: { tenantId, autocarNumber, activite, id: { not: id } },
    });
    if (dup) return { ok: false, error: `Le circuit « ${autocarNumber} - ${activite} » existe déjà` };
    await db.busCircuit.updateMany({
      where: { id, tenantId },
      data: { autocarNumber, activite },
    });
    revalidatePath("/transport");
    return { ok: true };
  });
}

/** Remove a circuit row. */
export async function deleteBusCircuit(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  return runWithTenant({ tenantId, slug: null }, async () => {
    await db.busCircuit.deleteMany({ where: { id, tenantId } });
    revalidatePath("/transport");
    return { ok: true };
  });
}
