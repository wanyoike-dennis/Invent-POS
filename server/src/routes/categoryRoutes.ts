import express from "express";
import db from "../database/db";

const router = express.Router();

// Get all categories
router.get("/", (req, res) => {
  const categories = db
    .prepare("SELECT * FROM categories ORDER BY name ASC")
    .all();

  res.json(categories);
});

// Add category
router.post("/", (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      message: "Category name is required",
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO categories (name)
        VALUES (?)
      `)
      .run(name.trim());

    const category = db
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({
      message: "Category already exists",
    });
  }
});

// Delete category
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.prepare(
    "DELETE FROM categories WHERE id = ?"
  ).run(id);

  res.json({
    message: "Category deleted successfully",
  });
});

export default router;