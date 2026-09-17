import { Router } from "express";
import db from "../database/db.js";
import {
  authorizeRoles,
  type AuthRequest,
} from "../middleware/authMiddleware.js";

const router = Router();

type AuditEntitlementRow = {
  feature_value: string | null;
};

type AuditScopeBranch = {
  id: number;
  name: string;
  code: string | null;
};

const isIncludedFeatureValue = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();

  return (
    normalized === "included" ||
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes"
  );
};

const parseMetadata = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const requireAuditAnalytics = (
  req: AuthRequest,
  res: any,
  next: any
) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const entitlement = db
      .prepare(`
        SELECT
          spf.feature_value
        FROM organizations o
        INNER JOIN subscription_plans sp
          ON LOWER(sp.code) = LOWER(o.subscription_plan)
        INNER JOIN subscription_plan_features spf
          ON spf.plan_id = sp.id
        WHERE o.id = ?
          AND spf.feature_key = 'audit_analytics'
          AND sp.is_active = 1
        LIMIT 1
      `)
      .get(organizationId) as AuditEntitlementRow | undefined;

    if (!isIncludedFeatureValue(entitlement?.feature_value)) {
      return res.status(403).json({
        message:
          "Audit & Analytics is not included in your current subscription plan. Upgrade to Pro to access this feature.",
        code: "PLAN_FEATURE_NOT_INCLUDED",
        feature: "audit_analytics",
      });
    }

    next();
  } catch (error) {
    console.error("Audit entitlement check error:", error);

    return res.status(500).json({
      message: "Failed to verify Audit & Analytics entitlement",
    });
  }
};

router.use(authorizeRoles("admin", "manager"));
router.use(requireAuditAnalytics);

// ============================================================
// FILTER OPTIONS
// GET /api/audit/options
// ============================================================

router.get("/options", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const branches = db
      .prepare(`
        SELECT id, name, code, is_active
        FROM branches
        WHERE organization_id = ?
        ORDER BY is_active DESC, name ASC
      `)
      .all(organizationId);

    const users = db
      .prepare(`
        SELECT id, name, email, role, is_active, branch_id
        FROM users
        WHERE organization_id = ?
        ORDER BY is_active DESC, name ASC
      `)
      .all(organizationId);

    const actions = db
      .prepare(`
        SELECT DISTINCT action
        FROM audit_logs
        WHERE organization_id = ?
        ORDER BY action ASC
      `)
      .all(organizationId)
      .map((row: any) => row.action);

    const entityTypes = db
      .prepare(`
        SELECT DISTINCT entity_type
        FROM audit_logs
        WHERE organization_id = ?
        ORDER BY entity_type ASC
      `)
      .all(organizationId)
      .map((row: any) => row.entity_type);

    return res.json({
      branches,
      users,
      actions,
      entityTypes,
    });
  } catch (error) {
    console.error("Audit options error:", error);

    return res.status(500).json({
      message: "Failed to load audit filter options",
    });
  }
});

// ============================================================
// AUDIT SUMMARY
// GET /api/audit/summary
// Supports ?branchId=&userId=&action=&entityType=&startDate=&endDate=
// ============================================================

router.get("/summary", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const conditions: string[] = ["al.organization_id = ?"];
    const params: any[] = [organizationId];

    const branchId = req.query.branchId
      ? Number(req.query.branchId)
      : null;
    const userId = req.query.userId
      ? Number(req.query.userId)
      : null;
    const action =
      typeof req.query.action === "string"
        ? req.query.action.trim()
        : "";
    const entityType =
      typeof req.query.entityType === "string"
        ? req.query.entityType.trim()
        : "";
    const startDate =
      typeof req.query.startDate === "string"
        ? req.query.startDate.trim()
        : "";
    const endDate =
      typeof req.query.endDate === "string"
        ? req.query.endDate.trim()
        : "";

    if (req.query.branchId !== undefined) {
      if (!Number.isInteger(branchId) || Number(branchId) <= 0) {
        return res.status(400).json({
          message: "Invalid branchId",
        });
      }

      conditions.push("al.branch_id = ?");
      params.push(branchId);
    }

    if (req.query.userId !== undefined) {
      if (!Number.isInteger(userId) || Number(userId) <= 0) {
        return res.status(400).json({
          message: "Invalid userId",
        });
      }

      conditions.push("al.user_id = ?");
      params.push(userId);
    }

    if (action) {
      conditions.push("al.action = ?");
      params.push(action);
    }

    if (entityType) {
      conditions.push("al.entity_type = ?");
      params.push(entityType);
    }

    if (startDate) {
      conditions.push("DATE(al.created_at) >= DATE(?)");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("DATE(al.created_at) <= DATE(?)");
      params.push(endDate);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const totals = db
      .prepare(`
        SELECT
          COUNT(*) AS total_events,
          COUNT(DISTINCT al.user_id) AS active_users,
          COUNT(DISTINCT al.branch_id) AS affected_branches,
          COUNT(DISTINCT al.action) AS action_types
        FROM audit_logs al
        ${where}
      `)
      .get(...params) as any;

    const byAction = db
      .prepare(`
        SELECT
          al.action,
          COUNT(*) AS total
        FROM audit_logs al
        ${where}
        GROUP BY al.action
        ORDER BY total DESC, al.action ASC
        LIMIT 12
      `)
      .all(...params);

    const byEntityType = db
      .prepare(`
        SELECT
          al.entity_type,
          COUNT(*) AS total
        FROM audit_logs al
        ${where}
        GROUP BY al.entity_type
        ORDER BY total DESC, al.entity_type ASC
      `)
      .all(...params);

    const dailyActivity = db
      .prepare(`
        SELECT
          DATE(al.created_at) AS date,
          COUNT(*) AS total
        FROM audit_logs al
        ${where}
        GROUP BY DATE(al.created_at)
        ORDER BY date ASC
      `)
      .all(...params);

    return res.json({
      summary: {
        totalEvents: Number(totals?.total_events || 0),
        activeUsers: Number(totals?.active_users || 0),
        affectedBranches: Number(totals?.affected_branches || 0),
        actionTypes: Number(totals?.action_types || 0),
      },
      byAction,
      byEntityType,
      dailyActivity,
    });
  } catch (error) {
    console.error("Audit summary error:", error);

    return res.status(500).json({
      message: "Failed to load audit summary",
    });
  }
});

