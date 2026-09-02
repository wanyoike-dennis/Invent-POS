import express from "express";
import db from "../database/db.js";

const router = express.Router();

// ============================================================
// GET DASHBOARD SUMMARY
// ============================================================

router.get("/", (req, res) => {
  try {
    // --------------------------------------------------------
    // TODAY'S GROSS SALES
    // --------------------------------------------------------

    const grossResult = db
      .prepare(`
        SELECT
          COALESCE(SUM(total), 0) AS gross_sales,
          COUNT(*) AS transactions
        FROM sales
        WHERE DATE(created_at, 'localtime') =
              DATE('now', 'localtime')
      `)
      .get() as {
        gross_sales: number;
        transactions: number;
      };

    // --------------------------------------------------------
    // TODAY'S REFUNDS
    // Uses refund processing date
    // --------------------------------------------------------

    const refundResult = db
      .prepare(`
        SELECT
          COALESCE(SUM(refund_amount), 0) AS refunds,
          COUNT(*) AS return_transactions
        FROM sales_returns
        WHERE DATE(created_at, 'localtime') =
              DATE('now', 'localtime')
      `)
      .get() as {
        refunds: number;
        return_transactions: number;
      };

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
    // TODAY'S EXPENSES
    // Uses the actual business expense date
    // --------------------------------------------------------

    const expenseResult = db
      .prepare(`
        SELECT
          COALESCE(SUM(amount), 0) AS expenses,
          COUNT(*) AS expense_transactions
        FROM expenses
        WHERE DATE(expense_date) =
              DATE('now', 'localtime')
      `)
      .get() as {
        expenses: number;
        expense_transactions: number;
      };

    const expenses = Number(
      expenseResult.expenses || 0
    );

    const netProfit =
      netSales - expenses;

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
      `)
      .get() as {
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
                s.created_at,
                'localtime'
              ) = dates.day
            ),
            0
          ) AS gross_sales,

          COALESCE(
            (
              SELECT SUM(sr.refund_amount)
              FROM sales_returns sr
              WHERE DATE(
                sr.created_at,
                'localtime'
              ) = dates.day
            ),
            0
          ) AS refunds,

          COALESCE(
            (
              SELECT SUM(e.amount)
              FROM expenses e
              WHERE DATE(
                e.expense_date
              ) = dates.day
            ),
            0
          ) AS expenses

        FROM dates

        ORDER BY dates.day ASC
      `)
      .all()
      .map((row: any) => {
        const gross = Number(
          row.gross_sales || 0
        );

        const refunded = Number(
          row.refunds || 0
        );

        const dailyExpenses = Number(
          row.expenses || 0
        );

        const dailyNetSales = Math.max(
          gross - refunded,
          0
        );

        return {
          date: row.date,
          gross_sales: gross,
          refunds: refunded,
          net_sales: dailyNetSales,
          expenses: dailyExpenses,
          net_profit:
            dailyNetSales - dailyExpenses,
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

        ORDER BY s.id DESC

        LIMIT 5
      `)
      .all()
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