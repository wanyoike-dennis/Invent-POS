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
        "DATE(COALESCE(s.sale_date, DATE(s.created_at, 'localtime'))) >= DATE(?)"
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
        "DATE(COALESCE(s.sale_date, DATE(s.created_at, 'localtime'))) <= DATE(?)"
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
                WHEN s.payment_method = 'Split'
                  THEN s.cash_amount
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
                WHEN s.payment_method = 'Split'
                  THEN s.mpesa_amount
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
                WHEN s.payment_method = 'Split'
                  THEN sr.refund_amount *
                    CASE
                      WHEN s.total > 0
                        THEN s.cash_amount / s.total
                      ELSE 0
                    END
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
                WHEN s.payment_method = 'Split'
                  THEN sr.refund_amount *
                    CASE
                      WHEN s.total > 0
                        THEN s.mpesa_amount / s.total
                      ELSE 0
                    END
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
    // COGS SUMMARY
    // Original COGS follows the sale date.
    // Returned COGS follows the refund processing date.
    // --------------------------------------------------------

    const cogsSummary = db
      .prepare(`
        SELECT
          COALESCE(
            SUM(si.quantity * si.cost_price),
            0
          ) AS original_cogs
        FROM sale_items si
        INNER JOIN sales s
          ON s.id = si.sale_id
        ${saleWhere}
      `)
      .get(...saleParams) as {
        original_cogs: number;
      };

    const returnedCogsSummary = db
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
        ${returnWhere}
      `)
      .get(...returnParams) as {
        returned_cogs: number;
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

    const originalCogs = Number(
      cogsSummary.original_cogs || 0
    );

    const returnedCogs = Number(
      returnedCogsSummary.returned_cogs || 0
    );

    const netCogs = Math.max(
      originalCogs - returnedCogs,
      0
    );

    const grossProfit =
      netSales - netCogs;

    const expenses = Number(
      expenseSummary.expenses || 0
    );

    const netProfit =
      grossProfit - expenses;

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
              COALESCE(
                s.sale_date,
                DATE(s.created_at, 'localtime')
              )
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
                COALESCE(
                  s2.sale_date,
                  DATE(s2.created_at, 'localtime')
                )
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
              SELECT SUM(
                si2.quantity * si2.cost_price
              )
              FROM sale_items si2
              INNER JOIN sales s3
                ON s3.id = si2.sale_id
              WHERE DATE(
                COALESCE(
                  s3.sale_date,
                  DATE(s3.created_at, 'localtime')
                )
              ) = dates.day
            ),
            0
          ) AS original_cogs,

          COALESCE(
            (
              SELECT SUM(
                sri2.quantity * si3.cost_price
              )
              FROM sales_return_items sri2
              INNER JOIN sales_returns sr3
                ON sr3.id = sri2.return_id
              INNER JOIN sale_items si3
                ON si3.id = sri2.sale_item_id
              WHERE DATE(
                sr3.created_at,
                'localtime'
              ) = dates.day
            ),
            0
          ) AS returned_cogs,

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

        const dailyOriginalCogs = Number(
          row.original_cogs || 0
        );

        const dailyReturnedCogs = Number(
          row.returned_cogs || 0
        );

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

        original_cogs: originalCogs,

        returned_cogs: returnedCogs,

        net_cogs: netCogs,

        gross_profit: grossProfit,

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