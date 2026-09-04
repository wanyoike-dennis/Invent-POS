import express from "express";
import db from "../database/db.js";
import {
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import type {
  AuthRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Get all categories for the logged-in organization
router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  const categories = db
    .prepare(`
      SELECT *
      FROM categories
      WHERE organization_id = ?
      ORDER BY name ASC
    `)
    .all(organizationId);

  res.json(categories);
});

// Add category to the logged-in organization
router.post(
  "/",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Category name is required",
      });
    }

    const normalizedName = name.trim();

    try {
      const existingCategory = db
        .prepare(`
          SELECT id
          FROM categories
          WHERE organization_id = ?
            AND LOWER(name) = LOWER(?)
        `)
        .get(
          organizationId,
          normalizedName
        );

      if (existingCategory) {
        return res.status(400).json({
          message:
            "Category already exists in this organization",
        });
      }

      const result = db
        .prepare(`
          INSERT INTO categories (
            name,
            organization_id
          )
          VALUES (?, ?)
        `)
        .run(
          normalizedName,
          organizationId
        );

      const category = db
        .prepare(`
          SELECT *
          FROM categories
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(
          result.lastInsertRowid,
          organizationId
        );

      res.status(201).json(category);
    } catch (error) {
      console.error("Create category error:", error);

      res.status(500).json({
        message: "Failed to create category",
      });
    }
  }
);

// Delete category only from the logged-in organization
router.delete(
  "/:id",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const { id } = req.params;

    const result = db
      .prepare(`
        DELETE FROM categories
        WHERE id = ?
          AND organization_id = ?
      `)
      .run(id, organizationId);

    if (result.changes === 0) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    res.json({
      message: "Category deleted successfully",
    });
  }
);

export default router;
