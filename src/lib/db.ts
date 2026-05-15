import { PrismaClient } from "@prisma/client";
import { getTenantContext } from "./tenant-context";

/**
 * Models that carry a `tenantId` column and must be auto-scoped on every
 * query. Keep this list in sync with `prisma/schema.prisma`.
 */
const TENANT_SCOPED_MODELS = new Set([
  "User",
  "AcademicYear",
  "Class",
  "Student",
  "Guardian",
  "Enrollment",
  "AttendanceRecord",
  "DisciplineEvent",
  "Invoice",
  "Payment",
]);

const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_OPS_WHERE = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

function basePrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function extend(client: ReturnType<typeof basePrisma>) {
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const ctx = getTenantContext();
          const tenantId = ctx?.tenantId ?? null;

          // SUPER_ADMIN paths run without tenant context. Allow only when the
          // caller explicitly disabled the scope (via raw queries) or is a
          // super-admin route that set `tenantId: null` intentionally.
          if (!tenantId) {
            if (process.env.ALLOW_UNSCOPED_QUERIES === "true" || ctx) {
              return query(args);
            }
            throw new Error(
              `Refusing to run unscoped ${model}.${operation} — no tenant in context`,
            );
          }

          const a = (args ?? {}) as Record<string, unknown>;

          if (READ_OPS.has(operation) || WRITE_OPS_WHERE.has(operation)) {
            const where = (a.where as Record<string, unknown> | undefined) ?? {};
            a.where = { ...where, tenantId };
          }

          if (CREATE_OPS.has(operation)) {
            if (operation === "createMany" || operation === "createManyAndReturn") {
              const data = a.data;
              if (Array.isArray(data)) {
                a.data = data.map((row) => ({ ...row, tenantId }));
              }
            } else {
              const data = (a.data as Record<string, unknown> | undefined) ?? {};
              a.data = { ...data, tenantId };
            }
          }

          if (operation === "upsert") {
            const create = (a.create as Record<string, unknown> | undefined) ?? {};
            a.create = { ...create, tenantId };
          }

          return query(a);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof extend>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const db: ExtendedClient = globalForPrisma.prisma ?? extend(basePrisma());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/**
 * Escape hatch for super-admin / system code that must read across tenants
 * (creating tenants, cron jobs, migrations). Use sparingly.
 */
export function unscopedDb() {
  return basePrisma();
}
