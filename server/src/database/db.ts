import Database from "better-sqlite3";

const db = new Database("invent-pos.db");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    phone TEXT,
    email TEXT,
    address TEXT,
    receipt_footer TEXT,
    currency TEXT NOT NULL DEFAULT 'KES',
    status TEXT NOT NULL DEFAULT 'active',
    trial_ends_at DATETIME,
    subscription_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_organizations_slug
    ON organizations(slug);

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    cost_price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id)
      REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    organization_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id)
      REFERENCES organizations(id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL,
    amount_paid REAL NOT NULL,
    change_amount REAL NOT NULL DEFAULT 0,
    mpesa_code TEXT,
    sold_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sold_by)
      REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    cost_price REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL,

    FOREIGN KEY (sale_id)
      REFERENCES sales(id),

    FOREIGN KEY (product_id)
      REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sale_id INTEGER NOT NULL,

    refund_amount REAL NOT NULL DEFAULT 0,

    reason TEXT NOT NULL,

    returned_by INTEGER NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sale_id)
      REFERENCES sales(id),

    FOREIGN KEY (returned_by)
      REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sales_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    return_id INTEGER NOT NULL,

    sale_item_id INTEGER NOT NULL,

    product_id INTEGER NOT NULL,

    quantity INTEGER NOT NULL,

    unit_price REAL NOT NULL,

    subtotal REAL NOT NULL,

    FOREIGN KEY (return_id)
      REFERENCES sales_returns(id),

    FOREIGN KEY (sale_item_id)
      REFERENCES sale_items(id),

    FOREIGN KEY (product_id)
      REFERENCES products(id)
  );

  -- ==========================================================
  -- EXPENSES
  -- ==========================================================

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,

    category TEXT NOT NULL,

    amount REAL NOT NULL,

    payment_method TEXT NOT NULL,

    description TEXT,

    recorded_by INTEGER,

    expense_date DATE NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (recorded_by)
      REFERENCES users(id)
  );

  -- ==========================================================
  -- EXPENSE INDEXES
  -- Helps reporting/filtering as expense records grow
  -- ==========================================================

  CREATE INDEX IF NOT EXISTS idx_expenses_date
    ON expenses(expense_date);

  CREATE INDEX IF NOT EXISTS idx_expenses_category
    ON expenses(category);

  -- ==========================================================
  -- SUPPLIERS
  -- ==========================================================

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_suppliers_name
    ON suppliers(name);

  CREATE INDEX IF NOT EXISTS idx_suppliers_phone
    ON suppliers(phone);

  -- ==========================================================
  -- CUSTOMERS
  -- ==========================================================

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_customers_name
    ON customers(name);

  CREATE INDEX IF NOT EXISTS idx_customers_phone
    ON customers(phone);

  CREATE INDEX IF NOT EXISTS idx_customers_email
    ON customers(email);

  -- ==========================================================
  -- STOCK PURCHASES / WHOLESALE RESTOCKING
  -- ==========================================================

  CREATE TABLE IF NOT EXISTS stock_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_cost REAL NOT NULL,
    unit_cost REAL NOT NULL,
    previous_stock INTEGER NOT NULL,
    previous_cost_price REAL NOT NULL,
    new_stock INTEGER NOT NULL,
    new_cost_price REAL NOT NULL,
    supplier_id INTEGER,
    reference TEXT,
    notes TEXT,
    purchased_by INTEGER,
    purchase_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (product_id)
      REFERENCES products(id),

    FOREIGN KEY (purchased_by)
      REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_stock_purchases_product
    ON stock_purchases(product_id);

  CREATE INDEX IF NOT EXISTS idx_stock_purchases_date
    ON stock_purchases(purchase_date);
`);

// ==========================================================
// ORGANIZATION / MULTI-TENANT FOUNDATION
// Existing installations are assigned to one default organization.
// Authentication will use organization_id from the logged-in user.
// ==========================================================

db.exec(`
  INSERT OR IGNORE INTO organizations (
    name,
    slug,
    currency
  )
  VALUES (
    'Invent Solutions',
    'invent-solutions',
    'KES'
  )
