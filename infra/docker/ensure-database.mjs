/**
 * Ensure DATABASE_URL target database exists (idempotent).
 * Handles Dokploy volumes initialized without POSTGRES_DB or env/URL mismatches.
 */
import pg from "pg";

const databaseUrl = process.env["DATABASE_URL"]?.trim();
if (!databaseUrl) {
  console.log("DATABASE_URL unset — skipping ensure-database");
  process.exit(0);
}

const dbName =
  process.env["POSTGRES_DB"]?.trim() ||
  (() => {
    try {
      const u = new URL(databaseUrl.replace(/^postgresql:/, "http:"));
      return u.pathname.replace(/^\//, "").split("/")[0] || "alpacto";
    } catch {
      return "alpacto";
    }
  })();

const maintenanceUrl = databaseUrl.replace(/\/([^/?]+)(\?.*)?$/, "/postgres$2");

const client = new pg.Client({ connectionString: maintenanceUrl });

try {
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );
  if ((exists.rowCount ?? 0) === 0) {
    console.log(`Creating database "${dbName}"...`);
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`✅ Database "${dbName}" created`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }
} catch (err) {
  console.error("ensure-database failed:", err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
