import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

type BranchRow = {
  id: number;
  name: string;
  code: string | null;
  is_active: number;
};

type ReportAccess = {
  role: string;
  homeBranch: BranchRow;
  multiBranchReports: boolean;
};

function featureIsIncluded(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return (
    normalized === "included" ||
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes"
  );
}

function getReportAccess(
  req: AuthRequest,
  organizationId: number
): ReportAccess | null {
  const userId = req.user?.id;

  if (!userId) {
    return null;
  }

  const user = db
    .prepare(`
      SELECT
        u.role,
        b.id AS branch_id,
        b.name AS branch_name,
        b.code AS branch_code,
        b.is_active AS branch_is_active
      FROM users u
      INNER JOIN branches b
        ON b.id = u.branch_id
       AND b.organization_id = u.organization_id
      WHERE u.id = ?
        AND u.organization_id = ?
        AND u.is_active = 1
      LIMIT 1
    `)
    .get(userId, organizationId) as
    | {
        role: string;
        branch_id: number;
        branch_name: string;
        branch_code: string | null;
        branch_is_active: number;
      }
    | undefined;

  if (!user) {
    return null;
  }

  const entitlement = db
    .prepare(`
      SELECT spf.feature_value
      FROM organizations o
      INNER JOIN subscription_plans sp
        ON LOWER(sp.code) = LOWER(o.subscription_plan)
      INNER JOIN subscription_plan_features spf
        ON spf.plan_id = sp.id
      WHERE o.id = ?
        AND spf.feature_key = 'multi_branch_reports'
        AND sp.is_active = 1
      LIMIT 1
    `)
    .get(organizationId) as
    | { feature_value: string | null }
    | undefined;

  return {
    role: String(user.role || "").toLowerCase(),
    homeBranch: {
      id: user.branch_id,
      name: user.branch_name,
      code: user.branch_code,
      is_active: Number(user.branch_is_active),
    },
    multiBranchReports: featureIsIncluded(
      entitlement?.feature_value
    ),
  };
}

function getOrganizationBranch(
  organizationId: number,
  branchId: number
) {
  return db
    .prepare(`
      SELECT
        id,
        name,
        code,
        is_active
      FROM branches
      WHERE id = ?
        AND organization_id = ?
      LIMIT 1
    `)
    .get(branchId, organizationId) as BranchRow | undefined;
}

