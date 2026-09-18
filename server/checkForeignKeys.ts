import db from "./src/database/db.js";

const tables = db
  .prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  .all() as { name: string }[];

for (const table of tables) {
  const foreignKeys = db
    .prepare(`PRAGMA foreign_key_list("${table.name}")`)
    .all();

  if (foreignKeys.length > 0) {
    console.log(`\n=== ${table.name} ===`);
    console.table(foreignKeys);
  }
}