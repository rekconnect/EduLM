import { ClipboardList, Bus, Users, List, Route } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { withTenantSession } from "@/lib/session";
import { db } from "@/lib/db";
import {
  saveBusAssignments,
  deleteBusAssignment,
  registerBusStudent,
} from "../students/_actions";
import { setBusAttendance } from "./_attendance-actions";
import {
  createAutocar,
  updateAutocar,
  deleteAutocar,
  createBusCircuit,
  updateBusCircuit,
  deleteBusCircuit,
} from "./_fleet-actions";
import { TransportTabs } from "./_transport-tabs";
import { TransportManager } from "./_manager";
import { AutocarsView } from "./_autocars";
import { FleetView, type AutocarDto } from "./_fleet";
import { CircuitsView } from "./_circuits";
import { loadBusRows } from "./_data";

/**
 * Transport module — vertical grouped nav:
 *   Etudiants  → Inscription (assignment table) · Autocar (per-bus attendance)
 *   Autocars   → Listes des autocars (fleet CRUD) · Autocar - Circuit (0..24)
 */
export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ yearId?: string; trim?: string }>;
}) {
  const { yearId, trim } = await searchParams;

  return withTenantSession(async (user) => {
    if (user.role !== "SCHOOL_ADMIN") {
      return (
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            Accès réservé aux administrateurs.
          </p>
        </main>
      );
    }

    const data = await loadBusRows({ yearId, trim });
    const saveForPeriod = saveBusAssignments.bind(null, data.period);
    const deleteForPeriod = deleteBusAssignment.bind(null, data.period);
    const registerForPeriod = registerBusStudent.bind(null, data.period);

    // Distinct riders per bus (matin / soir / activité) for badges + circuits.
    const ridersByBus = new Map<string, Set<string>>();
    for (const r of data.rows) {
      for (const bus of [
        r.bus_as === "yes" ? r.bus_car_matin.trim() : "",
        r.bus_rs === "yes" ? r.bus_car_soir.trim() : "",
        r.bus_act_bus.trim(),
      ]) {
        if (!bus) continue;
        const s = ridersByBus.get(bus) ?? new Set<string>();
        s.add(r.id);
        ridersByBus.set(bus, s);
      }
    }
    const persons: Record<string, number> = {};
    for (const [bus, s] of ridersByBus) persons[bus] = s.size;

    // Today's bus attendance (school day in Beirut time).
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Beirut",
    }).format(new Date());
    const attRows = await db.busAttendance.findMany({
      where: { date: today },
      select: { studentId: true, bus: true, status: true },
    });
    const attendance: Record<string, string> = {};
    for (const a of attRows) attendance[`${a.studentId}|${a.bus}`] = a.status;

    // Fleet.
    const fleet = await db.autocar.findMany({ orderBy: { number: "asc" } });
    const fleetDtos: AutocarDto[] = fleet.map((a) => ({
      id: a.id,
      number: a.number,
      type: a.type ?? "",
      capacity: a.capacity != null ? String(a.capacity) : "",
      plate: a.plate ?? "",
      cylinders: a.cylinders != null ? String(a.cylinders) : "",
      couleur: a.couleur ?? "",
      dateAchat: a.dateAchat ?? "",
      moteur: a.moteur ?? "",
      fuel: a.fuel ?? "",
      modele: a.modele ?? "",
      anneeFabrication: a.anneeFabrication != null ? String(a.anneeFabrication) : "",
      vin: a.vin ?? "",
    }));
    const capacities: Record<string, string> = {};
    for (const a of fleetDtos) capacities[a.number] = a.capacity;

    // Circuits ("N - Ordinaire" + custom ones).
    const circuits = await db.busCircuit.findMany({
      select: { id: true, autocarNumber: true, activite: true },
    });

    return (
      <main className="mx-auto max-w-[96rem] space-y-6 px-6 py-10">
        <PageHeader
          title="Transport"
          description={`${data.rows.length} élève(s) inscrit(s) au bus · ${data.yearLabel} · Trimestre ${data.trim.slice(1)}`}
        />
        <TransportTabs
          groups={[
            {
              id: "etudiants",
              label: "Etudiants",
              icon: <Users className="size-4" aria-hidden />,
              items: [
                {
                  id: "inscription",
                  label: "Inscription",
                  icon: <ClipboardList className="size-4" aria-hidden />,
                  badge: data.rows.length,
                  content: (
                    <TransportManager
                      rows={data.rows}
                      years={data.years}
                      selectedYearId={data.selectedYearId}
                      trim={data.trim}
                      candidates={data.candidates}
                      onSave={saveForPeriod}
                      onDelete={deleteForPeriod}
                      onRegister={registerForPeriod}
                    />
                  ),
                },
                {
                  id: "autocar",
                  label: "Autocar",
                  icon: <Bus className="size-4" aria-hidden />,
                  badge: ridersByBus.size,
                  content: (
                    <AutocarsView
                      rows={data.rows}
                      years={data.years}
                      selectedYearId={data.selectedYearId}
                      trim={data.trim}
                      yearLabel={data.yearLabel}
                      date={today}
                      attendance={attendance}
                      onSetAttendance={setBusAttendance}
                    />
                  ),
                },
              ],
            },
            {
              id: "autocars",
              label: "Autocars",
              icon: <Bus className="size-4" aria-hidden />,
              items: [
                {
                  id: "fleet",
                  label: "Listes des autocars",
                  icon: <List className="size-4" aria-hidden />,
                  badge: fleetDtos.length,
                  content: (
                    <FleetView
                      autocars={fleetDtos}
                      onCreate={createAutocar}
                      onUpdate={updateAutocar}
                      onDelete={deleteAutocar}
                    />
                  ),
                },
                {
                  id: "circuits",
                  label: "Autocar - Circuit",
                  icon: <Route className="size-4" aria-hidden />,
                  badge: circuits.length,
                  content: (
                    <CircuitsView
                      circuits={circuits}
                      fleetNumbers={fleetDtos.map((a) => a.number)}
                      persons={persons}
                      capacities={capacities}
                      yearLabel={data.yearLabel}
                      trim={data.trim}
                      onCreate={createBusCircuit}
                      onUpdate={updateBusCircuit}
                      onDelete={deleteBusCircuit}
                    />
                  ),
                },
              ],
            },
          ]}
        />
      </main>
    );
  });
}
