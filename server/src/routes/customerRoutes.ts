import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const normalizeOptionalText = (value: unknown) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizePhone = (value: unknown) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  return trimmed.replace(/\s+/g, "");
};

const validateEmail = (value: string | null) => {
  if (!value) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

// ============================================================
// GET CUSTOMERS
// Supports optional search:
// /api/customers
// /api/customers?search=dennis
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const params: string[] = [];

    const whereClause = search
      ? `
        WHERE
          LOWER(name) LIKE LOWER(?)
          OR LOWER(COALESCE(phone, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(email, '')) LIKE LOWER(?)
      `
      : "";

    if (search) {
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    const customers = db
      .prepare(`
        SELECT
          id,
          name,
          phone,
          email,
          address,
          notes,
          created_at,
          updated_at
        FROM customers
        ${whereClause}
        ORDER BY name COLLATE NOCASE ASC, id DESC
      `)
      .all(...params) as CustomerRow[];

    const summary = db
      .prepare(`
        SELECT
          COUNT(*) AS total_customers,

          COALESCE(
            SUM(
              CASE
                WHEN DATE(created_at, 'localtime') =
                     DATE('now', 'localtime')
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS added_today,

          COALESCE(
            SUM(
              CASE
                WHEN DATE(created_at, 'localtime') >=
                     DATE('now', 'localtime', '-6 days')
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS added_last_7_days
        FROM customers
      `)
      .get() as {
        total_customers: number;
        added_today: number;
        added_last_7_days: number;
      };

    return res.json({
      summary: {
        total_customers: Number(summary.total_customers || 0),
        added_today: Number(summary.added_today || 0),
        added_last_7_days: Number(
          summary.added_last_7_days || 0
        ),
      },
      customers,
    });
  } catch (error) {
    console.error("Get customers error:", error);

    return res.status(500).json({
      message: "Failed to fetch customers",
    });
  }
});

// ============================================================
// GET SINGLE CUSTOMER
// ============================================================

router.get("/:id", (req: AuthRequest, res) => {
  try {
    const customerId = Number(req.params.id);

    if (!customerId || Number.isNaN(customerId)) {
      return res.status(400).json({
        message: "Invalid customer ID",
      });
    }

    const customer = db
      .prepare(`
        SELECT
          id,
          name,
          phone,
          email,
          address,
          notes,
          created_at,
          updated_at
        FROM customers
        WHERE id = ?
      `)
      .get(customerId) as CustomerRow | undefined;

    if (!customer) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    return res.json(customer);
  } catch (error) {
    console.error("Get customer error:", error);

    return res.status(500).json({
      message: "Failed to fetch customer",
    });
  }
});

// ============================================================
// CREATE CUSTOMER
// Admin, Manager and Cashier can create customers.
// ============================================================