`);

const defaultOrganization = db
  .prepare(`
    SELECT id
    FROM organizations
    WHERE slug = 'invent-solutions'
    LIMIT 1
  `)
  .get() as { id: number } | undefined;

if (!defaultOrganization) {
  throw new Error(
    "Failed to create or find the default organization"
  );
}

// ==========================================================
// ORGANIZATION ACCESS / SUBSCRIPTION STATUS
// Existing organizations stay active.
// ==========================================================

const organizationStatusColumns = db
  .prepare("PRAGMA table_info(organizations)")
  .all() as { name: string }[];

if (
  !organizationStatusColumns.some(
    (column) => column.name === "status"
  )
) {
  db.exec(`
    ALTER TABLE organizations
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  `);
}

if (
  !organizationStatusColumns.some(
    (column) => column.name === "trial_ends_at"
  )
) {
  db.exec(`
    ALTER TABLE organizations
    ADD COLUMN trial_ends_at DATETIME
  `);
}

if (
  !organizationStatusColumns.some(
    (column) => column.name === "subscription_expires_at"
  )
) {
  db.exec(`
    ALTER TABLE organizations
    ADD COLUMN subscription_expires_at DATETIME
  `);
}

db.exec(`
  UPDATE organizations
  SET status = 'active'
  WHERE status IS NULL
     OR TRIM(status) = ''
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON organizations(status)
`);

const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all() as { name: string }[];

if (
  !userColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

db.prepare(`
  UPDATE users
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_organization
  ON users(organization_id)
`);

// ==========================================================
// USER STATUS / SOFT DEACTIVATION
// Keeps historical sales and audit references intact.
// ==========================================================

const userStatusColumns = db
  .prepare("PRAGMA table_info(users)")
  .all() as { name: string }[];

if (
  !userStatusColumns.some(
    (column) => column.name === "is_active"
  )
) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
  `);
}

db.exec(`
  UPDATE users
  SET is_active = 1
  WHERE is_active IS NULL
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_active
  ON users(is_active)
`);


// ==========================================================
// PRODUCT / CATEGORY TENANT OWNERSHIP
// Existing records are assigned to the default organization.
// ==========================================================

const categoryColumns = db
  .prepare("PRAGMA table_info(categories)")
  .all() as { name: string }[];

