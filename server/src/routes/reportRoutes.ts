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

    const saleParams: string[] = [];
    const returnParams: string[] = [];

    if (startDate) {
      saleConditions.push(
        "DATE(s.created_at, 'localtime') >= DATE(?)"
      );

      returnConditions.push(
        "DATE(sr.created_at, 'localtime') >= DATE(?)"
      );

      saleParams.push(startDate);
      returnParams.push(startDate);
    }

    if (endDate) {
      saleConditions.push(
        "DATE(s.created_at, 'localtime') <= DATE(?)"
      );

      returnConditions.push(
        "DATE(sr.created_at, 'localtime') <= DATE(?)"
      );

      saleParams.push(endDate);
      returnParams.push(endDate);
    }

    const saleWhere =
      saleConditions.length > 0
        ? `WHERE ${saleConditions.join(" AND ")}`
        : "";

    const returnWhere =
      returnConditions.length > 0
        ? `WHERE ${returnConditions.join(" AND ")}`
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
          ) AS refunds

        FROM dates

        WHERE dates.day IS NOT NULL

        ORDER BY dates.day ASC
      `)
      .all(
        ...saleParams,
        ...returnParams
      )
      .map((row: any) => {
        const gross = Number(
          row.gross_sales || 0
        );

        const refunded = Number(
          row.refunds || 0
        );

        return {
          date: row.date,

          gross_sales: gross,

          refunds: refunded,

          net_sales: Math.max(
            gross - refunded,
            0
          ),
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

        transactions: Number(
          salesSummary.transactions || 0
        ),

        return_transactions: Number(
          refundSummary.return_transactions ||
            0
        ),

        // Cash
        gross_cash_sales:
          grossCashSales,

        cash_refunds:
          cashRefunds,

        net_cash_sales:
          netCashSales,

        // M-Pesa
        gross_mpesa_sales:
          grossMpesaSales,

        mpesa_refunds:
          mpesaRefunds,

        net_mpesa_sales:
          netMpesaSales,
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