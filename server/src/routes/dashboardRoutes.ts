import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

// ============================================================
// GET DASHBOARD SUMMARY
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  try {
    const isCashier = req.user?.role === "cashier";
    const userId = req.user?.id;
    const organizationId = req.user!.organizationId;

    // --------------------------------------------------------
    // TODAY'S GROSS SALES
    // --------------------------------------------------------

    const grossResult = db
      .prepare(`
        SELECT
          COALESCE(SUM(total), 0) AS gross_sales,
          COUNT(*) AS transactions
        FROM sales
        WHERE DATE(
                COALESCE(
                  sale_date,
                  DATE(created_at, 'localtime')
                )
              ) = DATE('now', 'localtime')
          AND organization_id = ?
          ${isCashier ? "AND sold_by = ?" : ""}
      `)
      .get(
        organizationId,
        ...(isCashier ? [userId] : [])
      ) as {
        gross_sales: number;
        transactions: number;
      };

    // --------------------------------------------------------
    // TODAY'S REFUNDS
    // Uses refund processing date
    // --------------------------------------------------------

    const refundResult = isCashier
      ? {
          refunds: 0,
          return_transactions: 0,
        }
      : (db
          .prepare(`
            SELECT
              COALESCE(SUM(refund_amount), 0) AS refunds,
              COUNT(*) AS return_transactions
            FROM sales_returns sr
            INNER JOIN sales s
              ON s.id = sr.sale_id
            WHERE DATE(sr.created_at, 'localtime') =
                  DATE('now', 'localtime')
              AND s.organization_id = ?
          `)
          .get(organizationId) as {
            refunds: number;
            return_transactions: number;
          });

    const grossSales = Number(
      grossResult.gross_sales || 0
    );

    const refunds = Number(
      refundResult.refunds || 0
    );

    const netSales = Math.max(
      grossSales - refunds,
      0
    );

    // --------------------------------------------------------
    // TODAY'S COGS
    // Cost is captured historically on sale_items.
    // Returned COGS is reversed on the return processing date.
    // Cashier dashboard remains sales-activity focused.
    // --------------------------------------------------------

    const cogsResult = db
      .prepare(`
        SELECT
          COALESCE(
            SUM(si.quantity * si.cost_price),
            0
          ) AS original_cogs
        FROM sale_items si
        INNER JOIN sales s
          ON s.id = si.sale_id
        WHERE DATE(
                COALESCE(
                  s.sale_date,
                  DATE(s.created_at, 'localtime')
                )
              ) = DATE('now', 'localtime')
          AND s.organization_id = ?
          ${isCashier ? "AND s.sold_by = ?" : ""}
      `)
      .get(
        organizationId,
        ...(isCashier ? [userId] : [])
      ) as {
        original_cogs: number;
      };

    const returnedCogsResult = isCashier
      ? { returned_cogs: 0 }
      : (db
          .prepare(`
            SELECT
              COALESCE(
                SUM(sri.quantity * si.cost_price),
                0
              ) AS returned_cogs
            FROM sales_return_items sri
            INNER JOIN sales_returns sr
              ON sr.id = sri.return_id
            INNER JOIN sale_items si
              ON si.id = sri.sale_item_id
            INNER JOIN sales s
              ON s.id = si.sale_id
            WHERE DATE(sr.created_at, 'localtime') =
                  DATE('now', 'localtime')
              AND s.organization_id = ?
          `)
          .get(organizationId) as {
            returned_cogs: number;
          });

    const originalCogs = Number(
      cogsResult.original_cogs || 0
    );

    const returnedCogs = Number(
      returnedCogsResult.returned_cogs || 0
    );

    const netCogs = Math.max(
      originalCogs - returnedCogs,
      0
    );

    const grossProfit =
      netSales - netCogs;

    // --------------------------------------------------------
    // TODAY'S EXPENSES
    // Uses the actual business expense date
    // --------------------------------------------------------

    const expenseResult = isCashier
      ? {
          expenses: 0,
          expense_transactions: 0,
        }
      : (db
          .prepare(`
            SELECT
              COALESCE(SUM(amount), 0) AS expenses,
              COUNT(*) AS expense_transactions
            FROM expenses
            WHERE DATE(expense_date) =
                  DATE('now', 'localtime')
              AND organization_id = ?
          `)
          .get(organizationId) as {
            expenses: number;
            expense_transactions: number;
          });

    const expenses = Number(
      expenseResult.expenses || 0
    );

    const netProfit =
      grossProfit - expenses;

    // --------------------------------------------------------
    // PRODUCT SUMMARY
    // --------------------------------------------------------

    const productResult = db
      .prepare(`
        SELECT
          COUNT(*) AS total_products,

          COALESCE(
            SUM(
              CASE
                WHEN stock <= 5
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS low_stock
        FROM products
        WHERE organization_id = ?
      `)
      .get(organizationId) as {
        total_products: number;
        low_stock: number;
      };

    // --------------------------------------------------------
    // LAST 7 DAYS SALES
    // Gross sales - refunds processed on each day
    // --------------------------------------------------------

    const salesChart = db
      .prepare(`
        WITH RECURSIVE dates(day) AS (
          SELECT DATE('now', 'localtime', '-6 days')

          UNION ALL

          SELECT DATE(day, '+1 day')
          FROM dates
          WHERE day < DATE('now', 'localtime')
        )

        SELECT
          dates.day AS date,

          COALESCE(
            (
              SELECT SUM(s.total)
              FROM sales s
              WHERE DATE(
                COALESCE(
                  s.sale_date,
                  DATE(s.created_at, 'localtime')
                )
              ) = dates.day
                AND s.organization_id = ?
                ${isCashier ? "AND s.sold_by = ?" : ""}
            ),
            0
          ) AS gross_sales,

          COALESCE(
            (
              SELECT SUM(sr.refund_amount)
              FROM sales_returns sr
              INNER JOIN sales rs
                ON rs.id = sr.sale_id
              WHERE DATE(
                sr.created_at,
                'localtime'
              ) = dates.day
                AND rs.organization_id = ?
            ),
            0
          ) AS refunds,

          COALESCE(
            (
              SELECT SUM(
                si.quantity * si.cost_price
              )
              FROM sale_items si
              INNER JOIN sales s2
                ON s2.id = si.sale_id
              WHERE DATE(
                COALESCE(
                  s2.sale_date,
                  DATE(s2.created_at, 'localtime')
                )
              ) = dates.day
                AND s2.organization_id = ?
                ${isCashier ? "AND s2.sold_by = ?" : ""}
            ),
            0
          ) AS original_cogs,

          COALESCE(
            (
              SELECT SUM(
                sri.quantity * si2.cost_price
              )
              FROM sales_return_items sri
              INNER JOIN sales_returns sr2
                ON sr2.id = sri.return_id
              INNER JOIN sale_items si2
                ON si2.id = sri.sale_item_id
              INNER JOIN sales rs2
                ON rs2.id = si2.sale_id
              WHERE DATE(
                sr2.created_at,
                'localtime'
              ) = dates.day
                AND rs2.organization_id = ?
            ),
            0
          ) AS returned_cogs,

          COALESCE(
            (
              SELECT SUM(e.amount)
              FROM expenses e
              WHERE DATE(
                e.expense_date
              ) = dates.day
                AND e.organization_id = ?
            ),
            0
          ) AS expenses

        FROM dates

        ORDER BY dates.day ASC
      `)
      .all(
        organizationId,
        ...(isCashier ? [userId] : []),
        organizationId,
        organizationId,
        ...(isCashier ? [userId] : []),
        organizationId,
        organizationId
      )
      .map((row: any) => {
        const gross = Number(
          row.gross_sales || 0
        );

        const refunded = Number(
          row.refunds || 0
        );

        const dailyOriginalCogs = Number(
          row.original_cogs || 0
        );

        const dailyReturnedCogs = isCashier
          ? 0
          : Number(row.returned_cogs || 0);

        const dailyNetCogs = Math.max(
          dailyOriginalCogs - dailyReturnedCogs,
          0
        );

        const dailyExpenses = Number(
          row.expenses || 0
        );

        const dailyNetSales = Math.max(
          gross - refunded,
          0
        );

        const dailyGrossProfit =
          dailyNetSales - dailyNetCogs;

        return {
          date: row.date,
          gross_sales: gross,
          refunds: refunded,
          net_sales: dailyNetSales,
          original_cogs: dailyOriginalCogs,
          returned_cogs: dailyReturnedCogs,
          net_cogs: dailyNetCogs,
          gross_profit: dailyGrossProfit,
          expenses: dailyExpenses,
          net_profit:
            dailyGrossProfit - dailyExpenses,
        };
      });

    // --------------------------------------------------------
    // RECENT SALES
    // --------------------------------------------------------

    const recentSales = db
      .prepare(`
        SELECT
          s.id,
          s.receipt_number,
          s.total,
          s.payment_method,
          s.cash_amount,
          s.mpesa_amount,
          s.mpesa_code,
          s.sale_date,
          s.is_backdated,
          s.created_at,

          users.name AS sold_by_name,

          COALESCE(
            (
              SELECT SUM(sr.refund_amount)
              FROM sales_returns sr
              WHERE sr.sale_id = s.id
            ),
            0
          ) AS refunded_amount

        FROM sales s

        LEFT JOIN users
          ON users.id = s.sold_by

        WHERE s.organization_id = ?
        ${isCashier ? "AND s.sold_by = ?" : ""}

        ORDER BY s.id DESC

        LIMIT 5
      `)
      .all(
        organizationId,
        ...(isCashier ? [userId] : [])
      )
      .map((sale: any) => {
        const originalTotal = Number(
          sale.total
        );

        const refundedAmount = Number(
          sale.refunded_amount || 0
        );

        return {
          ...sale,

          total: originalTotal,

          refunded_amount:
            refundedAmount,

          net_total: Math.max(
            originalTotal -
              refundedAmount,
            0
          ),
        };
      });

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.json({
      today: {
        gross_sales: grossSales,
        refunds,
        net_sales: netSales,
        original_cogs: originalCogs,
        returned_cogs: returnedCogs,
        net_cogs: netCogs,
        gross_profit: grossProfit,
        expenses,
        net_profit: netProfit,

        transactions: Number(
          grossResult.transactions || 0
        ),

        return_transactions: Number(
          refundResult.return_transactions ||
            0
        ),

        expense_transactions: Number(
          expenseResult.expense_transactions ||
            0
        ),
      },

      products: {
        total: Number(
          productResult.total_products || 0
        ),

        low_stock: Number(
          productResult.low_stock || 0
        ),
      },

      sales_chart: salesChart,

      recent_sales: recentSales,
    });
  } catch (error) {
    console.error(
      "Dashboard summary error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load dashboard summary",
    });
  }
});

export default router;