if (
  !categoryColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE categories
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

const tenantProductColumns = db
  .prepare("PRAGMA table_info(products)")
  .all() as { name: string }[];

if (
  !tenantProductColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE products
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

const stockMovementColumns = db
  .prepare("PRAGMA table_info(stock_movements)")
  .all() as { name: string }[];

if (
  !stockMovementColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE stock_movements
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

const stockPurchaseColumns = db
  .prepare("PRAGMA table_info(stock_purchases)")
  .all() as { name: string }[];

if (
  !stockPurchaseColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE stock_purchases
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

db.prepare(`
  UPDATE categories
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.prepare(`
  UPDATE products
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.prepare(`
  UPDATE stock_movements
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.prepare(`
  UPDATE stock_purchases
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_categories_organization
  ON categories(organization_id);

  CREATE INDEX IF NOT EXISTS idx_products_organization
  ON products(organization_id);

  CREATE INDEX IF NOT EXISTS idx_stock_movements_organization
  ON stock_movements(organization_id);

  CREATE INDEX IF NOT EXISTS idx_stock_purchases_organization
  ON stock_purchases(organization_id);
`);

// ==========================================================
// CUSTOMER / SUPPLIER TENANT OWNERSHIP
// Existing records are assigned to the default organization.
// ==========================================================

const customerTenantColumns = db
  .prepare("PRAGMA table_info(customers)")
  .all() as { name: string }[];

if (
  !customerTenantColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE customers
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

const supplierTenantColumns = db
  .prepare("PRAGMA table_info(suppliers)")
  .all() as { name: string }[];

if (
  !supplierTenantColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE suppliers
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

db.prepare(`
  UPDATE customers
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.prepare(`
  UPDATE suppliers
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_customers_organization
  ON customers(organization_id);

  CREATE INDEX IF NOT EXISTS idx_suppliers_organization
  ON suppliers(organization_id);
`);

// ==========================================================
// SALES TENANT OWNERSHIP
// Existing sales are assigned to the default organization.
// Returns remain linked through their organization-owned sale.
// ==========================================================

const salesTenantColumns = db
  .prepare("PRAGMA table_info(sales)")
  .all() as { name: string }[];

if (
  !salesTenantColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

db.prepare(`
  UPDATE sales
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sales_organization
  ON sales(organization_id)
`);

// ==========================================================
// EXPENSE TENANT OWNERSHIP
// Existing expenses are assigned to the default organization.
// ==========================================================

const expenseTenantColumns = db
  .prepare("PRAGMA table_info(expenses)")
  .all() as { name: string }[];

if (
  !expenseTenantColumns.some(
    (column) => column.name === "organization_id"
  )
) {
  db.exec(`
    ALTER TABLE expenses
    ADD COLUMN organization_id INTEGER
      REFERENCES organizations(id)
  `);
}

db.prepare(`
  UPDATE expenses
  SET organization_id = ?
  WHERE organization_id IS NULL
`).run(defaultOrganization.id);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_expenses_organization
  ON expenses(organization_id)
`);

// ==========================================================
// BRANCHES / MULTI-BRANCH FOUNDATION
// Every branch belongs to one organization. Existing organizations
// receive one Main Branch so current installations remain usable.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
      CHECK (is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id)
      REFERENCES organizations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_branches_organization
    ON branches(organization_id);

  CREATE INDEX IF NOT EXISTS idx_branches_active
    ON branches(organization_id, is_active);
`);

// ==========================================================
// STAFF / BRANCH ASSIGNMENT
// Existing users are assigned to their organization's Main Branch.
// ==========================================================

const userBranchColumns = db
  .prepare("PRAGMA table_info(users)")
  .all() as { name: string }[];

if (!userBranchColumns.some((column) => column.name === "branch_id")) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN branch_id INTEGER
      REFERENCES branches(id)
  `);
}

db.exec(`
  UPDATE users
  SET branch_id = (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = users.organization_id
    ORDER BY
      CASE WHEN UPPER(COALESCE(b.code, '')) = 'MAIN' THEN 0 ELSE 1 END,
      b.id ASC
    LIMIT 1
  )
  WHERE branch_id IS NULL
    AND organization_id IS NOT NULL
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_branch
    ON users(branch_id);

  CREATE INDEX IF NOT EXISTS idx_users_organization_branch
    ON users(organization_id, branch_id);
`);

// A branch code only needs to be unique inside its organization.
// SQLite allows multiple NULL values in a UNIQUE index, so code remains optional.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_org_code_unique
    ON branches(organization_id, code)
    WHERE code IS NOT NULL AND TRIM(code) <> '';
`);

// Create a Main Branch only for organizations that do not have any branch yet.
// This is safe to run on every backend start and does not consume extra capacity
// for organizations that already have branch records.
db.exec(`
  INSERT INTO branches (
    organization_id,
    name,
    code,
    is_active
  )
  SELECT
    o.id,
    'Main Branch',
    'MAIN',
    1
  FROM organizations o
  WHERE NOT EXISTS (
    SELECT 1
    FROM branches b
    WHERE b.organization_id = o.id
  );
`);

// ==========================================================
// EXPENSE / BRANCH OWNERSHIP
// Existing historical expenses are assigned to their organization's
// Main Branch because the original branch cannot be reconstructed.
// New expenses must receive branch_id from the expense route.
// ==========================================================

const expenseBranchColumns = db
  .prepare("PRAGMA table_info(expenses)")
  .all() as { name: string }[];

if (
  !expenseBranchColumns.some(
    (column) => column.name === "branch_id"
  )
) {
  db.exec(`
    ALTER TABLE expenses
    ADD COLUMN branch_id INTEGER
      REFERENCES branches(id)
  `);
}

// Backfill only rows that do not yet have branch ownership.
// Main Branch is preferred by code; otherwise the earliest branch is used.
db.exec(`
  UPDATE expenses
  SET branch_id = (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = expenses.organization_id
    ORDER BY
      CASE WHEN UPPER(TRIM(COALESCE(b.code, ''))) = 'MAIN' THEN 0 ELSE 1 END,
      CASE WHEN b.is_active = 1 THEN 0 ELSE 1 END,
      b.id ASC
    LIMIT 1
  )
  WHERE branch_id IS NULL
    AND organization_id IS NOT NULL
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_expenses_branch
    ON expenses(branch_id);

  CREATE INDEX IF NOT EXISTS idx_expenses_organization_branch
    ON expenses(organization_id, branch_id);
`);

// ==========================================================
// BRANCH INVENTORY / PER-BRANCH STOCK FOUNDATION
// Products remain organization-owned catalog records.
// Stock quantities are stored per branch in branch_inventory.
// Existing product stock is migrated to the organization's Main Branch only.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS branch_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
      CHECK (stock >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
      REFERENCES organizations(id),

    FOREIGN KEY (branch_id)
      REFERENCES branches(id),

    FOREIGN KEY (product_id)
      REFERENCES products(id),

    UNIQUE (branch_id, product_id)
  );

  CREATE INDEX IF NOT EXISTS idx_branch_inventory_organization
    ON branch_inventory(organization_id);

  CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch
    ON branch_inventory(branch_id);

  CREATE INDEX IF NOT EXISTS idx_branch_inventory_product
    ON branch_inventory(product_id);

  CREATE INDEX IF NOT EXISTS idx_branch_inventory_org_branch
    ON branch_inventory(organization_id, branch_id);
`);

// Seed one inventory row for every existing product in its organization's
// Main Branch. INSERT OR IGNORE makes this safe on every backend restart.
// Existing products keep their current products.stock quantity in Main Branch.
db.exec(`
  INSERT OR IGNORE INTO branch_inventory (
    organization_id,
    branch_id,
    product_id,
    stock
  )
  SELECT
    p.organization_id,
    (
      SELECT b.id
      FROM branches b
      WHERE b.organization_id = p.organization_id
      ORDER BY
        CASE WHEN UPPER(TRIM(COALESCE(b.code, ''))) = 'MAIN' THEN 0 ELSE 1 END,
        CASE WHEN b.is_active = 1 THEN 0 ELSE 1 END,
        b.id ASC
      LIMIT 1
    ),
    p.id,
    CASE
      WHEN COALESCE(p.stock, 0) < 0 THEN 0
      ELSE COALESCE(p.stock, 0)
    END
  FROM products p
  WHERE p.organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM branches b
      WHERE b.organization_id = p.organization_id
    )
`);

// ==========================================================
// INVENTORY HISTORY / BRANCH OWNERSHIP
// Stock movements and wholesale purchases now record the branch
// whose inventory was affected. Existing historical rows are assigned
// to the organization's Main Branch because their original branch
// cannot be reconstructed reliably from the old schema.
// ==========================================================

const stockMovementBranchColumns = db
  .prepare("PRAGMA table_info(stock_movements)")
  .all() as { name: string }[];

if (
  !stockMovementBranchColumns.some(
    (column) => column.name === "branch_id"
  )
) {
  db.exec(`
    ALTER TABLE stock_movements
    ADD COLUMN branch_id INTEGER
      REFERENCES branches(id)
  `);
}

const stockPurchaseBranchColumns = db
  .prepare("PRAGMA table_info(stock_purchases)")
  .all() as { name: string }[];

if (
  !stockPurchaseBranchColumns.some(
    (column) => column.name === "branch_id"
  )
) {
  db.exec(`
    ALTER TABLE stock_purchases
    ADD COLUMN branch_id INTEGER
      REFERENCES branches(id)
  `);
}

// Historical records created before branch-aware inventory did not store
// branch ownership. Assign those records to the organization's Main Branch.
// New records will always receive branch_id directly from the route.
db.exec(`
  UPDATE stock_movements
  SET branch_id = (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = stock_movements.organization_id
    ORDER BY
      CASE WHEN UPPER(TRIM(COALESCE(b.code, ''))) = 'MAIN' THEN 0 ELSE 1 END,
      CASE WHEN b.is_active = 1 THEN 0 ELSE 1 END,
      b.id ASC
    LIMIT 1
  )
  WHERE branch_id IS NULL
    AND organization_id IS NOT NULL
`);

db.exec(`
  UPDATE stock_purchases
  SET branch_id = (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = stock_purchases.organization_id
    ORDER BY
      CASE WHEN UPPER(TRIM(COALESCE(b.code, ''))) = 'MAIN' THEN 0 ELSE 1 END,
      CASE WHEN b.is_active = 1 THEN 0 ELSE 1 END,
      b.id ASC
    LIMIT 1
  )
  WHERE branch_id IS NULL
    AND organization_id IS NOT NULL
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stock_movements_branch
    ON stock_movements(branch_id);

  CREATE INDEX IF NOT EXISTS idx_stock_movements_organization_branch
    ON stock_movements(organization_id, branch_id);

  CREATE INDEX IF NOT EXISTS idx_stock_purchases_branch
    ON stock_purchases(branch_id);

  CREATE INDEX IF NOT EXISTS idx_stock_purchases_organization_branch
    ON stock_purchases(organization_id, branch_id);
`);

// ==========================================================
// STOCK TRANSFERS / INTER-BRANCH INVENTORY MOVEMENT
// Transfers move existing stock from one branch to another.
// They do not change the organization's total products.stock quantity.
// A transfer header stores the audit trail; item rows store product
// quantities and branch stock snapshots for each transferred product.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS stock_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    transfer_number TEXT NOT NULL,
    from_branch_id INTEGER NOT NULL,
    to_branch_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('completed')),
    notes TEXT,
    transferred_by INTEGER,
    transferred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
      REFERENCES organizations(id),

    FOREIGN KEY (from_branch_id)
      REFERENCES branches(id),

    FOREIGN KEY (to_branch_id)
      REFERENCES branches(id),

    FOREIGN KEY (transferred_by)
      REFERENCES users(id),

    UNIQUE (organization_id, transfer_number),

    CHECK (from_branch_id <> to_branch_id)
  );

  CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL
      CHECK (quantity > 0),
    from_stock_before INTEGER NOT NULL
      CHECK (from_stock_before >= 0),
    from_stock_after INTEGER NOT NULL
      CHECK (from_stock_after >= 0),
    to_stock_before INTEGER NOT NULL
      CHECK (to_stock_before >= 0),
    to_stock_after INTEGER NOT NULL
      CHECK (to_stock_after >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (transfer_id)
      REFERENCES stock_transfers(id),

    FOREIGN KEY (product_id)
      REFERENCES products(id),

    UNIQUE (transfer_id, product_id)
  );

  CREATE INDEX IF NOT EXISTS idx_stock_transfers_organization
    ON stock_transfers(organization_id);

  CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_branch
    ON stock_transfers(organization_id, from_branch_id);

  CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_branch
    ON stock_transfers(organization_id, to_branch_id);

  CREATE INDEX IF NOT EXISTS idx_stock_transfers_transferred_at
    ON stock_transfers(organization_id, transferred_at);

  CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
    ON stock_transfer_items(transfer_id);

  CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product
    ON stock_transfer_items(product_id);
`);

// ==========================================================
// SALES / BRANCH OWNERSHIP
// Existing sales are assigned to their organization's Main Branch.
// New sales are assigned by the authenticated user's home branch.
// ==========================================================

const salesBranchColumns = db
  .prepare("PRAGMA table_info(sales)")
  .all() as { name: string }[];

if (!salesBranchColumns.some((column) => column.name === "branch_id")) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN branch_id INTEGER
      REFERENCES branches(id)
  `);
}

db.exec(`
  UPDATE sales
  SET branch_id = (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = sales.organization_id
    ORDER BY
      CASE WHEN UPPER(TRIM(COALESCE(b.code, ''))) = 'MAIN' THEN 0 ELSE 1 END,
      CASE WHEN b.is_active = 1 THEN 0 ELSE 1 END,
      b.id ASC
    LIMIT 1
  )
  WHERE branch_id IS NULL
    AND organization_id IS NOT NULL
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sales_branch
    ON sales(branch_id);

  CREATE INDEX IF NOT EXISTS idx_sales_organization_branch
    ON sales(organization_id, branch_id);
`);

// ==========================================================
// COST PRICE / COGS MIGRATIONS
// Adds the new columns safely to existing databases.
// Existing records start at 0 until their historical costs
// are explicitly established.
// ==========================================================

const productColumns = db
  .prepare("PRAGMA table_info(products)")
  .all() as { name: string }[];

if (!productColumns.some((column) => column.name === "cost_price")) {
  db.exec(`
    ALTER TABLE products
    ADD COLUMN cost_price REAL NOT NULL DEFAULT 0
  `);
}

const saleItemColumns = db
  .prepare("PRAGMA table_info(sale_items)")
  .all() as { name: string }[];

if (!saleItemColumns.some((column) => column.name === "cost_price")) {
  db.exec(`
    ALTER TABLE sale_items
    ADD COLUMN cost_price REAL NOT NULL DEFAULT 0
  `);
}

// ==========================================================
// SALE DATE / BACKDATED SALE MIGRATION
// Adds business sale dates without changing created_at.
// ==========================================================

const saleColumns = db
  .prepare("PRAGMA table_info(sales)")
  .all() as { name: string }[];

if (!saleColumns.some((column) => column.name === "sale_date")) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN sale_date DATE
  `);

  db.exec(`
    UPDATE sales
    SET sale_date = DATE(created_at)
    WHERE sale_date IS NULL
  `);
}

if (!saleColumns.some((column) => column.name === "is_backdated")) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN is_backdated INTEGER NOT NULL DEFAULT 0
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sales_sale_date
  ON sales(sale_date)
`);

// ==========================================================
// SPLIT PAYMENT MIGRATION
// Stores the actual Cash / M-Pesa contribution for each sale.
// Existing single-method sales are backfilled automatically.
// ==========================================================

const splitPaymentSaleColumns = db
  .prepare("PRAGMA table_info(sales)")
  .all() as { name: string }[];

if (
  !splitPaymentSaleColumns.some(
    (column) => column.name === "cash_amount"
  )
) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN cash_amount REAL NOT NULL DEFAULT 0
  `);
}

