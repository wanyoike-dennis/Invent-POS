import db from "./src/database/db.js";

const users = db
  .prepare(`
    SELECT
      id,
      name,
      role,
      branch_id,
      is_active,
      organization_id
    FROM users
    ORDER BY id ASC
  `)
  .all();

console.log(users);