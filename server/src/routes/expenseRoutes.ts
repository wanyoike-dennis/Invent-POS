import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

// ============================================================
// CREATE EXPENSE
// POST /api/expenses
// ============================================================

router.post("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const {
      title,
      category,
      amount,
      paymentMethod,
      description,
      expenseDate,
    } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim()
    ) {
      return res.status(400).json({
        message: "Expense title is required",
      });
    }

    if (
      typeof category !== "string" ||
      !category.trim()
    ) {
      return res.status(400).json({
        message: "Expense category is required",
      });
    }

    const parsedAmount = Number(amount);

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      return res.status(400).json({
        message:
          "Expense amount must be greater than 0",
      });
    }

    if (
      paymentMethod !== "Cash" &&
      paymentMethod !== "M-Pesa"
    ) {
      return res.status(400).json({
        message:
          "Payment method must be Cash or M-Pesa",
      });
    }

    if (
      typeof expenseDate !== "string" ||
      !expenseDate.trim()
    ) {
      return res.status(400).json({
        message: "Expense date is required",
      });
    }

    const dateIsValid =
      /^\d{4}-\d{2}-\d{2}$/.test(expenseDate);

    if (!dateIsValid) {
      return res.status(400).json({
        message:
          "Expense date must use YYYY-MM-DD format",
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const result = db
      .prepare(`
        INSERT INTO expenses (
          title,
          category,
          amount,
          payment_method,
          description,
          recorded_by,
          expense_date,
          organization_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        title.trim(),
        category.trim(),
        parsedAmount,
        paymentMethod,
        typeof description === "string" &&
        description.trim()
          ? description.trim()
          : null,
        req.user.id,
        expenseDate,
        organizationId
      );

    const expense = db
      .prepare(`
        SELECT
          expenses.*,
          users.name AS recorded_by_name
        FROM expenses
        LEFT JOIN users
          ON users.id = expenses.recorded_by
        WHERE expenses.id = ?
          AND expenses.organization_id = ?
      `)
      .get(
        result.lastInsertRowid,
        organizationId
      );

    return res.status(201).json({
      message: "Expense recorded successfully",
      expense,
    });
  } catch (error) {
    console.error(
      "Create expense error:",
      error
    );

    return res.status(500).json({
      message: "Failed to record expense",
    });
  }
});

// ============================================================
// GET EXPENSES
// GET /api/expenses
//
// Supports:
// ?search=
// ?category=
// ?paymentMethod=
// ?startDate=
// ?endDate=
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const category =
      typeof req.query.category === "string"
        ? req.query.category.trim()
        : "";

    const paymentMethod =
      typeof req.query.paymentMethod === "string"
        ? req.query.paymentMethod.trim()
        : "";

    const startDate =
      typeof req.query.startDate === "string"
        ? req.query.startDate.trim()
        : "";

    const endDate =
      typeof req.query.endDate === "string"
        ? req.query.endDate.trim()
        : "";

    const conditions: string[] = [
      "expenses.organization_id = ?",
    ];
    const params: any[] = [
      organizationId,
    ];

    if (search) {
      conditions.push(`
        (
          expenses.title LIKE ?
          OR expenses.category LIKE ?
          OR COALESCE(
            expenses.description,
            ''
          ) LIKE ?
        )
      `);

      const value = `%${search}%`;

      params.push(
        value,
        value,
        value
      );
    }

    if (category) {
      conditions.push(
        "expenses.category = ?"
      );

      params.push(category);
    }

    if (paymentMethod) {
      if (
        paymentMethod !== "Cash" &&
        paymentMethod !== "M-Pesa"
      ) {
        return res.status(400).json({
          message:
            "Payment method must be Cash or M-Pesa",
        });
      }

      conditions.push(
        "expenses.payment_method = ?"
      );

      params.push(paymentMethod);
    }

    if (startDate) {
      conditions.push(
        "DATE(expenses.expense_date) >= DATE(?)"
      );

      params.push(startDate);
    }

    if (endDate) {
      conditions.push(
        "DATE(expenses.expense_date) <= DATE(?)"
      );

      params.push(endDate);
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const expenses = db
      .prepare(`
        SELECT
          expenses.*,
          users.name AS recorded_by_name
        FROM expenses
        LEFT JOIN users
          ON users.id = expenses.recorded_by
        ${where}
        ORDER BY
          expenses.expense_date DESC,
          expenses.id DESC
      `)
      .all(...params);

    const summary = db
      .prepare(`
        SELECT
          COUNT(*) AS total_expenses,

          COALESCE(
            SUM(expenses.amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(
              CASE
                WHEN expenses.payment_method = 'Cash'
                THEN expenses.amount
                ELSE 0
              END
            ),
            0
          ) AS cash_expenses,

          COALESCE(
            SUM(
              CASE
                WHEN expenses.payment_method = 'M-Pesa'
                THEN expenses.amount
                ELSE 0
              END
            ),
            0
          ) AS mpesa_expenses

        FROM expenses

        ${where}
      `)
      .get(...params) as {
        total_expenses: number;
        total_amount: number;
        cash_expenses: number;
        mpesa_expenses: number;
      };

    return res.json({
      filters: {
        search,
        category,
        payment_method: paymentMethod,
        start_date: startDate || null,
        end_date: endDate || null,
      },

      summary: {
        total_expenses: Number(
          summary.total_expenses || 0
        ),

        total_amount: Number(
          summary.total_amount || 0
        ),

        cash_expenses: Number(
          summary.cash_expenses || 0
        ),

        mpesa_expenses: Number(
          summary.mpesa_expenses || 0
        ),
      },

      expenses,
    });
  } catch (error) {
    console.error(
      "Get expenses error:",
      error
    );

    return res.status(500).json({
      message: "Failed to fetch expenses",
    });
  }
});

// ============================================================
// UPDATE EXPENSE
// PUT /api/expenses/:id
// ============================================================

router.put("/:id", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const expenseId = Number(req.params.id);

    if (
      !Number.isInteger(expenseId) ||
      expenseId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid expense ID",
      });
    }

    const existingExpense = db
      .prepare(`
        SELECT *
        FROM expenses
        WHERE id = ?
          AND organization_id = ?
      `)
      .get(
        expenseId,
        organizationId
      );

    if (!existingExpense) {
      return res.status(404).json({
        message: "Expense not found",
      });
    }

    const {
      title,
      category,
      amount,
      paymentMethod,
      description,
      expenseDate,
    } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim()
    ) {
      return res.status(400).json({
        message: "Expense title is required",
      });
    }

    if (
      typeof category !== "string" ||
      !category.trim()
    ) {
      return res.status(400).json({
        message: "Expense category is required",
      });
    }

    const parsedAmount = Number(amount);

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      return res.status(400).json({
        message:
          "Expense amount must be greater than 0",
      });
    }

    if (
      paymentMethod !== "Cash" &&
      paymentMethod !== "M-Pesa"
    ) {
      return res.status(400).json({
        message:
          "Payment method must be Cash or M-Pesa",
      });
    }

    if (
      typeof expenseDate !== "string" ||
      !expenseDate.trim()
    ) {
      return res.status(400).json({
        message: "Expense date is required",
      });
    }

    const dateIsValid =
      /^\d{4}-\d{2}-\d{2}$/.test(expenseDate);

    if (!dateIsValid) {
      return res.status(400).json({
        message:
          "Expense date must use YYYY-MM-DD format",
      });
    }

    db.prepare(`
      UPDATE expenses

      SET
        title = ?,
        category = ?,
        amount = ?,
        payment_method = ?,
        description = ?,
        expense_date = ?

      WHERE id = ?
        AND organization_id = ?
    `).run(
      title.trim(),
      category.trim(),
      parsedAmount,
      paymentMethod,
      typeof description === "string" &&
      description.trim()
        ? description.trim()
        : null,
      expenseDate,
      expenseId,
      organizationId
    );

    const updatedExpense = db
      .prepare(`
        SELECT
          expenses.*,
          users.name AS recorded_by_name

        FROM expenses

        LEFT JOIN users
          ON users.id = expenses.recorded_by

        WHERE expenses.id = ?
          AND expenses.organization_id = ?
      `)
      .get(
        expenseId,
        organizationId
      );

    return res.json({
      message:
        "Expense updated successfully",

      expense: updatedExpense,
    });
  } catch (error) {
    console.error(
      "Update expense error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to update expense",
    });
  }
});

// ============================================================
// DELETE EXPENSE
// DELETE /api/expenses/:id
// ============================================================

router.delete("/:id", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const expenseId = Number(req.params.id);

    if (
      !Number.isInteger(expenseId) ||
      expenseId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid expense ID",
      });
    }

    const expense = db
      .prepare(`
        SELECT *
        FROM expenses
        WHERE id = ?
          AND organization_id = ?
      `)
      .get(
        expenseId,
        organizationId
      );

    if (!expense) {
      return res.status(404).json({
        message: "Expense not found",
      });
    }

    db.prepare(`
      DELETE FROM expenses
      WHERE id = ?
        AND organization_id = ?
    `).run(
      expenseId,
      organizationId
    );

    return res.json({
      message:
        "Expense deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete expense error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to delete expense",
    });
  }
});

export default router;