if (
  !splitPaymentSaleColumns.some(
    (column) => column.name === "mpesa_amount"
  )
) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN mpesa_amount REAL NOT NULL DEFAULT 0
  `);
}

// Backfill existing sales without changing their totals.
// For Cash sales, amount_paid may include change, so only the sale total
// belongs to the Cash payment allocation.
db.exec(`
  UPDATE sales
  SET cash_amount =
    CASE
      WHEN payment_method = 'Cash' THEN total
      ELSE 0
    END
  WHERE cash_amount = 0
    AND mpesa_amount = 0
`);

db.exec(`
  UPDATE sales
  SET mpesa_amount =
    CASE
      WHEN payment_method = 'M-Pesa' THEN total
      ELSE 0
    END
  WHERE cash_amount = 0
    AND mpesa_amount = 0
`);

// ==========================================================
// CUSTOMER / SALES LINK MIGRATION
// Customer selection is optional; NULL means Walk-in Customer.
// ==========================================================

const customerSaleColumns = db
  .prepare("PRAGMA table_info(sales)")
  .all() as { name: string }[];

if (
  !customerSaleColumns.some(
    (column) => column.name === "customer_id"
  )
) {
  db.exec(`
    ALTER TABLE sales
    ADD COLUMN customer_id INTEGER
      REFERENCES customers(id)
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sales_customer
  ON sales(customer_id)
