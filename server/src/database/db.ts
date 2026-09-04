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

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name)
  VALUES (?)
`);



export default db;