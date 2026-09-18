import db from "./db.js";

const KEEP_ORGANIZATION_IDS = [1, 22] as const;
const KEEP_EMAIL = "leonsir429@gmail.com";

type OrganizationRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
};

const placeholders = KEEP_ORGANIZATION_IDS.map(() => "?").join(", ");

function deleteByOrganization(table: string) {
  const result = db
    .prepare(
      `DELETE FROM ${table}
       WHERE organization_id NOT IN (${placeholders})`
    )
    .run(...KEEP_ORGANIZATION_IDS);

  if (result.changes > 0) {
    console.log(`  ${table}: ${result.changes}`);
  }
}

function tableExists(table: string) {
  return Boolean(
    db
      .prepare(
        `SELECT 1
         FROM sqlite_master
         WHERE type = 'table' AND name = ?
         LIMIT 1`
      )
      .get(table)
  );
}

const kept = db
  .prepare(
    `SELECT id, name, slug, status
     FROM organizations
     WHERE id IN (${placeholders})
     ORDER BY id`
  )
  .all(...KEEP_ORGANIZATION_IDS) as OrganizationRow[];

if (kept.length !== 2) {
  throw new Error(
    "Safety check failed: organizations 1 and 22 must both exist. Nothing was deleted."
  );
}

const invent = kept.find(
  (row) => row.id === 1 && row.slug === "invent-solutions"
);

const fruvio = kept.find(
  (row) => row.id === 22 && row.slug === "fruvio-ltd"
);

if (!invent || !fruvio) {
  throw new Error(
    "Safety check failed: expected Invent Solutions ID 1 and Fruvio Ltd ID 22. Nothing was deleted."
  );
}

const fruvioUser = db
  .prepare(
    `SELECT id
     FROM users
     WHERE organization_id = 22
       AND LOWER(email) = LOWER(?)
     LIMIT 1`
  )
  .get(KEEP_EMAIL);

if (!fruvioUser) {
  throw new Error(
    `Safety check failed: Fruvio Ltd ID 22 does not contain ${KEEP_EMAIL}. Nothing was deleted.`
  );
}

const removing = db
  .prepare(
    `SELECT id, name, slug, status
     FROM organizations
     WHERE id NOT IN (${placeholders})
     ORDER BY id`
  )
  .all(...KEEP_ORGANIZATION_IDS) as OrganizationRow[];

console.log("\n=== INVENT POS SELECTIVE DATABASE RESET ===\n");
console.log("PRESERVING:");
for (const row of kept) {
  console.log(`  ${row.id}: ${row.name} (${row.slug}) [${row.status}]`);
}

console.log("\nREMOVING:");
if (removing.length === 0) {
  console.log("  None — database is already clean.");
  process.exit(0);
}
for (const row of removing) {
  console.log(`  ${row.id}: ${row.name} (${row.slug}) [${row.status}]`);
}