`);


// ==========================================================
// PLATFORM SUBSCRIPTIONS / PAYMENTS
// Platform billing metadata only; separate from tenant sales.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS subscription_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    payment_reference TEXT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id)
      REFERENCES organizations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_subscription_payments_organization
    ON subscription_payments(organization_id);

  CREATE INDEX IF NOT EXISTS idx_subscription_payments_paid_at
    ON subscription_payments(paid_at);
`);

const subscriptionOrganizationColumns = db
  .prepare("PRAGMA table_info(organizations)")
  .all() as { name: string }[];

if (
  !subscriptionOrganizationColumns.some(
    (column) => column.name === "subscription_plan"
  )
) {
  db.exec(`
    ALTER TABLE organizations
    ADD COLUMN subscription_plan TEXT
  `);
}

if (
  !subscriptionOrganizationColumns.some(
    (column) => column.name === "billing_cycle"
  )
) {
  db.exec(`
    ALTER TABLE organizations
    ADD COLUMN billing_cycle TEXT
  `);
}

// ==========================================================
// SUBSCRIPTION PLAN CATALOG / PRICING
// Platform-owned pricing used by Super Admin billing.
// Safe to run on every backend start.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
      CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscription_plan_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    billing_cycle TEXT NOT NULL
      CHECK (
        billing_cycle IN (
          'monthly',
          'quarterly',
          'annual'
        )
      ),
    amount REAL NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'KES',
    is_active INTEGER NOT NULL DEFAULT 1
      CHECK (is_active IN (0, 1)),
    effective_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    effective_to DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id)
      REFERENCES subscription_plans(id)
  );

  CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices_plan
    ON subscription_plan_prices(plan_id);

  CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices_cycle
    ON subscription_plan_prices(billing_cycle);