router.post(
  "/",
  authorizeRoles("admin", "manager", "cashier"),
  (req: AuthRequest, res) => {
    try {
      const name =
        typeof req.body.name === "string"
          ? req.body.name.trim()
          : "";

      const phone = normalizePhone(req.body.phone);
      const email = normalizeOptionalText(req.body.email);
      const address = normalizeOptionalText(req.body.address);
      const notes = normalizeOptionalText(req.body.notes);

      if (!name) {
        return res.status(400).json({
          message: "Customer name is required",
        });
      }

      if (name.length > 120) {
        return res.status(400).json({
          message: "Customer name is too long",
        });
      }

      if (phone && phone.length > 30) {
        return res.status(400).json({
          message: "Phone number is too long",
        });
      }

      if (email && email.length > 160) {
        return res.status(400).json({
          message: "Email address is too long",
        });
      }

      if (!validateEmail(email)) {
        return res.status(400).json({
          message: "Enter a valid email address",
        });
      }

      if (phone) {
        const existingPhone = db
          .prepare(`
            SELECT id
            FROM customers
            WHERE phone = ?
          `)
          .get(phone) as { id: number } | undefined;

        if (existingPhone) {
          return res.status(409).json({
            message:
              "A customer with this phone number already exists",
          });
        }
      }

      const result = db
        .prepare(`
          INSERT INTO customers (
            name,
            phone,
            email,
            address,
            notes,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .run(
          name,
          phone,
          email,
          address,
          notes
        );

      const customerId = Number(result.lastInsertRowid);

      const customer = db
        .prepare(`
          SELECT
            id,
            name,
            phone,
            email,
            address,
            notes,
            created_at,
            updated_at
          FROM customers
          WHERE id = ?
        `)
        .get(customerId);

      return res.status(201).json({
        message: "Customer added successfully",
        customer,
      });
    } catch (error: any) {
      console.error("Create customer error:", error);

      if (
        error?.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return res.status(409).json({
          message:
            "A customer with this phone number already exists",
        });
      }

      return res.status(500).json({
        message: "Failed to add customer",
      });
    }
  }
);

// ============================================================
// UPDATE CUSTOMER
// Admin, Manager and Cashier can update customer contact details.
// ============================================================

router.put(
  "/:id",
  authorizeRoles("admin", "manager", "cashier"),
  (req: AuthRequest, res) => {
    try {
      const customerId = Number(req.params.id);

      if (!customerId || Number.isNaN(customerId)) {
        return res.status(400).json({
          message: "Invalid customer ID",
        });
      }

      const existingCustomer = db
        .prepare(`
          SELECT id
          FROM customers
          WHERE id = ?
        `)
        .get(customerId) as { id: number } | undefined;

      if (!existingCustomer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      const name =
        typeof req.body.name === "string"
          ? req.body.name.trim()
          : "";

      const phone = normalizePhone(req.body.phone);
      const email = normalizeOptionalText(req.body.email);
      const address = normalizeOptionalText(req.body.address);
      const notes = normalizeOptionalText(req.body.notes);

      if (!name) {
        return res.status(400).json({
          message: "Customer name is required",
        });
      }

      if (!validateEmail(email)) {
        return res.status(400).json({
          message: "Enter a valid email address",
        });
      }

      if (phone) {
        const duplicatePhone = db
          .prepare(`
            SELECT id
            FROM customers
            WHERE phone = ?
              AND id != ?
          `)
          .get(phone, customerId) as
          | { id: number }
          | undefined;

        if (duplicatePhone) {
          return res.status(409).json({
            message:
              "Another customer already uses this phone number",
          });
        }
      }

      db.prepare(`
        UPDATE customers
        SET
          name = ?,
          phone = ?,
          email = ?,
          address = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name,
        phone,
        email,
        address,
        notes,
        customerId
      );

      const customer = db
        .prepare(`
          SELECT
            id,
            name,
            phone,
            email,
            address,
            notes,
            created_at,
            updated_at
          FROM customers
          WHERE id = ?
        `)
        .get(customerId);

      return res.json({
        message: "Customer updated successfully",
        customer,
      });
    } catch (error: any) {
      console.error("Update customer error:", error);

      if (
        error?.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return res.status(409).json({
          message:
            "Another customer already uses this phone number",
        });
      }

      return res.status(500).json({
        message: "Failed to update customer",
      });
    }
  }
);

// ============================================================
// DELETE CUSTOMER
// Restricted to Admin / Manager.
// This will later be protected from deletion when linked to sales.
// ============================================================

router.delete(
  "/:id",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    try {
      const customerId = Number(req.params.id);

      if (!customerId || Number.isNaN(customerId)) {
        return res.status(400).json({
          message: "Invalid customer ID",
        });
      }

      const customer = db
        .prepare(`
          SELECT id, name
          FROM customers
          WHERE id = ?
        `)
        .get(customerId) as
        | { id: number; name: string }
        | undefined;

      if (!customer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      db.prepare(`
        DELETE FROM customers
        WHERE id = ?
      `).run(customerId);

      return res.json({
        message: "Customer deleted successfully",
      });
    } catch (error) {
      console.error("Delete customer error:", error);

      return res.status(500).json({
        message: "Failed to delete customer",
      });
    }
  }
);

export default router;
