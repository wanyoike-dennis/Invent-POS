import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

type BranchRow = {
  id: number;
  organization_id: number;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type BranchLimitRow = {
  feature_value: string | null;
};

function getBranchLimit(organizationId: number): number | null {
  const row = db
    .prepare(`
      SELECT spf.feature_value
      FROM organizations o
      INNER JOIN subscription_plans sp
        ON LOWER(sp.code) = LOWER(o.subscription_plan)
        OR LOWER(sp.name) = LOWER(o.subscription_plan)
      INNER JOIN subscription_plan_features spf
        ON spf.plan_id = sp.id
      WHERE o.id = ?
        AND spf.feature_key = 'branches_included'
        AND sp.is_active = 1
      LIMIT 1
    `)
    .get(organizationId) as BranchLimitRow | undefined;

  if (!row?.feature_value) {
    return null;
  }

  const parsed = Number.parseInt(row.feature_value.trim(), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function getActiveBranchCount(organizationId: number): number {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM branches
      WHERE organization_id = ?
        AND is_active = 1
    `)
    .get(organizationId) as { count: number };

  return row.count;
}

function branchLimitResponse(
  res: express.Response,
  organizationId: number
) {
  const limit = getBranchLimit(organizationId);
  const activeBranches = getActiveBranchCount(organizationId);

  if (limit === null) {
    return res.status(403).json({
      message:
        "Your subscription plan does not have a valid branch limit configured. Contact support or update the plan configuration.",
      code: "BRANCH_LIMIT_NOT_CONFIGURED",
      feature: "branches_included",
      activeBranches,
      limit: null,
    });
  }

  if (activeBranches >= limit) {
    return res.status(403).json({
      message: `Your current subscription allows ${limit} active branch${limit === 1 ? "" : "es"}. Deactivate a branch or upgrade your subscription to add another branch.`,
      code: "BRANCH_LIMIT_REACHED",
      feature: "branches_included",
      activeBranches,
      limit,
    });
  }

  return null;
}

// ============================================================
// GET /api/branches
// List branches belonging to the authenticated organization.
// ============================================================
router.get("/", (req: AuthRequest, res) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const branches = db
      .prepare(`
        SELECT
          id,
          organization_id,
          name,
          code,
          phone,
          email,
          address,
          is_active,
          created_at,
          updated_at
        FROM branches
        WHERE organization_id = ?
        ORDER BY is_active DESC, name COLLATE NOCASE ASC
      `)
      .all(organizationId) as BranchRow[];

    const limit = getBranchLimit(organizationId);
    const activeBranches = branches.filter(
      (branch) => branch.is_active === 1
    ).length;

    return res.json({
      branches,
      usage: {
        active: activeBranches,
        limit,
        remaining:
          limit === null ? null : Math.max(limit - activeBranches, 0),
        atLimit:
          limit === null ? true : activeBranches >= limit,
      },
    });
  } catch (error) {
    console.error("Get branches error:", error);
    return res.status(500).json({
      message: "Failed to load branches",
    });
  }
});

// ============================================================
// POST /api/branches
// Create a branch after checking branches_included.
// ============================================================
router.post("/", (req: AuthRequest, res) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const blocked = branchLimitResponse(res, organizationId);
    if (blocked) return blocked;

    const name =
      typeof req.body.name === "string" ? req.body.name.trim() : "";
    const code =
      typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";
    const address =
      typeof req.body.address === "string"
        ? req.body.address.trim()
        : "";

    if (!name) {
      return res.status(400).json({
        message: "Branch name is required",
      });
    }

    if (code) {
      const duplicateCode = db
        .prepare(`
          SELECT id
          FROM branches
          WHERE organization_id = ?
            AND UPPER(code) = UPPER(?)
          LIMIT 1
        `)
        .get(organizationId, code);

      if (duplicateCode) {
        return res.status(409).json({
          message:
            "A branch with this code already exists in your organization.",
          code: "BRANCH_CODE_EXISTS",
        });
      }
    }

    const result = db
      .prepare(`
        INSERT INTO branches (
          organization_id,
          name,
          code,
          phone,
          email,
          address,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `)
      .run(
        organizationId,
        name,
        code || null,
        phone || null,
        email || null,
        address || null
      );

    const branch = db
      .prepare(`
        SELECT *
        FROM branches
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .get(result.lastInsertRowid, organizationId) as BranchRow;

    return res.status(201).json({
      message: "Branch created successfully",
      branch,
    });
  } catch (error) {
    console.error("Create branch error:", error);
    return res.status(500).json({
      message: "Failed to create branch",
    });
  }
});

// ============================================================
// PUT /api/branches/:id
// Edit branch details. Organization ownership is always enforced.
// ============================================================
router.put("/:id", (req: AuthRequest, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const branchId = Number(req.params.id);

    if (!organizationId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Invalid branch ID" });
    }

    const existing = db
      .prepare(`
        SELECT *
        FROM branches
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .get(branchId, organizationId) as BranchRow | undefined;

    if (!existing) {
      return res.status(404).json({
        message: "Branch not found",
      });
    }

    const name =
      typeof req.body.name === "string" ? req.body.name.trim() : "";
    const code =
      typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";
    const address =
      typeof req.body.address === "string"
        ? req.body.address.trim()
        : "";

    if (!name) {
      return res.status(400).json({
        message: "Branch name is required",
      });
    }

    if (code) {
      const duplicateCode = db
        .prepare(`
          SELECT id
          FROM branches
          WHERE organization_id = ?
            AND UPPER(code) = UPPER(?)
            AND id <> ?
          LIMIT 1
        `)
        .get(organizationId, code, branchId);

      if (duplicateCode) {
        return res.status(409).json({
          message:
            "A branch with this code already exists in your organization.",
          code: "BRANCH_CODE_EXISTS",
        });
      }
    }

    db.prepare(`
      UPDATE branches
      SET
        name = ?,
        code = ?,
        phone = ?,
        email = ?,
        address = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND organization_id = ?
    `).run(
      name,
      code || null,
      phone || null,
      email || null,
      address || null,
      branchId,
      organizationId
    );

    const branch = db
      .prepare(`
        SELECT *
        FROM branches
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .get(branchId, organizationId) as BranchRow;

    return res.json({
      message: "Branch updated successfully",
      branch,
    });
  } catch (error) {
    console.error("Update branch error:", error);
    return res.status(500).json({
      message: "Failed to update branch",
    });
  }
});

// ============================================================
// PATCH /api/branches/:id/status
// Soft deactivate/reactivate. Reactivation checks plan capacity.
// ============================================================
router.patch("/:id/status", (req: AuthRequest, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const branchId = Number(req.params.id);

    if (!organizationId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Invalid branch ID" });
    }

    if (typeof req.body.is_active !== "boolean") {
      return res.status(400).json({
        message: "is_active must be true or false",
      });
    }

    const existing = db
      .prepare(`
        SELECT *
        FROM branches
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .get(branchId, organizationId) as BranchRow | undefined;

    if (!existing) {
      return res.status(404).json({
        message: "Branch not found",
      });
    }

    const requestedActive = req.body.is_active;

    if (requestedActive && existing.is_active === 0) {
      const blocked = branchLimitResponse(res, organizationId);
      if (blocked) return blocked;
    }

    if (!requestedActive && existing.is_active === 1) {
      const activeBranches = getActiveBranchCount(organizationId);

      if (activeBranches <= 1) {
        return res.status(400).json({
          message:
            "An organization must keep at least one active branch.",
          code: "LAST_ACTIVE_BRANCH",
        });
      }

      const activeStaff = db
        .prepare(`
          SELECT COUNT(*) AS count
          FROM users
          WHERE organization_id = ?
            AND branch_id = ?
            AND is_active = 1
        `)
        .get(organizationId, branchId) as { count: number };

      if (activeStaff.count > 0) {
        return res.status(409).json({
          message:
            "Reassign active staff before deactivating this branch.",
          code: "BRANCH_HAS_ACTIVE_STAFF",
          activeStaff: activeStaff.count,
        });
      }
    }

    db.prepare(`
      UPDATE branches
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND organization_id = ?
    `).run(requestedActive ? 1 : 0, branchId, organizationId);

    const branch = db
      .prepare(`
        SELECT *
        FROM branches
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .get(branchId, organizationId) as BranchRow;

    const limit = getBranchLimit(organizationId);
    const activeBranches = getActiveBranchCount(organizationId);

    return res.json({
      message: requestedActive
        ? "Branch reactivated successfully"
        : "Branch deactivated successfully",
      branch,
      usage: {
        active: activeBranches,
        limit,
        remaining:
          limit === null ? null : Math.max(limit - activeBranches, 0),
        atLimit:
          limit === null ? true : activeBranches >= limit,
      },
    });
  } catch (error) {
    console.error("Update branch status error:", error);
    return res.status(500).json({
      message: "Failed to update branch status",
    });
  }
});

export default router;
