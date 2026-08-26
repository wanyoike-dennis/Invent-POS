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
    stock INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name)
  VALUES (?)
`);

insertCategory.run("Computer Accessories");
insertCategory.run("Cables");
insertCategory.run("Monitors");
insertCategory.run("Storage devices");

export default db;