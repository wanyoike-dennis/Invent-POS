import express from "express";
import db from "../database/db.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

type SupplierRow = {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

const optionalText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// ==========================================================
// LIST SUPPLIERS
// Admin, Manager and Cashier can view.
// ==========================================================

router.get("/", (_req, res) => {
  try {
    const suppliers = db
      .prepare(`
        SELECT
          id,
          name,
          contact_person,
          phone,
          email,
          address,
          notes,
          created_at
        FROM suppliers
        ORDER BY name COLLATE NOCASE ASC, id DESC
      `)
      .all();

    res.json(suppliers);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({
      message: "Failed to fetch suppliers",
    });
  }
});

// ==========================================================
// CREATE SUPPLIER
// Admin and Manager only.
// ==========================================================

router.post("/", authorizeRoles("admin", "manager"), (req, res) => {
  try {
    const {
      name,
      contact_person,
      phone,
      email,
      address,
      notes,
    } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Supplier name is required",
      });
    }

    const supplierName = name.trim();
    const supplierEmail = optionalText(email);

    if (
      supplierEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)
    ) {
      return res.status(400).json({
        message: "Please enter a valid supplier email",
      });
    }

    const result = db
      .prepare(`
        INSERT INTO suppliers (
          name,
          contact_person,
          phone,
          email,
          address,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        supplierName,
        optionalText(contact_person),
        optionalText(phone),
        supplierEmail,
        optionalText(address),
        optionalText(notes)
      );

    const supplier = db
      .prepare(`
        SELECT *
        FROM suppliers
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: "Supplier created successfully",
      supplier,
    });
  } catch (error) {
    console.error("Error creating supplier:", error);
    res.status(500).json({
      message: "Failed to create supplier",
    });
  }
});

// ==========================================================
// UPDATE SUPPLIER
// Admin and Manager only.
// ==========================================================

router.put("/:id", authorizeRoles("admin", "manager"), (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      contact_person,
      phone,
      email,
      address,
      notes,
    } = req.body;

    const existingSupplier = db
      .prepare(`
        SELECT id
        FROM suppliers
        WHERE id = ?
      `)
      .get(id);

    if (!existingSupplier) {
      return res.status(404).json({
        message: "Supplier not found",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Supplier name is required",
      });
    }

    const supplierName = name.trim();
    const supplierEmail = optionalText(email);

    if (
      supplierEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)
    ) {
      return res.status(400).json({
        message: "Please enter a valid supplier email",
      });
    }

    db.prepare(`
      UPDATE suppliers
      SET
        name = ?,
        contact_person = ?,
        phone = ?,
        email = ?,
        address = ?,
        notes = ?
      WHERE id = ?
    `).run(
      supplierName,
      optionalText(contact_person),
      optionalText(phone),
      supplierEmail,
      optionalText(address),
      optionalText(notes),
      id
    );

    const supplier = db
      .prepare(`
        SELECT *
        FROM suppliers
        WHERE id = ?
      `)
      .get(id) as SupplierRow;

    res.json({
      message: "Supplier updated successfully",
      supplier,
    });
  } catch (error) {
    console.error("Error updating supplier:", error);
    res.status(500).json({
      message: "Failed to update supplier",
    });
  }
});

// ==========================================================
// DELETE SUPPLIER
// Admin only.
// Existing purchase history is preserved because supplier_id
// in stock_purchases is not deleted or cascaded.
// ==========================================================

router.delete("/:id", authorizeRoles("admin"), (req, res) => {
  try {
    const { id } = req.params;

    const existingSupplier = db
      .prepare(`
        SELECT id
        FROM suppliers
        WHERE id = ?
      `)
      .get(id);

    if (!existingSupplier) {
      return res.status(404).json({
        message: "Supplier not found",
      });
    }

    const purchaseCount = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM stock_purchases
        WHERE supplier_id = ?
      `)
      .get(id) as { count: number };

    if (Number(purchaseCount.count || 0) > 0) {
      return res.status(409).json({
        message:
          "This supplier has purchase history and cannot be deleted. Edit the supplier instead.",
      });
    }

    db.prepare(`
      DELETE FROM suppliers
      WHERE id = ?
    `).run(id);

    res.json({
      message: "Supplier deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    res.status(500).json({
      message: "Failed to delete supplier",
    });
  }
});

export default router;