`);

const seedSubscriptionPlan = db.prepare(`
  INSERT OR IGNORE INTO subscription_plans (
    code,
    name,
    description,
    is_active,
    sort_order
  )
  VALUES (?, ?, ?, 1, ?)
`);

seedSubscriptionPlan.run(
  "starter",
  "Starter",
  "Entry plan for small businesses and simple POS operations.",
  10
);

seedSubscriptionPlan.run(
  "business",
  "Business",
  "Growth plan for businesses that need more operational capacity.",
  20
);

seedSubscriptionPlan.run(
  "pro",
  "Pro",
  "Advanced plan for larger and more demanding POS operations.",
  30
);

const seedSubscriptionPrice = db.prepare(`
  INSERT INTO subscription_plan_prices (
    plan_id,
    billing_cycle,
    amount,
    currency,
    is_active
  )
  SELECT
    id,
    ?,
    ?,
    'KES',
    1
  FROM subscription_plans
  WHERE code = ?
    AND NOT EXISTS (
      SELECT 1
      FROM subscription_plan_prices
      WHERE plan_id = subscription_plans.id
        AND billing_cycle = ?
        AND is_active = 1
    )
`);

const seedPrice = (
  planCode: string,
  billingCycle: "monthly" | "quarterly" | "annual",
  amount: number
) => {
  seedSubscriptionPrice.run(
    billingCycle,
    amount,
    planCode,
    billingCycle
  );
};

seedPrice("starter", "monthly", 1000);
seedPrice("starter", "quarterly", 2700);
seedPrice("starter", "annual", 10000);

seedPrice("business", "monthly", 2000);
seedPrice("business", "quarterly", 5400);
seedPrice("business", "annual", 20000);

seedPrice("pro", "monthly", 3500);
seedPrice("pro", "quarterly", 9500);
seedPrice("pro", "annual", 35000);


// ==========================================================
// SUBSCRIPTION PLAN FEATURES / ENTITLEMENTS
// Defines what each platform plan includes. These values are
// descriptive entitlements only for now; POS enforcement comes later.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS subscription_plan_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    feature_key TEXT NOT NULL,
    feature_label TEXT NOT NULL,
    feature_value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id)
      REFERENCES subscription_plans(id),
    UNIQUE (plan_id, feature_key)
  );

  CREATE INDEX IF NOT EXISTS idx_subscription_plan_features_plan
    ON subscription_plan_features(plan_id);
`);

