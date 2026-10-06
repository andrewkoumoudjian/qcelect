import { openDatabase, migrateDatabase } from "../apps/web/src/server/database";

const database = await openDatabase();
try {
  if (process.argv[2] === "migrate") {
    await migrateDatabase(database.client);
    console.log("Database migrations applied");
  } else if (process.argv[2] === "status") {
    const rows = await database.client.execute(
      "SELECT name, sha256 FROM schema_migrations ORDER BY name",
    );
    console.table(rows.rows);
  } else throw new Error("Usage: pnpm db:migrate or pnpm db:status");
} finally {
  database.client.close();
}
