import db from "./db.js";

console.log("Resetting Invent POS test data...");

const resetData = db.transaction(() => {
  // Delete child records first
  db.prepare("DELETE FROM sales_return_items").run();
  db.prepare("DELETE FROM sales_returns").run();
  db.prepare("DELETE FROM sale_items").run();

  // Delete sales
  db.prepare("DELETE FROM sales").run();

  // Inventory
  db.prepare("DELETE FROM stock_movements").run();
  db.prepare("DELETE FROM products").run();

  // Expenses
  db.prepare("DELETE FROM expenses").run();

  // Categories
  db.prepare("DELETE FROM categories").run();

  // Reset auto-increment IDs for cleared tables.
  // IMPORTANT: users is deliberately excluded.
  const tables = [
    "sales_return_items",
    "sales_returns",
    "sale_items",
    "sales",
    "stock_movements",
    "products",
    "expenses",
    "categories",
  ];

  const resetSequence = db.prepare(
    "DELETE FROM sqlite_sequence WHERE name = ?"
  );

  for (const table of tables) {
    resetSequence.run(table);
  }
});

try {
  resetData();

  console.log("✅ Database reset successful.");
  console.log("✅ Users were NOT deleted.");
  console.log("✅ Business/test records cleared.");
} catch (error) {
  console.error("❌ Database reset failed:", error);
  process.exit(1);
}