const seedPlanFeature = db.prepare(`
  INSERT OR IGNORE INTO subscription_plan_features (
    plan_id,
    feature_key,
    feature_label,
    feature_value,
    sort_order
  )
  SELECT id, ?, ?, ?, ?
  FROM subscription_plans
  WHERE code = ?
`);

const planFeatureSeeds = [
  ["starter", "branches_included", "Branches included", "1", 10],
  ["starter", "users_included", "Users included", "2", 20],
  ["starter", "sales_inventory", "Sales, receipts & inventory", "included", 30],
  ["starter", "mpesa_recording", "M-Pesa payment recording", "included", 40],
  ["starter", "customer_expense_tracking", "Customer & expense tracking", "not_included", 50],
  ["starter", "staff_roles", "Staff roles & permissions", "Basic", 60],
  ["starter", "multi_branch_reports", "Multi-branch reports", "not_included", 70],
  ["starter", "audit_analytics", "Audit logs & advanced analytics", "not_included", 80],
  ["starter", "support", "Support", "Standard", 90],

  ["business", "branches_included", "Branches included", "Extra branches included", 10],
  ["business", "users_included", "Users included", "Extra users included", 20],
  ["business", "sales_inventory", "Sales, receipts & inventory", "included", 30],
  ["business", "mpesa_recording", "M-Pesa payment recording", "included", 40],
  ["business", "customer_expense_tracking", "Customer & expense tracking", "included", 50],
  ["business", "staff_roles", "Staff roles & permissions", "Advanced", 60],
  ["business", "multi_branch_reports", "Multi-branch reports", "included", 70],
  ["business", "audit_analytics", "Audit logs & advanced analytics", "not_included", 80],
  ["business", "support", "Support", "Priority", 90],

  ["pro", "branches_included", "Branches included", "Extra branches included", 10],
  ["pro", "users_included", "Users included", "Extra users included", 20],
  ["pro", "sales_inventory", "Sales, receipts & inventory", "included", 30],
  ["pro", "mpesa_recording", "M-Pesa payment recording", "included", 40],
  ["pro", "customer_expense_tracking", "Customer & expense tracking", "included", 50],
  ["pro", "staff_roles", "Staff roles & permissions", "Advanced", 60],
  ["pro", "multi_branch_reports", "Multi-branch reports", "included", 70],
  ["pro", "audit_analytics", "Audit logs & advanced analytics", "included", 80],
  ["pro", "support", "Support", "Dedicated", 90],
] as const;

for (const [planCode, key, label, value, sortOrder] of planFeatureSeeds) {
  seedPlanFeature.run(key, label, value, sortOrder, planCode);
}


// One-time normalization of the original descriptive limits.
// The WHERE clause only changes the old seed wording, so later Super Admin
// edits are preserved on future restarts.
db.prepare(`
  UPDATE subscription_plan_features
  SET
    feature_value = '3',
    updated_at = CURRENT_TIMESTAMP
  WHERE plan_id = (
    SELECT id
    FROM subscription_plans
    WHERE code = 'business'
  )
    AND feature_key = 'branches_included'
    AND feature_value = 'Extra branches included'
`).run();

db.prepare(`
  UPDATE subscription_plan_features
  SET
    feature_value = '10',
    updated_at = CURRENT_TIMESTAMP
  WHERE plan_id = (
    SELECT id
    FROM subscription_plans
    WHERE code = 'business'
  )
    AND feature_key = 'users_included'
    AND feature_value = 'Extra users included'
`).run();

db.prepare(`
  UPDATE subscription_plan_features
  SET
    feature_value = '10',
    updated_at = CURRENT_TIMESTAMP
  WHERE plan_id = (
    SELECT id
    FROM subscription_plans
    WHERE code = 'pro'
  )
    AND feature_key = 'branches_included'
    AND feature_value = 'Extra branches included'
`).run();