// ============================================================
// GET REPORT SUMMARY
//
// Supports:
// /api/reports
// /api/reports?startDate=2026-09-01&endDate=2026-09-30
// /api/reports?branchId=7
//
// Branch rules:
// - Admin/Manager + multi_branch_reports:
//     no branchId = All Branches
//     branchId    = selected organization branch
// - Everyone else:
//     reports are locked to the user's assigned branch
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const startDate =
      typeof req.query.startDate === "string"
        ? req.query.startDate.trim()
        : null;

    const endDate =
      typeof req.query.endDate === "string"
        ? req.query.endDate.trim()
        : null;

    const requestedBranchValue =
      typeof req.query.branchId === "string"
        ? req.query.branchId.trim()
        : "";

    const access = getReportAccess(
      req,
      organizationId
    );

    if (!access) {
      return res.status(401).json({
        message:
          "Your account is not assigned to a valid branch",
      });
    }

    const isAdminOrManager =
      access.role === "admin" ||
      access.role === "manager";

    const canUseMultiBranchReports =
      isAdminOrManager &&
      access.multiBranchReports;

    let effectiveBranch: BranchRow | null = null;
    let scope: "all_branches" | "branch" = "branch";

    if (canUseMultiBranchReports) {
      if (requestedBranchValue) {
        const requestedBranchId = Number(
          requestedBranchValue
        );

        if (
          !Number.isInteger(requestedBranchId) ||
          requestedBranchId <= 0
        ) {
          return res.status(400).json({
            message: "Invalid branch ID",
          });
        }

        const requestedBranch =
          getOrganizationBranch(
            organizationId,
            requestedBranchId
          );

        if (!requestedBranch) {
          return res.status(404).json({
            message: "Branch not found",
          });
        }

        effectiveBranch = requestedBranch;
        scope = "branch";
      } else {
        effectiveBranch = null;
        scope = "all_branches";
      }
    } else {
      // Starter/non-entitled organizations and non-management
      // roles cannot escape their assigned branch by changing
      // the query string manually.
      effectiveBranch = access.homeBranch;
      scope = "branch";
    }

    // --------------------------------------------------------
    // DATE + BRANCH CONDITIONS
    // --------------------------------------------------------

    const saleConditions: string[] = [
      "s.organization_id = ?",
    ];

    const returnConditions: string[] = [
      "s.organization_id = ?",
    ];

    const expenseConditions: string[] = [
      "e.organization_id = ?",
    ];

    const saleParams: Array<string | number> = [
      organizationId,
    ];

    const returnParams: Array<string | number> = [
      organizationId,
    ];

    const expenseParams: Array<string | number> = [
      organizationId,
    ];

    if (effectiveBranch) {
      saleConditions.push("s.branch_id = ?");
      returnConditions.push("s.branch_id = ?");
      expenseConditions.push("e.branch_id = ?");

      saleParams.push(effectiveBranch.id);
      returnParams.push(effectiveBranch.id);
      expenseParams.push(effectiveBranch.id);
    }

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
      `WHERE ${saleConditions.join(" AND ")}`;

    const returnWhere =
      `WHERE ${returnConditions.join(" AND ")}`;

    const expenseWhere =
      `WHERE ${expenseConditions.join(" AND ")}`;

    // --------------------------------------------------------
    // SALES SUMMARY
    // --------------------------------------------------------

    const salesSummary = db
      .prepare(`
        SELECT
          COALESCE(SUM(s.total), 0) AS gross_sales,

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
    // Refunds belong to the original sale branch and use the
    // refund processing date.
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
        INNER JOIN sales s
          ON s.id = si.sale_id
        ${returnWhere}
      `)
      .get(...returnParams) as {
        returned_cogs: number;
      };

    // --------------------------------------------------------
    // EXPENSE SUMMARY
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
    // The same branch scope is applied to every correlated
    // sales/refund/COGS/expense calculation.
    // --------------------------------------------------------

    const dailyBranchSaleCondition =
      effectiveBranch
        ? "AND s2.branch_id = ?"
        : "";

    const dailyBranchRefundCondition =
      effectiveBranch
        ? "AND rs2.branch_id = ?"
        : "";

    const dailyBranchCogsCondition =
      effectiveBranch
        ? "AND s3.branch_id = ?"
        : "";

    const dailyBranchReturnedCogsCondition =
      effectiveBranch
        ? "AND rs3.branch_id = ?"
        : "";

    const dailyBranchExpenseCondition =
      effectiveBranch
        ? "AND e2.branch_id = ?"
        : "";

    const dailyTailParams: Array<string | number> = [
      organizationId,
    ];

    if (effectiveBranch) {
      dailyTailParams.push(effectiveBranch.id);
    }

    dailyTailParams.push(organizationId);

    if (effectiveBranch) {
      dailyTailParams.push(effectiveBranch.id);
    }

    dailyTailParams.push(organizationId);

    if (effectiveBranch) {
      dailyTailParams.push(effectiveBranch.id);
    }

    dailyTailParams.push(organizationId);

    if (effectiveBranch) {
      dailyTailParams.push(effectiveBranch.id);
    }

    dailyTailParams.push(organizationId);

    if (effectiveBranch) {
      dailyTailParams.push(effectiveBranch.id);
    }

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
          INNER JOIN sales s
            ON s.id = sr.sale_id
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
                AND s2.organization_id = ?
                ${dailyBranchSaleCondition}
            ),
            0
          ) AS gross_sales,

          COALESCE(
            (
              SELECT SUM(sr2.refund_amount)
              FROM sales_returns sr2
              INNER JOIN sales rs2
                ON rs2.id = sr2.sale_id
              WHERE DATE(
                sr2.created_at,
                'localtime'
              ) = dates.day
                AND rs2.organization_id = ?
                ${dailyBranchRefundCondition}
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
                AND s3.organization_id = ?
                ${dailyBranchCogsCondition}
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
              INNER JOIN sales rs3
                ON rs3.id = si3.sale_id
              WHERE DATE(
                sr3.created_at,
                'localtime'
              ) = dates.day
                AND rs3.organization_id = ?
                ${dailyBranchReturnedCogsCondition}
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
                AND e2.organization_id = ?
                ${dailyBranchExpenseCondition}
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
        ...expenseParams,
        ...dailyTailParams
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
        branch_id:
          effectiveBranch?.id ?? null,
      },

      scope: {
        type: scope,
        multi_branch_reports:
          canUseMultiBranchReports,
        branch: effectiveBranch
          ? {
              id: effectiveBranch.id,
              name: effectiveBranch.name,
              code: effectiveBranch.code,
              is_active:
                Boolean(effectiveBranch.is_active),
            }
          : null,
        home_branch: {
          id: access.homeBranch.id,
          name: access.homeBranch.name,
          code: access.homeBranch.code,
          is_active:
            Boolean(access.homeBranch.is_active),
        },
      },

      summary: {
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
          refundSummary.return_transactions || 0
        ),

        expense_transactions: Number(
          expenseSummary.expense_transactions || 0
        ),

        gross_cash_sales: grossCashSales,
        cash_refunds: cashRefunds,
        net_cash_sales: netCashSales,
        cash_expenses: cashExpenses,

        gross_mpesa_sales: grossMpesaSales,
        mpesa_refunds: mpesaRefunds,
        net_mpesa_sales: netMpesaSales,
        mpesa_expenses: mpesaExpenses,
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
