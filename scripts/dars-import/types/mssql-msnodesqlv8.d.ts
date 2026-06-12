/**
 * Minimal typings for the mssql msnodesqlv8 driver entry — the package ships
 * no types for this subpath and @types/mssql isn't installed. Only the
 * surface used by the Dars import scripts is declared.
 */
declare module "mssql/msnodesqlv8.js" {
  namespace sql {
    interface config {
      driver?: string;
      connectionString?: string;
      [key: string]: unknown;
    }
    interface QueryResult<T = Record<string, unknown>> {
      recordset: T[];
    }
    interface Request {
      query<T = Record<string, unknown>>(query: string): Promise<QueryResult<T>>;
    }
    class ConnectionPool {
      request(): Request;
      close(): Promise<void>;
    }
    function connect(config: config): Promise<ConnectionPool>;
  }
  export = sql;
}
