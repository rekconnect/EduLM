import sql from "mssql/msnodesqlv8.js";
const config = { driver: "msnodesqlv8", connectionString: "Driver={ODBC Driver 18 for SQL Server};Server=localhost\SQLEXPRESS;Database=DARSMontaigne;Trusted_Connection=yes;TrustServerCertificate=yes;" } as sql.config;
(async () => {
  const pool = await sql.connect(config);
  const r = await pool.request().query("SELECT SYear, COUNT(*) AS Registered FROM Isc_StudentClass WHERE Registered=1 GROUP BY SYear ORDER BY SYear DESC");
  console.table(r.recordset);
  await pool.close();
})().catch(e => { console.error(String(e).split("\n")[0]); process.exit(1); });
