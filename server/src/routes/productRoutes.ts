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

export default router;