const cleanup = db.transaction(() => {
  console.log("\nDeleted rows:");

  /*
   * CHILD TABLES FIRST
   *
   * These tables depend on other tenant tables and therefore must be removed
   * before their parents. Foreign keys remain enabled throughout.
   */

  // Sales returns -> sale items / sales / products
  if (tableExists("sales_return_items")) {
    const result = db.prepare(`
      DELETE FROM sales_return_items
      WHERE return_id IN (
        SELECT sr.id
        FROM sales_returns sr
        JOIN sales s ON s.id = sr.sale_id
        WHERE s.organization_id NOT IN (${placeholders})
      )
      OR sale_item_id IN (
        SELECT si.id
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.organization_id NOT IN (${placeholders})
      )
      OR product_id IN (
        SELECT id FROM products
        WHERE organization_id NOT IN (${placeholders})
      )
    `).run(
      ...KEEP_ORGANIZATION_IDS,
      ...KEEP_ORGANIZATION_IDS,
      ...KEEP_ORGANIZATION_IDS
    );
    if (result.changes > 0) console.log(`  sales_return_items: ${result.changes}`);
  }

  if (tableExists("sales_returns")) {
    const result = db.prepare(`
      DELETE FROM sales_returns
      WHERE sale_id IN (
        SELECT id FROM sales
        WHERE organization_id NOT IN (${placeholders})
      )
    `).run(...KEEP_ORGANIZATION_IDS);
    if (result.changes > 0) console.log(`  sales_returns: ${result.changes}`);
  }

  if (tableExists("sale_items")) {
    const result = db.prepare(`
      DELETE FROM sale_items
      WHERE sale_id IN (
        SELECT id FROM sales
        WHERE organization_id NOT IN (${placeholders})
      )
      OR product_id IN (
        SELECT id FROM products
        WHERE organization_id NOT IN (${placeholders})
      )
    `).run(...KEEP_ORGANIZATION_IDS, ...KEEP_ORGANIZATION_IDS);
    if (result.changes > 0) console.log(`  sale_items: ${result.changes}`);
  }

  // Stock transfer items -> transfers / products
  if (tableExists("stock_transfer_items")) {
    const result = db.prepare(`
      DELETE FROM stock_transfer_items
      WHERE transfer_id IN (
        SELECT id FROM stock_transfers
        WHERE organization_id NOT IN (${placeholders})
      )
      OR product_id IN (
        SELECT id FROM products
        WHERE organization_id NOT IN (${placeholders})
      )
    `).run(...KEEP_ORGANIZATION_IDS, ...KEEP_ORGANIZATION_IDS);
    if (result.changes > 0) console.log(`  stock_transfer_items: ${result.changes}`);
  }

  // Support messages -> support tickets / users / organizations
  if (tableExists("support_ticket_messages")) {
    deleteByOrganization("support_ticket_messages");
  }

  /*
   * DIRECT ORGANIZATION-OWNED TABLES.
   * Delete all rows for organizations other than IDs 1 and 22 before users,
   * branches, products, customers and organizations themselves.
   */
  const directTenantTables = [
    "notifications",
    "audit_logs",
    "expenses",
    "stock_purchases",
    "stock_movements",
    "stock_transfers",
    "support_tickets",
    "sales",
    "branch_inventory",
    "subscription_payments",
  ];

  for (const table of directTenantTables) {
    if (tableExists(table)) {
      deleteByOrganization(table);
    }
  }

  /*
   * USERS must be deleted before BRANCHES because users.branch_id references
   * branches.id. All tables that reference users were deleted above.
   */
  if (tableExists("users")) {
    deleteByOrganization("users");
  }

  /*
   * PRODUCTS are now safe because sale_items, sales_return_items,
   * branch_inventory, stock purchases/movements and transfer items are gone.
   */
  if (tableExists("products")) {
    deleteByOrganization("products");
  }

  if (tableExists("customers")) {
    deleteByOrganization("customers");
  }

  if (tableExists("suppliers")) {
    deleteByOrganization("suppliers");
  }

  if (tableExists("categories")) {
    deleteByOrganization("categories");
  }

  /*
   * BRANCHES are last among tenant children because many tables reference
   * them, including users.
   */
  if (tableExists("branches")) {
    deleteByOrganization("branches");
  }

  const orgResult = db
    .prepare(
      `DELETE FROM organizations
       WHERE id NOT IN (${placeholders})`
    )
    .run(...KEEP_ORGANIZATION_IDS);

  console.log(`  organizations: ${orgResult.changes}`);

  const violations = db.prepare("PRAGMA foreign_key_check").all();

  if (violations.length > 0) {
    console.error("\nForeign-key violations detected:", violations);
    throw new Error(
      "Foreign-key validation failed. The transaction will be rolled back."
    );
  }
});

try {
  db.pragma("foreign_keys = ON");
  cleanup();

  console.log("\nCleanup completed successfully.");

  const remaining = db
    .prepare(
      `SELECT id, name, slug, status
       FROM organizations
       ORDER BY id`
    )
    .all() as OrganizationRow[];

  console.log("\nOrganizations remaining:");
  for (const row of remaining) {
    console.log(`  ${row.id}: ${row.name} (${row.slug}) [${row.status}]`);
  }

  console.log(
    "\nPreserved global platform data such as subscription plans, plan prices and plan features."
  );
  console.log("Foreign-key check: OK");
} catch (error) {
  console.error("\nCleanup FAILED. The transaction was rolled back.");
  console.error(error);
  process.exitCode = 1;
}
