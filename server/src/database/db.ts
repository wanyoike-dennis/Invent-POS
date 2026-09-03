import Database from "better-sqlite3";

const db = new Database("invent-pos.db");

db.pragma("journal_mode = WAL");

db.exec(`
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name)
  VALUES (?)
`);

insertCategory.run("Computer Accessories");
insertCategory.run("Cables");
insertCategory.run("Monitors");
insertCategory.run("Storage devices");

export default db;