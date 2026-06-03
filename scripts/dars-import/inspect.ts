/**
 * Dars schema inspector.
 *
 * Connects to localhost\SQLEXPRESS\DARSMontaigne via Windows Auth, lists
 * every user table, dumps: row count, column metadata (name / type /
 * nullable / PK / identity), and 3 sample rows per table. Foreign keys
 * are listed once at the bottom.
 *
 * Outputs:
 *   imports/dars-schema.json   — machine-readable full dump
 *   imports/dars-schema.md     — human-readable summary for planning
 *
 * Run:
 *   npx tsx scripts/dars-import/inspect.ts
 *
 * Requires:
 *   npm install -D mssql msnodesqlv8
 */

import sql from "mssql/msnodesqlv8.js";
import fs from "node:fs/promises";
import path from "node:path";

const DB_NAME = "DARSMontaigne";

// Explicit ODBC connection string — msnodesqlv8 defaults to a legacy
// driver name ("SQL Server Native Client 11.0") that hasn't shipped
// in years; ODBC Driver 17 / 18 is what's actually installed.
const config = {
  driver: "msnodesqlv8",
  connectionString:
    "Driver={ODBC Driver 18 for SQL Server};" +
    "Server=localhost\\SQLEXPRESS;" +
    `Database=${DB_NAME};` +
    "Trusted_Connection=yes;" +
    "TrustServerCertificate=yes;",
} as sql.config;

type Column = {
  column_name: string;
  data_type: string;
  max_length: number;
  precision: number;
  scale: number;
  is_nullable: boolean;
  is_identity: boolean;
  is_pk: boolean;
};

type ForeignKey = {
  fk_name: string;
  parent_table: string;
  parent_column: string;
  ref_table: string;
  ref_column: string;
};

type TableDump = {
  name: string;
  schema: string;
  table: string;
  rowCount: number;
  columns: Column[];
  samples: Record<string, unknown>[];
};

