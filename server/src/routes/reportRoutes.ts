import express from "express";
import db from "../database/db.js";

const router = express.Router();

// ============================================================
// GET REPORT SUMMARY
// Supports optional startDate and endDate:
// /api/reports
// /api/reports?startDate=2026-09-01&endDate=2026-09-30
// ============================================================

router.get("/", (req, res) => {
  try {
    const startDate =
      typeof req.query.startDate === "string"
        ? req.query.startDate
        : null;

    const endDate =
      typeof req.query.endDate === "string"
        ? req.query.endDate
        : null;

    // --------------------------------------------------------
    // DATE CONDITIONS
    // --------------------------------------------------------

    const saleConditions: string[] = [];
    const returnConditions: string[] = [];
    const expenseConditions: string[] = [];

    const saleParams: string[] = [];
    const returnParams: string[] = [];
    const expenseParams: string[] = [];

    if (startDate) {
      saleConditions.push(
        "DATE(s.created_at, 'localtime') >= DATE(?)"
      );

      returnConditions.push(
        "DATE(sr.created_at, 'localtime') >= DATE(?)"
      );

      expenseConditions.push(
        "DATE(e.expense_date) >= DATE(?)"
      );

      saleParams.push(startDate);
      returnParams.push(startDate);
      expenseParams.push(startDate);
    }

    if (endDate) {
      saleConditions.push(
        "DATE(s.created_at, 'localtime') <= DATE(?)"
      );

      returnConditions.push(
        "DATE(sr.created_at, 'localtime') <= DATE(?)"
      );

      expenseConditions.push(
        "DATE(e.expense_date) <= DATE(?)"
      );

      saleParams.push(endDate);
      returnParams.push(endDate);
      expenseParams.push(endDate);
    }

    const saleWhere =
      saleConditions.length > 0
        ? `WHERE ${saleConditions.join(" AND ")}`
        : "";

    const returnWhere =
      returnConditions.length > 0
        ? `WHERE ${returnConditions.join(" AND ")}`
        : "";

    const expenseWhere =
      expenseConditions.length > 0
        ? `WHERE ${expenseConditions.join(" AND ")}`
        : "";

    // --------------------------------------------------------
    // SALES SUMMARY
    // --------------------------------------------------------

    const salesSummary = db
      .prepare(`
        SELECT
          COALESCE(
            SUM(s.total),
            0
          ) AS gross_sales,

          COUNT(*) AS transactions,

          COALESCE(
            SUM(
              CASE
                WHEN s.payment_method = 'Cash'
                THEN s.total
                ELSE 0
              END
            ),
            0
          ) AS cash_sales,

          COALESCE(
            SUM(
              CASE
                WHEN s.payment_method = 'M-Pesa'
                THEN s.total
                ELSE 0
              END
            ),
            0
          ) AS mpesa_sales

        FROM sales s

        ${saleWhere}
      `)
      .get(...saleParams) as {
        gross_sales: number;
        transactions: number;
        cash_sales: number;
        mpesa_sales: number;
      };

    // --------------------------------------------------------
    // REFUND SUMMARY
    // Refunds use their processing date.
    // Payment method comes from the original sale.
    // --------------------------------------------------------

    const refundSummary = db
      .prepare(`
        SELECT
          COALESCE(
            SUM(sr.refund_amount),
            0
          ) AS refunds,

          COUNT(*) AS return_transactions,

          COALESCE(
            SUM(
              CASE
                WHEN s.payment_method = 'Cash'
                THEN sr.refund_amount
                ELSE 0
              END
            ),
            0
          ) AS cash_refunds,

          COALESCE(
            SUM(
              CASE
                WHEN s.payment_method = 'M-Pesa'
                THEN sr.refund_amount
                ELSE 0
              END
            ),
            0
          ) AS mpesa_refunds

        FROM sales_returns sr

        INNER JOIN sales s
          ON s.id = sr.sale_id

        ${returnWhere}
      `)
      .get(...returnParams) as {
        refunds: number;
        return_transactions: number;
        cash_refunds: number;
        mpesa_refunds: number;
      };

    // --------------------------------------------------------
    // EXPENSE SUMMARY
    // Expenses use expense_date (the actual business expense date).
    // --------------------------------------------------------

    const expenseSummary = db
      .prepare(`
        SELECT
          COALESCE(SUM(e.amount), 0) AS expenses,

          COUNT(*) AS expense_transactions,

          COALESCE(
            SUM(
              CASE
                WHEN e.payment_method = 'Cash'
                THEN e.amount
                ELSE 0
              END
            ),
            0
          ) AS cash_expenses,

          COALESCE(
            SUM(
              CASE
                WHEN e.payment_method = 'M-Pesa'
                THEN e.amount
                ELSE 0
              END
            ),
            0
          ) AS mpesa_expenses

        FROM expenses e

        ${expenseWhere}
      `)
      .get(...expenseParams) as {
        expenses: number;
        expense_transactions: number;
        cash_expenses: number;
        mpesa_expenses: number;
      };

    // --------------------------------------------------------
    // OVERALL TOTALS
    // --------------------------------------------------------

    const grossSales = Number(
      salesSummary.gross_sales || 0
    );

    const refunds = Number(
      refundSummary.refunds || 0
    );

    const netSales = Math.max(
      grossSales - refunds,
      0
    );

    const expenses = Number(
      expenseSummary.expenses || 0
    );

    const netProfit =
      netSales - expenses;

    // --------------------------------------------------------
    // PAYMENT METHOD TOTALS
    // --------------------------------------------------------

    const grossCashSales = Number(
      salesSummary.cash_sales || 0
    );

    const grossMpesaSales = Number(
      salesSummary.mpesa_sales || 0
    );

    const cashRefunds = Number(
      refundSummary.cash_refunds || 0
    );

    const mpesaRefunds = Number(
      refundSummary.mpesa_refunds || 0
    );

    const netCashSales = Math.max(
      grossCashSales - cashRefunds,
      0
    );

    const netMpesaSales = Math.max(
      grossMpesaSales - mpesaRefunds,
      0
    );

    const cashExpenses = Number(
      expenseSummary.cash_expenses || 0
    );

    const mpesaExpenses = Number(
      expenseSummary.mpesa_expenses || 0
    );

    // --------------------------------------------------------
    // DAILY REPORT
    // Combines sales date and refund processing date
    // --------------------------------------------------------

    const dailySales = db
      .prepare(`
        WITH dates AS (
          SELECT
            DATE(
              s.created_at,
              'localtime'
            ) AS day

          FROM sales s

          ${saleWhere}

          UNION

          SELECT
            DATE(
              sr.created_at,
              'localtime'
            ) AS day

          FROM sales_returns sr

          ${returnWhere}

          UNION

          SELECT
            DATE(e.expense_date) AS day

          FROM expenses e

          ${expenseWhere}
        )

        SELECT
          dates.day AS date,

          COALESCE(
            (
              SELECT SUM(s2.total)

              FROM sales s2

              WHERE DATE(
                s2.created_at,
                'localtime'
              ) = dates.day
            ),
            0
          ) AS gross_sales,

          COALESCE(
            (
              SELECT SUM(
                sr2.refund_amount
              )

              FROM sales_returns sr2

              WHERE DATE(
                sr2.created_at,
                'localtime'
              ) = dates.day
            ),
            0
          ) AS refunds,

          COALESCE(
            (
              SELECT SUM(e2.amount)

              FROM expenses e2

              WHERE DATE(
                e2.expense_date
              ) = dates.day
            ),
            0
          ) AS expenses

        FROM dates

        WHERE dates.day IS NOT NULL

        ORDER BY dates.day ASC
      `)
      .all(
        ...saleParams,
        ...returnParams,
        ...expenseParams
      )
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
    // RESPONSE
    // --------------------------------------------------------

    return res.json({
      filters: {
        start_date: startDate,
        end_date: endDate,
      },

      summary: {
        // Overall
        gross_sales: grossSales,

        refunds,

        net_sales: netSales,

        expenses,

        net_profit: netProfit,

        transactions: Number(
          salesSummary.transactions || 0
        ),

        return_transactions: Number(
          refundSummary.return_transactions ||
            0
        ),

        expense_transactions: Number(
          expenseSummary.expense_transactions ||
            0
        ),

        // Cash
        gross_cash_sales:
          grossCashSales,

        cash_refunds:
          cashRefunds,

        net_cash_sales:
          netCashSales,

        cash_expenses:
          cashExpenses,

        // M-Pesa
        gross_mpesa_sales:
          grossMpesaSales,

        mpesa_refunds:
          mpesaRefunds,

        net_mpesa_sales:
          netMpesaSales,

        mpesa_expenses:
          mpesaExpenses,
      },

      daily_sales: dailySales,
    });
  } catch (error) {
    console.error(
      "Reports error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to generate reports",
    });
  }
});

export default router;