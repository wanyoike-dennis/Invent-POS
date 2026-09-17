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

type DashboardAccess = {
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

function getDashboardAccess(
  req: AuthRequest,
  organizationId: number
): DashboardAccess | null {
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
      SELECT id, name, code, is_active
      FROM branches
      WHERE id = ?
        AND organization_id = ?
      LIMIT 1
    `)
    .get(branchId, organizationId) as BranchRow | undefined;
}

// ============================================================
// GET DASHBOARD SUMMARY
//
// /api/dashboard
// /api/dashboard?branchId=7
//
// Admin/Manager + multi_branch_reports:
//   no branchId = All Branches
//   branchId    = selected organization branch
//
// Cashier / non-entitled users:
//   always locked to assigned branch.
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user!.organizationId;

    const access = getDashboardAccess(
      req,
      organizationId
    );

    if (!access) {
      return res.status(401).json({
        message:
          "Your account is not assigned to a valid branch",
      });
    }

    const isCashier = access.role === "cashier";

    const isAdminOrManager =
      access.role === "admin" ||
      access.role === "manager";

    const canUseMultiBranchReports =
      isAdminOrManager &&
      access.multiBranchReports;

    const requestedBranchValue =
      typeof req.query.branchId === "string"
        ? req.query.branchId.trim()
        : "";

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
      } else {
        effectiveBranch = null;
        scope = "all_branches";
      }
    } else {
      effectiveBranch = access.homeBranch;
    }

    const branchSaleSql =
      effectiveBranch
        ? "AND s.branch_id = ?"
        : "";

    const branchExpenseSql =
      effectiveBranch
        ? "AND e.branch_id = ?"
        : "";

    const saleScopeParams: Array<number> = [
      organizationId,
    ];

    if (effectiveBranch) {
      saleScopeParams.push(effectiveBranch.id);
    }

    const expenseScopeParams: Array<number> = [
      organizationId,
    ];

    if (effectiveBranch) {
      expenseScopeParams.push(effectiveBranch.id);
    }

    // --------------------------------------------------------
    // TODAY'S GROSS SALES
    // Cashier remains limited to sales personally processed.
    // --------------------------------------------------------

    const grossResult = db
      .prepare(`
        SELECT
          COALESCE(SUM(s.total), 0) AS gross_sales,
          COUNT(*) AS transactions
        FROM sales s
        WHERE DATE(
          COALESCE(
            s.sale_date,
            DATE(s.created_at, 'localtime')
          )
        ) = DATE('now', 'localtime')
          AND s.organization_id = ?
          ${branchSaleSql}
          ${isCashier ? "AND s.sold_by = ?" : ""}
      `)
      .get(
        ...saleScopeParams,
        ...(isCashier && userId ? [userId] : [])
      ) as {
        gross_sales: number;
        transactions: number;
      };

    // --------------------------------------------------------
    // TODAY'S REFUNDS
    // Refunds follow the original sale branch.
    // --------------------------------------------------------

    const refundResult = isCashier
      ? {
          refunds: 0,
          return_transactions: 0,
        }
      : (db
          .prepare(`
            SELECT
              COALESCE(
                SUM(sr.refund_amount),
                0
              ) AS refunds,
              COUNT(*) AS return_transactions
            FROM sales_returns sr
            INNER JOIN sales s
              ON s.id = sr.sale_id
            WHERE DATE(
              sr.created_at,
              'localtime'
            ) = DATE('now', 'localtime')
              AND s.organization_id = ?
              ${branchSaleSql}
          `)
          .get(...saleScopeParams) as {
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
          ${branchSaleSql}
          ${isCashier ? "AND s.sold_by = ?" : ""}
      `)
      .get(
        ...saleScopeParams,
        ...(isCashier && userId ? [userId] : [])
      ) as {
        original_cogs: number;
      };

    const returnedCogsResult = isCashier
      ? { returned_cogs: 0 }
      : (db
          .prepare(`
            SELECT
              COALESCE(
                SUM(
                  sri.quantity * si.cost_price
                ),
                0
              ) AS returned_cogs
            FROM sales_return_items sri
            INNER JOIN sales_returns sr
              ON sr.id = sri.return_id
            INNER JOIN sale_items si
              ON si.id = sri.sale_item_id
            INNER JOIN sales s
              ON s.id = si.sale_id
            WHERE DATE(
              sr.created_at,
              'localtime'
            ) = DATE('now', 'localtime')
              AND s.organization_id = ?
              ${branchSaleSql}
          `)
          .get(...saleScopeParams) as {
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
    // --------------------------------------------------------

    const expenseResult = isCashier
      ? {
          expenses: 0,
          expense_transactions: 0,
        }
      : (db
          .prepare(`
            SELECT
              COALESCE(
                SUM(e.amount),
                0
              ) AS expenses,
              COUNT(*) AS expense_transactions
            FROM expenses e
            WHERE DATE(e.expense_date) =
                  DATE('now', 'localtime')
              AND e.organization_id = ?
              ${branchExpenseSql}
          `)
          .get(...expenseScopeParams) as {
          expenses: number;
          expense_transactions: number;
        });

    const expenses = Number(
      expenseResult.expenses || 0
    );

    const netProfit =
      grossProfit - expenses;

    // --------------------------------------------------------
    // PRODUCT / LOW-STOCK SUMMARY
    //
    // Branch view:
    //   active product catalogue count + selected branch stock.
    //
    // All Branches:
    //   each product is counted once and stock is summed across
    //   all organization branches before low-stock evaluation.
    // --------------------------------------------------------

    const productResult = effectiveBranch
      ? (db
          .prepare(`
            SELECT
              COUNT(*) AS total_products,
              COALESCE(
                SUM(
                  CASE
                    WHEN COALESCE(bi.stock, 0) <= 5
                      THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS low_stock
            FROM products p
            LEFT JOIN branch_inventory bi
              ON bi.product_id = p.id
             AND bi.organization_id = p.organization_id
             AND bi.branch_id = ?
            WHERE p.organization_id = ?
          `)
          .get(
            effectiveBranch.id,
            organizationId
          ) as {
          total_products: number;
          low_stock: number;
        })
      : (db
          .prepare(`
            SELECT
              COUNT(*) AS total_products,
              COALESCE(
                SUM(
                  CASE
                    WHEN COALESCE(stock_totals.stock, 0) <= 5
                      THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS low_stock
            FROM products p
            LEFT JOIN (
              SELECT
                product_id,
                SUM(stock) AS stock
              FROM branch_inventory
              WHERE organization_id = ?
              GROUP BY product_id
            ) stock_totals
              ON stock_totals.product_id = p.id
            WHERE p.organization_id = ?
          `)
          .get(
            organizationId,
            organizationId
          ) as {
          total_products: number;
          low_stock: number;
        });

    // --------------------------------------------------------
    // LAST 7 DAYS SALES / PROFIT
    // --------------------------------------------------------

    const chartSaleBranch =
      effectiveBranch
        ? "AND s.branch_id = ?"
        : "";

    const chartRefundBranch =
      effectiveBranch
        ? "AND rs.branch_id = ?"
        : "";

    const chartCogsBranch =
      effectiveBranch
        ? "AND s2.branch_id = ?"
        : "";

    const chartReturnedCogsBranch =
      effectiveBranch
        ? "AND rs2.branch_id = ?"
        : "";

    const chartExpenseBranch =
      effectiveBranch
        ? "AND e.branch_id = ?"
        : "";

    const chartParams: Array<number> = [];

    chartParams.push(organizationId);
    if (effectiveBranch) {
      chartParams.push(effectiveBranch.id);
    }
    if (isCashier && userId) {
      chartParams.push(userId);
    }

    chartParams.push(organizationId);
    if (effectiveBranch) {
      chartParams.push(effectiveBranch.id);
    }

    chartParams.push(organizationId);
    if (effectiveBranch) {
      chartParams.push(effectiveBranch.id);
    }
    if (isCashier && userId) {
      chartParams.push(userId);
    }

    chartParams.push(organizationId);
    if (effectiveBranch) {
      chartParams.push(effectiveBranch.id);
    }

    chartParams.push(organizationId);
    if (effectiveBranch) {
      chartParams.push(effectiveBranch.id);
    }

    const salesChart = db
      .prepare(`
        WITH RECURSIVE dates(day) AS (
          SELECT DATE(
            'now',
            'localtime',
            '-6 days'
          )

          UNION ALL

          SELECT DATE(day, '+1 day')
          FROM dates
          WHERE day < DATE(
            'now',
            'localtime'
          )
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
                  DATE(
                    s.created_at,
                    'localtime'
                  )
                )
              ) = dates.day
                AND s.organization_id = ?
                ${chartSaleBranch}
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
                ${chartRefundBranch}
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
                  DATE(
                    s2.created_at,
                    'localtime'
                  )
                )
              ) = dates.day
                AND s2.organization_id = ?
                ${chartCogsBranch}
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
                ${chartReturnedCogsBranch}
            ),
            0
          ) AS returned_cogs,

          COALESCE(
            (
              SELECT SUM(e.amount)
              FROM expenses e
              WHERE DATE(e.expense_date) =
                    dates.day
                AND e.organization_id = ?
                ${chartExpenseBranch}
            ),
            0
          ) AS expenses

        FROM dates
        ORDER BY dates.day ASC
      `)
      .all(...chartParams)
      .map((row: any) => {
        const gross = Number(
          row.gross_sales || 0
        );

        const refunded = isCashier
          ? 0
          : Number(row.refunds || 0);

        const dailyOriginalCogs = Number(
          row.original_cogs || 0
        );

        const dailyReturnedCogs = isCashier
          ? 0
          : Number(
              row.returned_cogs || 0
            );

        const dailyNetCogs = Math.max(
          dailyOriginalCogs -
            dailyReturnedCogs,
          0
        );

        const dailyExpenses = isCashier
          ? 0
          : Number(row.expenses || 0);

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
          original_cogs:
            dailyOriginalCogs,
          returned_cogs:
            dailyReturnedCogs,
          net_cogs: dailyNetCogs,
          gross_profit:
            dailyGrossProfit,
          expenses: dailyExpenses,
          net_profit:
            dailyGrossProfit -
            dailyExpenses,
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
          s.branch_id,

          users.name AS sold_by_name,
          branches.name AS branch_name,
          branches.code AS branch_code,

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

        LEFT JOIN branches
          ON branches.id = s.branch_id
         AND branches.organization_id =
             s.organization_id

        WHERE s.organization_id = ?
          ${branchSaleSql}
          ${isCashier ? "AND s.sold_by = ?" : ""}

        ORDER BY s.id DESC
        LIMIT 5
      `)
      .all(
        ...saleScopeParams,
        ...(isCashier && userId ? [userId] : [])
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
                Boolean(
                  effectiveBranch.is_active
                ),
            }
          : null,

        home_branch: {
          id: access.homeBranch.id,
          name: access.homeBranch.name,
          code: access.homeBranch.code,
          is_active:
            Boolean(
              access.homeBranch.is_active
            ),
        },
      },

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