async function main() {
  console.log(`Connecting to localhost\\SQLEXPRESS\\${DB_NAME}...`);
  const pool = await sql.connect(config);
  console.log("Connected.\n");

  // List all user tables
  const tablesResult = await pool.request().query<{
    schema_name: string;
    table_name: string;
  }>(`
    SELECT s.name AS schema_name, t.name AS table_name
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.type = 'U'
    ORDER BY s.name, t.name
  `);

  console.log(`Found ${tablesResult.recordset.length} tables. Dumping...\n`);

  const tables: TableDump[] = [];

  for (const { schema_name, table_name } of tablesResult.recordset) {
    const fullName = `${schema_name}.${table_name}`;
    process.stdout.write(`  ${fullName}... `);

    // Columns + PK flag
    const colsResult = await pool.request().query<Column>(`
      SELECT
        c.name AS column_name,
        TYPE_NAME(c.user_type_id) AS data_type,
        c.max_length,
        c.precision,
        c.scale,
        CAST(c.is_nullable AS BIT) AS is_nullable,
        CAST(c.is_identity AS BIT) AS is_identity,
        CAST(CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS is_pk
      FROM sys.columns c
      LEFT JOIN (
        SELECT ic.column_id, ic.object_id
        FROM sys.index_columns ic
        JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        WHERE i.is_primary_key = 1
      ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('${schema_name}.${table_name}')
      ORDER BY c.column_id
    `);

    // Row count
    const countResult = await pool.request().query<{ cnt: number }>(
      `SELECT COUNT_BIG(*) AS cnt FROM [${schema_name}].[${table_name}]`,
    );
    const rowCount = Number(countResult.recordset[0]!.cnt);

    // 3 samples
    const samplesResult = await pool
      .request()
      .query<Record<string, unknown>>(
        `SELECT TOP 3 * FROM [${schema_name}].[${table_name}]`,
      );

    tables.push({
      name: fullName,
      schema: schema_name,
      table: table_name,
      rowCount,
      columns: colsResult.recordset,
      samples: samplesResult.recordset,
    });

    console.log(`${rowCount.toLocaleString()} rows, ${colsResult.recordset.length} cols`);
  }

  // Foreign keys
  console.log("\nDumping foreign keys...");
  const fksResult = await pool.request().query<ForeignKey>(`
    SELECT
      fk.name AS fk_name,
      sch_parent.name + '.' + tab_parent.name AS parent_table,
      col_parent.name AS parent_column,
      sch_ref.name + '.' + tab_ref.name AS ref_table,
      col_ref.name AS ref_column
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.tables tab_parent ON tab_parent.object_id = fk.parent_object_id
    JOIN sys.schemas sch_parent ON sch_parent.schema_id = tab_parent.schema_id
    JOIN sys.columns col_parent ON col_parent.object_id = tab_parent.object_id AND col_parent.column_id = fkc.parent_column_id
    JOIN sys.tables tab_ref ON tab_ref.object_id = fk.referenced_object_id
    JOIN sys.schemas sch_ref ON sch_ref.schema_id = tab_ref.schema_id
    JOIN sys.columns col_ref ON col_ref.object_id = tab_ref.object_id AND col_ref.column_id = fkc.referenced_column_id
    ORDER BY parent_table, fk.name
  `);

  await pool.close();

  // Write JSON dump
  const importsDir = path.join(process.cwd(), "imports");
  await fs.mkdir(importsDir, { recursive: true });

  const jsonPath = path.join(importsDir, "dars-schema.json");
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        database: DB_NAME,
        server: "localhost\\SQLEXPRESS",
        extractedAt: new Date().toISOString(),
        tables,
        foreignKeys: fksResult.recordset,
      },
      // Custom replacer: dates → ISO, buffers → "<binary>"
      (_k, v) => {
        if (v instanceof Date) return v.toISOString();
        if (v && typeof v === "object" && (v as { type?: string }).type === "Buffer") {
          return "<binary>";
        }
        return v;
      },
      2,
    ),
    "utf8",
  );

  // Write human-readable summary
  const mdPath = path.join(importsDir, "dars-schema.md");
  const md: string[] = [];
  md.push(`# Dars schema dump — ${DB_NAME}`);
  md.push(`Extracted: ${new Date().toISOString()}`);
  md.push("");
  md.push(`## Tables (${tables.length})`);
  md.push("");
  md.push("| Table | Rows | Cols |");
  md.push("| --- | ---: | ---: |");
  for (const t of [...tables].sort((a, b) => b.rowCount - a.rowCount)) {
    md.push(`| ${t.name} | ${t.rowCount.toLocaleString()} | ${t.columns.length} |`);
  }
  md.push("");
  md.push("## Schemas (detail)");
  md.push("");
  for (const t of tables) {
    md.push(`### ${t.name} — ${t.rowCount.toLocaleString()} rows`);
    md.push("");
    md.push("| Column | Type | Null | PK | Identity |");
    md.push("| --- | --- | :---: | :---: | :---: |");
    for (const c of t.columns) {
      const typeStr =
        c.data_type === "nvarchar" || c.data_type === "varchar"
          ? `${c.data_type}(${c.max_length === -1 ? "max" : c.max_length / (c.data_type === "nvarchar" ? 2 : 1)})`
          : c.data_type === "decimal" || c.data_type === "numeric"
            ? `${c.data_type}(${c.precision},${c.scale})`
            : c.data_type;
      md.push(
        `| ${c.column_name} | ${typeStr} | ${c.is_nullable ? "✓" : ""} | ${c.is_pk ? "✓" : ""} | ${c.is_identity ? "✓" : ""} |`,
      );
    }
    md.push("");
  }
  md.push("## Foreign Keys");
  md.push("");
  md.push("| Parent | Column | References | Column |");
  md.push("| --- | --- | --- | --- |");
  for (const fk of fksResult.recordset) {
    md.push(
      `| ${fk.parent_table} | ${fk.parent_column} | ${fk.ref_table} | ${fk.ref_column} |`,
    );
  }
  await fs.writeFile(mdPath, md.join("\n"), "utf8");

  console.log(`\nDone. Wrote:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
