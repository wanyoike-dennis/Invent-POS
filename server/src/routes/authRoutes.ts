import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../database/db.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "invent-pos-secret-key";



type PlanUserLimitRow = {
  plan_name: string;
  users_included: string | null;
};

const getOrganizationUserLimit = (organizationId: number) => {
  const row = db.prepare(`
    SELECT
      sp.name AS plan_name,
      spf.feature_value AS users_included
    FROM organizations o
    INNER JOIN subscription_plans sp
      ON (
        LOWER(sp.code) = LOWER(TRIM(o.subscription_plan))
        OR LOWER(sp.name) = LOWER(TRIM(o.subscription_plan))
      )
    INNER JOIN subscription_plan_features spf
      ON spf.plan_id = sp.id
      AND spf.feature_key = 'users_included'
    WHERE o.id = ?
      AND o.subscription_plan IS NOT NULL
      AND TRIM(o.subscription_plan) <> ''
    LIMIT 1
  `).get(organizationId) as PlanUserLimitRow | undefined;

  if (!row) {
    return null;
  }

  const userLimit = Number(row.users_included);

  if (!Number.isInteger(userLimit) || userLimit <= 0) {
    return null;
  }

  return {
    planName: row.plan_name,
    userLimit,
  };
};

const getActiveOrganizationUserCount = (organizationId: number) => {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE organization_id = ?
      AND is_active = 1
  `).get(organizationId) as { count: number };

  return Number(row.count || 0);
};

const enforceOrganizationUserLimit = (organizationId: number) => {
  const entitlement = getOrganizationUserLimit(organizationId);

  if (!entitlement) {
    return {
      allowed: false,
      status: 403,
      message:
        "Your organization does not have an active user-limit entitlement. Contact Invent POS support.",
    };
  }

  const activeUsers = getActiveOrganizationUserCount(organizationId);

  if (activeUsers >= entitlement.userLimit) {
    return {
      allowed: false,
      status: 403,
      message: `Your ${entitlement.planName} plan allows up to ${entitlement.userLimit} active users. Upgrade your subscription to add more users.`,
    };
  }

  return {
    allowed: true,
    status: 200,
    message: "",
  };
};


type OrganizationBranchRow = {
  id: number;
  name: string;
  code: string | null;
  is_active: number;
};

const getOrganizationBranch = (
  organizationId: number,
  branchId: number
) => {
  return db.prepare(`
    SELECT
      id,
      name,
      code,
      is_active
    FROM branches
    WHERE id = ?
      AND organization_id = ?
    LIMIT 1
  `).get(branchId, organizationId) as
    | OrganizationBranchRow
    | undefined;
};

const getMainOrganizationBranch = (organizationId: number) => {
  return db.prepare(`
    SELECT
      id,
      name,
      code,
      is_active
    FROM branches
    WHERE organization_id = ?
    ORDER BY
      CASE
        WHEN UPPER(COALESCE(code, '')) = 'MAIN' THEN 0
        ELSE 1
      END,
      id ASC
    LIMIT 1
  `).get(organizationId) as
    | OrganizationBranchRow
    | undefined;
};

const createOrganizationSlug = (name: string) => {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "organization";

  let slug = base;
  let suffix = 2;

  while (
    db
      .prepare(`
        SELECT id
        FROM organizations
        WHERE slug = ?
      `)
      .get(slug)
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
};

router.post("/register", async (req, res) => {
  const {
    name,
    email,
    password,
    organizationName,
    businessName,
  } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Name, email and password are required",
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters",
    });
  }

  const normalizedEmail = String(email)
    .trim()
    .toLowerCase();

  const requestedOrganizationName = String(
    organizationName ||
      businessName ||
      `${String(name).trim()}'s Business`
  ).trim();

  if (!requestedOrganizationName) {
    return res.status(400).json({
      message: "Organization name is required",
    });
  }

  try {
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(
      String(password),
      10
    );

    const createOrganizationAndAdmin =
      db.transaction(() => {
        const slug = createOrganizationSlug(
          requestedOrganizationName
        );

        const organizationResult = db
          .prepare(`
            INSERT INTO organizations (
              name,
              slug,
              currency
            )
            VALUES (?, ?, 'KES')
          `)
          .run(
            requestedOrganizationName,
            slug
          );

        const organizationId = Number(
          organizationResult.lastInsertRowid
        );

        db.prepare(`
          INSERT INTO branches (
            organization_id,
            name,
            code,
            is_active
          )
          SELECT ?, 'Main Branch', 'MAIN', 1
          WHERE NOT EXISTS (
            SELECT 1
            FROM branches
            WHERE organization_id = ?
          )
        `).run(organizationId, organizationId);

        const mainBranch = getMainOrganizationBranch(organizationId);

        if (!mainBranch) {
          throw new Error("Failed to create or find the organization's Main Branch");
        }

        const userResult = db
          .prepare(`
            INSERT INTO users (
              name,
              email,
              password,
              role,
              organization_id,
              branch_id
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            String(name).trim(),
            normalizedEmail,
            hashedPassword,
            "admin",
            organizationId,
            mainBranch.id
          );

        return {
          userId: Number(userResult.lastInsertRowid),
          organizationId,
          organizationName:
            requestedOrganizationName,
          organizationSlug: slug,
        };
      });

    const created = createOrganizationAndAdmin();

    return res.status(201).json({
      message:
        "Organization and admin user registered successfully",
      ...created,
    });
  } catch (error) {
    console.error("Register organization error:", error);

    return res.status(500).json({
      message:
        "Failed to register organization",
    });
  }
});


// ============================================================
// GET ORGANIZATION SUBSCRIPTION ENTITLEMENTS
// Authenticated organization users
// ============================================================

router.get(
  "/entitlements",
  authenticateToken,
  (req: AuthRequest, res) => {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        message: "Organization context is missing. Please log in again.",
      });
    }

    try {
      const plan = db.prepare(`
        SELECT
          sp.id,
          sp.name,
          sp.code
        FROM organizations o
        INNER JOIN subscription_plans sp
          ON (
            LOWER(sp.code) = LOWER(TRIM(o.subscription_plan))
            OR LOWER(sp.name) = LOWER(TRIM(o.subscription_plan))
          )
        WHERE o.id = ?
          AND o.subscription_plan IS NOT NULL
          AND TRIM(o.subscription_plan) <> ''
        LIMIT 1
      `).get(organizationId) as
        | {
            id: number;
            name: string;
            code: string;
          }
        | undefined;

      if (!plan) {
        return res.status(404).json({
          message:
            "No subscription plan is assigned to this organization.",
        });
      }

      const featureRows = db.prepare(`
        SELECT
          feature_key,
          feature_value
        FROM subscription_plan_features
        WHERE plan_id = ?
        ORDER BY feature_key ASC
      `).all(plan.id) as Array<{
        feature_key: string;
        feature_value: string | null;
      }>;

      const parseFeatureValue = (
        value: string | null
      ): string | number | boolean | null => {
        if (value === null) {
          return null;
        }

        const trimmed = String(value).trim();
        const lowered = trimmed.toLowerCase();

        if (lowered === "true") {
          return true;
        }

        if (lowered === "false") {
          return false;
        }

        if (
          trimmed !== "" &&
          /^-?\d+(?:\.\d+)?$/.test(trimmed)
        ) {
          return Number(trimmed);
        }

        return trimmed;
      };

      const features = featureRows.reduce<
        Record<string, string | number | boolean | null>
      >((result, feature) => {
        result[feature.feature_key] =
          parseFeatureValue(feature.feature_value);

        return result;
      }, {});

      return res.json({
        plan: {
          id: plan.id,
          name: plan.name,
          code: plan.code,
        },
        features,
      });
    } catch (error) {
      console.error(
        "Fetch organization entitlements error:",
        error
      );

      return res.status(500).json({
        message: "Failed to fetch subscription entitlements",
      });
    }
  }
);


// ============================================================
// CREATE STAFF USER
// Admin only
// ============================================================

router.post(
  "/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req: AuthRequest, res) => {
    const { name, email, password, role, branchId } = req.body;

    if (!name || !email || !password || !role || branchId === undefined || branchId === null || branchId === "") {
      return res.status(400).json({
        message: "Name, email, password, role and branch are required",
      });
    }

    const normalizedBranchId = Number(branchId);

    if (!Number.isInteger(normalizedBranchId) || normalizedBranchId <= 0) {
      return res.status(400).json({
        message: "A valid branch is required",
      });
    }

    const normalizedRole = String(role).trim().toLowerCase();

    const allowedRoles = ["admin", "manager", "cashier"];

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        message: "Role must be admin, manager or cashier",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    try {
      const normalizedEmail = String(email)
        .trim()
        .toLowerCase();

      const existingUser = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(normalizedEmail);

      if (existingUser) {
        return res.status(400).json({
          message: "A user with this email already exists",
        });
      }

      const organizationId =
        req.user?.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          message:
            "Organization context is missing. Please log in again.",
        });
      }

      const selectedBranch = getOrganizationBranch(
        organizationId,
        normalizedBranchId
      );

      if (!selectedBranch) {
        return res.status(400).json({
          message: "The selected branch does not belong to your organization",
        });
      }

      if (Number(selectedBranch.is_active) !== 1) {
        return res.status(400).json({
          message: "Staff cannot be assigned to an inactive branch",
        });
      }

      const limitCheck = enforceOrganizationUserLimit(
        organizationId
      );

      if (!limitCheck.allowed) {
        return res.status(limitCheck.status).json({
          message: limitCheck.message,
        });
      }

      const hashedPassword = await bcrypt.hash(
        String(password),
        10
      );

      const result = db
        .prepare(`
          INSERT INTO users (
            name,
            email,
            password,
            role,
            organization_id,
            branch_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          String(name).trim(),
          normalizedEmail,
          hashedPassword,
          normalizedRole,
          organizationId,
          normalizedBranchId
        );

      const createdUser = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            organization_id,
            branch_id,
            (
              SELECT b.name
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_name,
            (
              SELECT b.code
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_code,
            is_active,
            created_at
          FROM users
          WHERE id = ?
        `)
        .get(result.lastInsertRowid);

      return res.status(201).json({
        message: "User created successfully",
        user: createdUser,
      });
    } catch (error) {
      console.error("Create user error:", error);

      return res.status(500).json({
        message: "Failed to create user",
      });
    }
  }
);

// ============================================================
// LIST ORGANIZATION STAFF
// Admin only
// ============================================================

router.get(
  "/users",
  authenticateToken,
  authorizeRoles("admin"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;

    try {
      const users = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            organization_id,
            branch_id,
            (
              SELECT b.name
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_name,
            (
              SELECT b.code
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_code,
            is_active,
            created_at
          FROM users
          WHERE organization_id = ?
          ORDER BY
            CASE role
              WHEN 'admin' THEN 1
              WHEN 'manager' THEN 2
              WHEN 'cashier' THEN 3
              ELSE 4
            END,
            name ASC
        `)
        .all(organizationId);

      const entitlement = getOrganizationUserLimit(organizationId);
      const activeUsers = getActiveOrganizationUserCount(organizationId);

      return res.json({
        users,
        subscription: entitlement
          ? {
              planName: entitlement.planName,
              usersIncluded: entitlement.userLimit,
              activeUsers,
              remainingUsers: Math.max(entitlement.userLimit - activeUsers, 0),
              overLimit: Math.max(activeUsers - entitlement.userLimit, 0),
              canAddUser: activeUsers < entitlement.userLimit,
            }
          : {
              planName: null,
              usersIncluded: null,
              activeUsers,
              remainingUsers: 0,
              overLimit: 0,
              canAddUser: false,
            },
      });
    } catch (error) {
      console.error("List organization users error:", error);

      return res.status(500).json({
        message: "Failed to fetch organization users",
      });
    }
  }
);

// ============================================================
// UPDATE ORGANIZATION STAFF
// Admin only
// ============================================================

router.put(
  "/users/:id",
  authenticateToken,
  authorizeRoles("admin"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const userId = Number(req.params.id);
    const { name, email, role, branchId } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (!name || !email || !role || branchId === undefined || branchId === null || branchId === "") {
      return res.status(400).json({
        message: "Name, email, role and branch are required",
      });
    }

    const normalizedBranchId = Number(branchId);

    if (!Number.isInteger(normalizedBranchId) || normalizedBranchId <= 0) {
      return res.status(400).json({
        message: "A valid branch is required",
      });
    }

    const normalizedRole = String(role).trim().toLowerCase();
    const allowedRoles = ["admin", "manager", "cashier"];

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        message: "Role must be admin, manager or cashier",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    try {
      const targetUser = db
        .prepare(`
          SELECT id, role
          FROM users
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(userId, organizationId) as
        | { id: number; role: string }
        | undefined;

      if (!targetUser) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      if (
        userId === req.user!.id &&
        normalizedRole !== "admin"
      ) {
        return res.status(400).json({
          message: "You cannot remove your own Admin role",
        });
      }

      const selectedBranch = getOrganizationBranch(
        organizationId,
        normalizedBranchId
      );

      if (!selectedBranch) {
        return res.status(400).json({
          message: "The selected branch does not belong to your organization",
        });
      }

      if (Number(selectedBranch.is_active) !== 1) {
        return res.status(400).json({
          message: "Staff cannot be assigned to an inactive branch",
        });
      }

      const emailOwner = db
        .prepare(`
          SELECT id
          FROM users
          WHERE email = ?
            AND id != ?
        `)
        .get(normalizedEmail, userId);

      if (emailOwner) {
        return res.status(400).json({
          message: "A user with this email already exists",
        });
      }

      db.prepare(`
        UPDATE users
        SET
          name = ?,
          email = ?,
          role = ?,
          branch_id = ?
        WHERE id = ?
          AND organization_id = ?
      `).run(
        String(name).trim(),
        normalizedEmail,
        normalizedRole,
        normalizedBranchId,
        userId,
        organizationId
      );

      const updatedUser = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            organization_id,
            branch_id,
            (
              SELECT b.name
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_name,
            (
              SELECT b.code
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_code,
            is_active,
            created_at
          FROM users
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(userId, organizationId);

      return res.json({
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Update organization user error:", error);

      return res.status(500).json({
        message: "Failed to update user",
      });
    }
  }
);

// ============================================================
// RESET ORGANIZATION STAFF PASSWORD
// Admin only
// ============================================================

router.put(
  "/users/:id/password",
  authenticateToken,
  authorizeRoles("admin"),
  async (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const userId = Number(req.params.id);
    const { password } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    try {
      const targetUser = db
        .prepare(`
          SELECT id
          FROM users
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(userId, organizationId);

      if (!targetUser) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const hashedPassword = await bcrypt.hash(
        String(password),
        10
      );

      db.prepare(`
        UPDATE users
        SET password = ?
        WHERE id = ?
          AND organization_id = ?
      `).run(
        hashedPassword,
        userId,
        organizationId
      );

      return res.json({
        message: "Password reset successfully",
      });
    } catch (error) {
      console.error("Reset user password error:", error);

      return res.status(500).json({
        message: "Failed to reset password",
      });
    }
  }
);

// ============================================================
// ACTIVATE / DEACTIVATE ORGANIZATION STAFF
// Admin only
// Soft status change preserves historical records.
// ============================================================

router.put(
  "/users/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const userId = Number(req.params.id);
    const { isActive } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false",
      });
    }

    if (userId === req.user!.id && !isActive) {
      return res.status(400).json({
        message: "You cannot deactivate your own account",
      });
    }

    try {
      const targetUser = db
        .prepare(`
          SELECT
            id,
            name,
            is_active
          FROM users
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(userId, organizationId) as
        | {
            id: number;
            name: string;
            is_active: number;
          }
        | undefined;

      if (!targetUser) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const isCurrentlyActive =
        Number(targetUser.is_active) === 1;

      if (isActive && !isCurrentlyActive) {
        const assignedBranch = db
          .prepare(`
            SELECT
              b.id,
              b.name,
              b.code,
              b.is_active
            FROM users u
            LEFT JOIN branches b
              ON b.id = u.branch_id
              AND b.organization_id = u.organization_id
            WHERE u.id = ?
              AND u.organization_id = ?
            LIMIT 1
          `)
          .get(userId, organizationId) as
          | {
              id: number | null;
              name: string | null;
              code: string | null;
              is_active: number | null;
            }
          | undefined;

        if (
          !assignedBranch ||
          !assignedBranch.id ||
          Number(assignedBranch.is_active) !== 1
        ) {
          return res.status(409).json({
            message:
              "Reassign this staff member to an active branch before reactivating their account.",
            code: "STAFF_BRANCH_INACTIVE",
          });
        }

        const limitCheck = enforceOrganizationUserLimit(
          organizationId
        );

        if (!limitCheck.allowed) {
          return res.status(limitCheck.status).json({
            message: limitCheck.message,
          });
        }
      }

      db.prepare(`
        UPDATE users
        SET is_active = ?
        WHERE id = ?
          AND organization_id = ?
      `).run(
        isActive ? 1 : 0,
        userId,
        organizationId
      );

      const updatedUser = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            organization_id,
            branch_id,
            (
              SELECT b.name
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_name,
            (
              SELECT b.code
              FROM branches b
              WHERE b.id = users.branch_id
                AND b.organization_id = users.organization_id
            ) AS branch_code,
            is_active,
            created_at
          FROM users
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(userId, organizationId);

      return res.json({
        message: isActive
          ? "User reactivated successfully"
          : "User deactivated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error(
        "Update user status error:",
        error
      );

      return res.status(500).json({
        message: "Failed to update user status",
      });
    }
  }
);

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  const user = db
    .prepare(`
      SELECT
        users.id,
        users.name,
        users.email,
        users.password,
        users.role,
        users.organization_id,
        users.branch_id,
        users.is_active,
        branches.name AS branch_name,
        branches.code AS branch_code,
        branches.is_active AS branch_is_active,
        organizations.name AS organization_name,
        organizations.slug AS organization_slug,
        organizations.currency AS organization_currency,
        organizations.status AS organization_status,
        organizations.trial_ends_at,
        organizations.subscription_expires_at
      FROM users
      LEFT JOIN organizations
        ON organizations.id = users.organization_id
      LEFT JOIN branches
        ON branches.id = users.branch_id
        AND branches.organization_id = users.organization_id
      WHERE users.email = ?
    `)
    .get(email.trim().toLowerCase()) as
    | {
        id: number;
        name: string;
        email: string;
        password: string;
        role: string;
        organization_id: number | null;
        branch_id: number | null;
        is_active: number;
        branch_name: string | null;
        branch_code: string | null;
        branch_is_active: number | null;
        organization_name: string | null;
        organization_slug: string | null;
        organization_currency: string | null;
        organization_status: string | null;
        trial_ends_at: string | null;
        subscription_expires_at: string | null;
      }
    | undefined;

  if (!user) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  if (!user.organization_id) {
    return res.status(403).json({
      message:
        "This user is not assigned to an organization.",
    });
  }

  if (!user.branch_id) {
    return res.status(403).json({
      message:
        "This account is not assigned to a branch. Contact your organization Admin.",
    });
  }

  if (Number(user.branch_is_active) !== 1) {
    return res.status(403).json({
      message:
        "Your assigned branch is inactive. Contact your organization Admin.",
    });
  }

  if (Number(user.is_active) !== 1) {
    return res.status(403).json({
      message:
        "This account has been deactivated. Contact your organization Admin.",
    });
  }

  const organizationStatus = String(
    user.organization_status || "active"
  ).toLowerCase();

  if (organizationStatus === "suspended") {
    return res.status(403).json({
      message:
        "This organization has been suspended. Contact Invent POS support.",
    });
  }

  if (organizationStatus === "expired") {
    return res.status(403).json({
      message:
        "This organization's subscription has expired. Contact Invent POS support.",
    });
  }

  const now = new Date();

  if (
    organizationStatus === "trial" &&
    user.trial_ends_at
  ) {
    const trialEndsAt = new Date(user.trial_ends_at);

    if (
      !Number.isNaN(trialEndsAt.getTime()) &&
      trialEndsAt.getTime() < now.getTime()
    ) {
      return res.status(403).json({
        message:
          "This organization's trial period has ended. Contact Invent POS support.",
      });
    }
  }

  if (
    organizationStatus === "active" &&
    user.subscription_expires_at
  ) {
    const subscriptionExpiresAt = new Date(
      user.subscription_expires_at
    );

    if (
      !Number.isNaN(subscriptionExpiresAt.getTime()) &&
      subscriptionExpiresAt.getTime() < now.getTime()
    ) {
      return res.status(403).json({
        message:
          "This organization's subscription has expired. Contact Invent POS support.",
      });
    }
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordMatches) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      branchId: user.branch_id,
    },
    JWT_SECRET,
    {
      expiresIn: "8h",
    }
  );

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      branchId: user.branch_id,
      branch: {
        id: user.branch_id,
        name: user.branch_name || "Branch",
        code: user.branch_code || "",
      },
      organization: {
        id: user.organization_id,
        name:
          user.organization_name ||
          "Organization",
        slug:
          user.organization_slug || "",
        currency:
          user.organization_currency ||
          "KES",
        status:
          user.organization_status ||
          "active",
        trialEndsAt:
          user.trial_ends_at,
        subscriptionExpiresAt:
          user.subscription_expires_at,
      },
    },
  });
});

export default router;