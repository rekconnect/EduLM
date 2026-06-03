/**
 * Shared connection to the Dars SQL Server database.
 * Windows Auth via ODBC Driver 18 (the driver that's actually installed
 * — the default msnodesqlv8 driver name is a legacy one that's gone).
 */
import sql from "mssql/msnodesqlv8.js";

export const DARS_DB = "DARSMontaigne";

/** Montaigne's tenant id inside Dars. Every query filters on this. */
export const DARS_COLLEGE_ID = 108;

const config = {
  driver: "msnodesqlv8",
  connectionString:
    "Driver={ODBC Driver 18 for SQL Server};" +
    "Server=localhost\\SQLEXPRESS;" +
    `Database=${DARS_DB};` +
    "Trusted_Connection=yes;" +
    "TrustServerCertificate=yes;",
} as sql.config;

let pool: sql.ConnectionPool | null = null;

export async function darsPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;
  pool = await sql.connect(config);
  return pool;
}

export async function closeDars(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

/** Run a query and return typed rows. */
export async function darsQuery<T = Record<string, unknown>>(
  query: string,
): Promise<T[]> {
  const p = await darsPool();
  const result = await p.request().query<T>(query);
  return result.recordset;
}
