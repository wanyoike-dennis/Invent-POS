import db from "./db.js";

console.log("Resetting Invent POS test data...");

const resetData = db.transaction(() => {
  // Delete child records first because of foreign-key relationships
  db.prepare("DELETE FROM sales_return_items").run();
  db.prepare("DELETE FROM sales_returns").run();

  db.prepare("DELETE FROM sale_items").run();
  db.prepare("DELETE FROM sales").run();

  db.prepare("DELETE FROM stock_movements").run();
  db.prepare("DELETE FROM stock_purchases").run();

  db.prepare("DELETE FROM expenses").run();

  db.prepare("DELETE FROM products").run();
  db.prepare("DELETE FROM suppliers").run();

  // Reset AUTOINCREMENT counters.
  // USERS IS INTENTIONALLY EXCLUDED.
  const tables = [
    "sales_return_items",
    "sales_returns",
    "sale_items",
    "sales",
    "stock_movements",
    "stock_purchases",
    "expenses",
    "products",
    "suppliers",
  ];

  for (const table of tables) {
    db.prepare(
      "DELETE FROM sqlite_sequence WHERE name = ?"
    ).run(table);
  }
});

try {
  resetData();

  console.log("Invent POS data reset successfully.");
  console.log("Users were NOT deleted.");
} catch (error) {
  console.error("Failed to reset Invent POS data:", error);
  process.exit(1);
}