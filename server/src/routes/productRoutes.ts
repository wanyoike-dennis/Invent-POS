import express from "express";
import db from "../database/db.js";

const router = express.Router();



router.get("/", (req, res) => {
  const products = db
    .prepare("SELECT * FROM products ORDER BY id DESC")
    .all();

  res.json(products);
});

router.post("/", (req, res) => {
  const { name, category, price, stock } = req.body;

  if (!name || !category || price === undefined || stock === undefined) {
    return res.status(400).json({
      message: "All product fields are required",
    });
  }

  const result = db
    .prepare(`
      INSERT INTO products (name, category, price, stock)
      VALUES (?, ?, ?, ?)
    `)
    .run(name, category, price, stock);

  const product = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(product);
});

router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { name, category, price, stock } = req.body;

  db.prepare(`
    UPDATE products
    SET name = ?, category = ?, price = ?, stock = ?
    WHERE id = ?
  `).run(name, category, price, stock, id);

  const product = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id);

  res.json(product);
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.prepare(
    "DELETE FROM products WHERE id = ?"
  ).run(id);

  res.json({
    message: "Product deleted successfully",
  });
});

router.patch("/:id/stock", (req, res) => {
  const { id } = req.params;
  const { type, quantity, reason } = req.body;

  const product = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id) as {
      id: number;
      stock: number;
    } | undefined;

  if (!product) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  const qty = Number(quantity);

  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({
      message: "Quantity must be a positive whole number",
    });
  }

  if (type !== "in" && type !== "out") {
    return res.status(400).json({
      message: "Invalid stock adjustment type",
    });
  }

  let newStock = product.stock;

  if (type === "in") {
    newStock += qty;
  }

  if (type === "out") {
    if (qty > product.stock) {
      return res.status(400).json({
        message: "Not enough stock available",
      });
    }

    newStock -= qty;
  }

  const updateStock = db.prepare(`
    UPDATE products
    SET stock = ?
    WHERE id = ?
  `);

  const addMovement = db.prepare(`
    INSERT INTO stock_movements (
      product_id,
      type,
      quantity,
      reason
    )
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    updateStock.run(newStock, id);

    addMovement.run(
      id,
      type,
      qty,
      reason?.trim() || null
    );
  });

  transaction();

  const updatedProduct = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id);

  res.json(updatedProduct);
});


router.get("/stock/history", (req, res) => {
  const movements = db
    .prepare(`
      SELECT
        stock_movements.id,
        stock_movements.product_id,
        products.name AS product_name,
        stock_movements.type,
        stock_movements.quantity,
        stock_movements.reason,
        stock_movements.created_at
      FROM stock_movements
      INNER JOIN products
        ON products.id = stock_movements.product_id
      ORDER BY stock_movements.id DESC
    `)
    .all();

  res.json(movements);
});

export default router;