db.prepare(`
  UPDATE subscription_plan_features
  SET
    feature_value = '30',
    updated_at = CURRENT_TIMESTAMP
  WHERE plan_id = (
    SELECT id
    FROM subscription_plans
    WHERE code = 'pro'
  )
    AND feature_key = 'users_included'
    AND feature_value = 'Extra users included'
`).run();


// ==========================================================
// AUDIT LOG / ADVANCED ANALYTICS FOUNDATION
// Immutable organization-scoped event history for security and
// operational auditing. Route-level logging will be added next.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    branch_id INTEGER,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    description TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
      REFERENCES organizations(id),

    FOREIGN KEY (branch_id)
      REFERENCES branches(id),

    FOREIGN KEY (user_id)
      REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_organization
    ON audit_logs(organization_id);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_created
    ON audit_logs(organization_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_branch
    ON audit_logs(organization_id, branch_id);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_user
    ON audit_logs(organization_id, user_id);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_action
    ON audit_logs(organization_id, action);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
    ON audit_logs(organization_id, entity_type, entity_id);
`);


// ==========================================================
// SUPPORT TICKETS / CUSTOMER SUPPORT FOUNDATION
// Organization-scoped support requests. The support_level snapshot
// preserves the tenant's entitlement at the time the ticket is opened.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    branch_id INTEGER,
    created_by INTEGER NOT NULL,
    ticket_number TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    priority TEXT NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
    support_level TEXT NOT NULL DEFAULT 'Standard',
    assigned_to INTEGER,
    resolved_at DATETIME,
    closed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
      REFERENCES organizations(id),

    FOREIGN KEY (branch_id)
      REFERENCES branches(id),

    FOREIGN KEY (created_by)
      REFERENCES users(id),

    UNIQUE (organization_id, ticket_number)
  );

  CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    organization_id INTEGER NOT NULL,
    user_id INTEGER,
    sender_type TEXT NOT NULL
      CHECK (sender_type IN ('tenant', 'support')),
    message TEXT NOT NULL,
    is_internal INTEGER NOT NULL DEFAULT 0
      CHECK (is_internal IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ticket_id)
      REFERENCES support_tickets(id),

    FOREIGN KEY (organization_id)
      REFERENCES organizations(id),

    FOREIGN KEY (user_id)
      REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_support_tickets_organization
    ON support_tickets(organization_id);

  CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status
    ON support_tickets(organization_id, status);

  CREATE INDEX IF NOT EXISTS idx_support_tickets_org_branch
    ON support_tickets(organization_id, branch_id);

  CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by
    ON support_tickets(organization_id, created_by);

  CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
    ON support_tickets(organization_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_support_tickets_support_level
    ON support_tickets(support_level);

  CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
    ON support_ticket_messages(ticket_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_organization
    ON support_ticket_messages(organization_id);
`);


// ==========================================================
// NOTIFICATIONS / TENANT NOTIFICATION CENTER
// Persistent organization-scoped alerts for operational,
// support, subscription, inventory, and system events.
// A notification may target one user or the whole organization.
// ==========================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    user_id INTEGER,
    branch_id INTEGER,
    type TEXT NOT NULL DEFAULT 'system'
      CHECK (
        type IN (
          'inventory',
          'support',
          'subscription',
          'staff',
          'security',
          'system'
        )
      ),
    severity TEXT NOT NULL DEFAULT 'info'
      CHECK (
        severity IN (
          'info',
          'success',
          'warning',
          'critical'
        )
      ),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    action_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0
      CHECK (is_read IN (0, 1)),
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
      REFERENCES organizations(id),

    FOREIGN KEY (user_id)
      REFERENCES users(id),

    FOREIGN KEY (branch_id)
      REFERENCES branches(id)
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_organization
    ON notifications(organization_id);

  CREATE INDEX IF NOT EXISTS idx_notifications_org_user
    ON notifications(organization_id, user_id);

  CREATE INDEX IF NOT EXISTS idx_notifications_org_branch
    ON notifications(organization_id, branch_id);

  CREATE INDEX IF NOT EXISTS idx_notifications_org_read
    ON notifications(organization_id, is_read);

  CREATE INDEX IF NOT EXISTS idx_notifications_org_created
    ON notifications(organization_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(organization_id, user_id, is_read, created_at);

  CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON notifications(organization_id, entity_type, entity_id);
`);


const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name)
  VALUES (?)
`);



export default db;