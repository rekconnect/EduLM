/** Read-only: find what Med_Immunizations.Id_Immunization references. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  // Any table with an immunization-ish column or name.
  const cols = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE LOWER(COLUMN_NAME) LIKE '%immun%' OR LOWER(TABLE_NAME) LIKE '%immun%'
        OR LOWER(COLUMN_NAME) LIKE '%vaccin%'
     ORDER BY TABLE_NAME`,
  );
  console.log("Columns/tables matching immun/vaccin:");
  for (const c of cols) console.log(`  ${c.TABLE_NAME}.${c.COLUMN_NAME}`);

  // Distinct Id_Immunization values + how many — small set → fixed list.
  const vals = await darsQuery<Record<string, unknown>>(
    `SELECT Id_Immunization, COUNT(*) AS n,
            SUM(CASE WHEN IsDone=1 THEN 1 ELSE 0 END) AS done
     FROM Med_Immunizations WHERE Id_College=${C}
     GROUP BY Id_Immunization ORDER BY Id_Immunization`,
  );
  console.log("\nDistinct Id_Immunization values:");
  console.table(vals);

  // FK constraints on Med_Immunizations, if declared.
  const fks = await darsQuery<Record<string, unknown>>(
    `SELECT fk.name AS fkName, OBJECT_NAME(fkc.referenced_object_id) AS refTable,
            COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS refCol
     FROM sys.foreign_keys fk
     JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
     WHERE fk.parent_object_id = OBJECT_ID('Med_Immunizations')`,
  ).catch(() => []);
  console.log("\nDeclared FKs on Med_Immunizations:");
  console.table(fks);

  // Description samples per id (Description column may carry the name).
  const desc = await darsQuery<Record<string, unknown>>(
    `SELECT Id_Immunization, MIN(Description) AS sampleDesc
     FROM Med_Immunizations
     WHERE Id_College=${C} AND Description IS NOT NULL AND LTRIM(RTRIM(Description))<>''
     GROUP BY Id_Immunization ORDER BY Id_Immunization`,
  );
  console.log("\nSample Description per Id_Immunization:");
  console.table(desc);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