// ============================================================
// ACTIVITY FEED
// GET /api/audit
//
// Supports:
// ?search=
// ?branchId=
// ?userId=
// ?action=
// ?entityType=
// ?startDate=
// ?endDate=
// ?page=1
// ?limit=25
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";
    const action =
      typeof req.query.action === "string"
        ? req.query.action.trim()
        : "";
    const entityType =
      typeof req.query.entityType === "string"
        ? req.query.entityType.trim()
        : "";
    const startDate =
      typeof req.query.startDate === "string"
        ? req.query.startDate.trim()
        : "";
    const endDate =
      typeof req.query.endDate === "string"
        ? req.query.endDate.trim()
        : "";

    const page = Math.max(1, Number(req.query.page) || 1);
    const requestedLimit = Number(req.query.limit) || 25;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["al.organization_id = ?"];
    const params: any[] = [organizationId];

    let selectedBranch: AuditScopeBranch | null = null;

    if (req.query.branchId !== undefined) {
      const branchId = Number(req.query.branchId);

      if (!Number.isInteger(branchId) || branchId <= 0) {
        return res.status(400).json({
          message: "Invalid branchId",
        });
      }

      selectedBranch = db
        .prepare(`
          SELECT id, name, code
          FROM branches
          WHERE id = ?
            AND organization_id = ?
          LIMIT 1
        `)
        .get(branchId, organizationId) as
        | AuditScopeBranch
        | undefined || null;

      if (!selectedBranch) {
        return res.status(404).json({
          message: "Branch not found",
        });
      }

      conditions.push("al.branch_id = ?");
      params.push(branchId);
    }

    if (req.query.userId !== undefined) {
      const userId = Number(req.query.userId);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
          message: "Invalid userId",
        });
      }

      const userExists = db
        .prepare(`
          SELECT id
          FROM users
          WHERE id = ?
            AND organization_id = ?
          LIMIT 1
        `)
        .get(userId, organizationId);

      if (!userExists) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      conditions.push("al.user_id = ?");
      params.push(userId);
    }

    if (action) {
      conditions.push("al.action = ?");
      params.push(action);
    }

    if (entityType) {
      conditions.push("al.entity_type = ?");
      params.push(entityType);
    }

    if (startDate) {
      conditions.push("DATE(al.created_at) >= DATE(?)");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("DATE(al.created_at) <= DATE(?)");
      params.push(endDate);
    }

    if (search) {
      conditions.push(`
        (
          al.action LIKE ?
          OR al.entity_type LIKE ?
          OR COALESCE(al.entity_id, '') LIKE ?
          OR COALESCE(al.description, '') LIKE ?
          OR COALESCE(u.name, '') LIKE ?
          OR COALESCE(b.name, '') LIKE ?
        )
      `);

      const searchValue = `%${search}%`;

      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue
      );
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const countRow = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM audit_logs al
        LEFT JOIN users u
          ON u.id = al.user_id
         AND u.organization_id = al.organization_id
        LEFT JOIN branches b
          ON b.id = al.branch_id
         AND b.organization_id = al.organization_id
        ${where}
      `)
      .get(...params) as { total: number };

    const rows = db
      .prepare(`
        SELECT
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.description,
          al.metadata,
          al.created_at,
          al.user_id,
          u.name AS user_name,
          u.email AS user_email,
          u.role AS user_role,
          al.branch_id,
          b.name AS branch_name,
          b.code AS branch_code
        FROM audit_logs al
        LEFT JOIN users u
          ON u.id = al.user_id
         AND u.organization_id = al.organization_id
        LEFT JOIN branches b
          ON b.id = al.branch_id
         AND b.organization_id = al.organization_id
        ${where}
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const events = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      description: row.description,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at,
      user: row.user_id
        ? {
            id: row.user_id,
            name: row.user_name,
            email: row.user_email,
            role: row.user_role,
          }
        : null,
      branch: row.branch_id
        ? {
            id: row.branch_id,
            name: row.branch_name,
            code: row.branch_code,
          }
        : null,
    }));

    return res.json({
      scope: {
        type: selectedBranch ? "branch" : "all_branches",
        branch: selectedBranch,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
      events,
    });
  } catch (error) {
    console.error("Audit activity error:", error);

    return res.status(500).json({
      message: "Failed to load audit activity",
    });
  }
});

export default router;
