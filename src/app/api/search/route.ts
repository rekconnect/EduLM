import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";

export type SearchResults = {
  parents: { id: string; name: string | null; email: string }[];
  students: { id: string; firstName: string; lastName: string }[];
  classes: { id: string; name: string; level: string; section: string }[];
};

const EMPTY: SearchResults = { parents: [], students: [], classes: [] };

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2 || !user.tenantId) {
    return NextResponse.json(EMPTY);
  }

  // People/class search is for school admins and teachers ONLY. Everyone else
  // (STAFF, PARENT, SUPER_ADMIN) gets nothing — a staff/parent user must never
  // receive student, parent, or class records from the palette.
  if (user.role !== "SCHOOL_ADMIN" && user.role !== "TEACHER") {
    return NextResponse.json(EMPTY);
  }

  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const [parents, students, classes] = await Promise.all([
      db.user.findMany({
        where: {
          role: "PARENT",
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 5,
      }),
      db.student.findMany({
        where: {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 5,
      }),
      db.class.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { level: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, level: true, section: true },
        orderBy: [{ level: "asc" }, { section: "asc" }],
        take: 5,
      }),
    ]);

    const body: SearchResults = { parents, students, classes };
    return NextResponse.json(body);
  });
}
