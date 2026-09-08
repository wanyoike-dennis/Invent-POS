import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../database/db.js";

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "dev_secret_change_me";

const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const SUPER_ADMIN_PASSWORD_HASH =
  process.env.SUPER_ADMIN_PASSWORD_HASH;

type SuperAdminToken = {
  id: string;
  email: string;
  role: "super_admin";
  scope: "platform";
};

type SuperAdminRequest = express.Request & {
  superAdmin?: SuperAdminToken;
};

const authenticateSuperAdmin = (
  req: SuperAdminRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Access denied. No token provided.",
    });
  }

  const [scheme, token] = authHeader.split(" ");

  if (
    scheme !== "Bearer" ||
    !token
  ) {
    return res.status(401).json({
      message: "Invalid authorization header.",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    ) as SuperAdminToken;

    if (
      decoded.role !== "super_admin" ||
      decoded.scope !== "platform"
    ) {
      return res.status(403).json({
        message: "Super Admin access required",
      });
    }

    req.superAdmin = decoded;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired Super Admin token.",
    });
  }
};

// ============================================================
// SUPER ADMIN LOGIN
// Separate from organization user accounts.
// Credentials come from server environment variables.
// ============================================================

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  if (
    !SUPER_ADMIN_EMAIL ||
    !SUPER_ADMIN_PASSWORD_HASH
  ) {
    return res.status(503).json({
      message:
        "Super Admin account is not configured on this server",
    });
  }

  const normalizedEmail = String(email)
    .trim()
    .toLowerCase();

  if (normalizedEmail !== SUPER_ADMIN_EMAIL) {
    return res.status(401).json({
      message: "Invalid credentials",
    });
  }

  try {
    const passwordMatches = await bcrypt.compare(
      String(password),
      SUPER_ADMIN_PASSWORD_HASH
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        id: "platform-owner",
        email: SUPER_ADMIN_EMAIL,
        role: "super_admin",
        scope: "platform",
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({
      message: "Super Admin login successful",
      token,
      user: {
        id: "platform-owner",
        email: SUPER_ADMIN_EMAIL,
        role: "super_admin",
      },
    });
  } catch (error) {
    console.error("Super Admin login error:", error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
});

// Everything below this point requires platform-owner access.
router.use(authenticateSuperAdmin);

// ============================================================
// ONBOARD NEW ORGANIZATION
// Creates the organization and its first Admin in one transaction.
// ============================================================

router.post(
  "/organizations/onboard",
  async (req, res) => {
    const {
      organizationName,
      adminName,
      adminEmail,
      adminPassword,
      status,
      trialEndsAt,
      subscriptionExpiresAt,
      phone,
      email,
      address,
    } = req.body;

    const cleanOrganizationName = String(
      organizationName || ""
    ).trim();

    const cleanAdminName = String(
      adminName || ""
    ).trim();

    const normalizedAdminEmail = String(
      adminEmail || ""
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = String(
      status || "trial"
    )
      .trim()
      .toLowerCase();

    if (
      !cleanOrganizationName ||
      !cleanAdminName ||
      !normalizedAdminEmail ||
      !adminPassword
    ) {
      return res.status(400).json({
        message:
          "Organization name, Admin name, Admin email and Admin password are required",
      });
    }

    if (
      String(adminPassword).length < 6
    ) {
      return res.status(400).json({
        message:
          "Admin password must be at least 6 characters",
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedAdminEmail
      )
    ) {
      return res.status(400).json({
        message:
          "Enter a valid Admin email address",
      });
    }

    const allowedStatuses = [
      "active",
      "trial",
      "suspended",
      "expired",
    ];

    if (
      !allowedStatuses.includes(
        normalizedStatus
      )
    ) {
      return res.status(400).json({
        message:
          "Status must be active, trial, suspended or expired",
      });
    }

    const normalizeDate = (
      value: unknown,
      fieldName: string
    ) => {
      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        return null;
      }

      const date = new Date(
        String(value)
      );

      if (
        Number.isNaN(date.getTime())
      ) {
        throw new Error(
          `${fieldName} must be a valid date`
        );
      }

      return date.toISOString();
    };

    const cleanOptionalText = (
      value: unknown
    ) => {
      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      const cleaned = String(
        value
      ).trim();

      return cleaned || null;
    };

    try {
      const existingUser = db
        .prepare(`
          SELECT id
          FROM users
          WHERE email = ?
          LIMIT 1
        `)
        .get(normalizedAdminEmail);

      if (existingUser) {
        return res.status(400).json({
          message:
            "A user with this Admin email already exists",
        });
      }

      let normalizedTrialEndsAt:
        | string
        | null;

      let normalizedSubscriptionExpiresAt:
        | string
        | null;

      try {
        normalizedTrialEndsAt =
          normalizeDate(
            trialEndsAt,
            "Trial end date"
          );

        normalizedSubscriptionExpiresAt =
          normalizeDate(
            subscriptionExpiresAt,
            "Subscription expiry date"
          );
      } catch (dateError) {
        return res.status(400).json({
          message:
            dateError instanceof Error
              ? dateError.message
              : "Invalid date",
        });
      }

      if (
        normalizedStatus === "trial" &&
        !normalizedTrialEndsAt
      ) {
        return res.status(400).json({
          message:
            "Trial end date is required for a trial organization",
        });
      }

      const baseSlug =
        cleanOrganizationName
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            "-"
          )
          .replace(
            /^-+|-+$/g,
            ""
          ) || "organization";

      let slug = baseSlug;
      let suffix = 2;

      while (
        db
          .prepare(`
            SELECT id
            FROM organizations
            WHERE slug = ?
            LIMIT 1
          `)
          .get(slug)
      ) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      const hashedPassword =
        await bcrypt.hash(
          String(adminPassword),
          12
        );

      const createOrganization =
        db.transaction(() => {
          const organizationResult =
            db
              .prepare(`
                INSERT INTO organizations (
                  name,
                  slug,
                  phone,
                  email,
                  address,
                  currency,
                  status,
                  trial_ends_at,
                  subscription_expires_at
                )
                VALUES (
                  ?, ?, ?, ?, ?, 'KES',
                  ?, ?, ?
                )
              `)
              .run(
                cleanOrganizationName,
                slug,
                cleanOptionalText(
                  phone
                ),
                cleanOptionalText(
                  email
                ),
                cleanOptionalText(
                  address
                ),
                normalizedStatus,
                normalizedTrialEndsAt,
                normalizedSubscriptionExpiresAt
              );

          const organizationId =
            Number(
              organizationResult.lastInsertRowid
            );

          const userResult = db
            .prepare(`
              INSERT INTO users (
                name,
                email,
                password,
                role,
                organization_id,
                is_active
              )
              VALUES (
                ?, ?, ?, 'admin', ?, 1
              )
            `)
            .run(
              cleanAdminName,
              normalizedAdminEmail,
              hashedPassword,
              organizationId
            );

          return {
            organizationId,
            userId: Number(
              userResult.lastInsertRowid
            ),
          };
        });

      const created =
        createOrganization();

      const organization = db
        .prepare(`
          SELECT
            id,
            name,
            slug,
            phone,
            email,
            address,
            currency,
            status,
            trial_ends_at,
            subscription_expires_at,
            created_at,
            updated_at
          FROM organizations
          WHERE id = ?
        `)
        .get(
          created.organizationId
        );

      const admin = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            organization_id,
            is_active,
            created_at
          FROM users
          WHERE id = ?
        `)
        .get(created.userId);

      return res.status(201).json({
        message:
          "Organization onboarded successfully",
        organization,
        admin,
      });
    } catch (error) {
      console.error(
        "Super Admin organization onboarding error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to onboard organization",
      });
    }
  }
);

// ============================================================
// PLATFORM SUMMARY
// Metadata only: no tenant sales/customer/inventory records.
// ============================================================

router.get("/summary", (_req, res) => {
  try {
    const organizations = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) AS trial,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired
        FROM organizations
      `)
      .get();

    const users = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
        FROM users
      `)
      .get();

    return res.json({
      organizations,
      users,
    });
  } catch (error) {
    console.error("Super Admin summary error:", error);

    return res.status(500).json({
      message: "Failed to load platform summary",
    });
  }
});

// ============================================================
// LIST ORGANIZATIONS
// Returns organization/account metadata and user counts only.
// ============================================================

router.get("/organizations", (_req, res) => {
  try {
    const organizations = db
      .prepare(`
        SELECT
          o.id,
          o.name,
          o.slug,
          o.phone,
          o.email,
          o.address,
          o.currency,
          o.status,
          o.trial_ends_at,
          o.subscription_expires_at,
          o.created_at,
          o.updated_at,
          COUNT(u.id) AS user_count,
          SUM(
            CASE
              WHEN u.is_active = 1 THEN 1
              ELSE 0
            END
          ) AS active_user_count
        FROM organizations o
        LEFT JOIN users u
          ON u.organization_id = o.id
        GROUP BY o.id
        ORDER BY o.created_at DESC, o.id DESC
      `)
      .all();

    return res.json(organizations);
  } catch (error) {
    console.error(
      "Super Admin organizations error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load organizations",
    });
  }
});

// ============================================================
// SINGLE ORGANIZATION ACCOUNT METADATA
// Still does not expose sales, customers, inventory or expenses.
// ============================================================

router.get("/organizations/:id", (req, res) => {
  const organizationId = Number(req.params.id);

  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0
  ) {
    return res.status(400).json({
      message: "Invalid organization ID",
    });
  }

  try {
    const organization = db
      .prepare(`
        SELECT
          o.id,
          o.name,
          o.slug,
          o.phone,
          o.email,
          o.address,
          o.currency,
          o.status,
          o.trial_ends_at,
          o.subscription_expires_at,
          o.created_at,
          o.updated_at,
          COUNT(u.id) AS user_count,
          SUM(
            CASE
              WHEN u.is_active = 1 THEN 1
              ELSE 0
            END
          ) AS active_user_count
        FROM organizations o
        LEFT JOIN users u
          ON u.organization_id = o.id
        WHERE o.id = ?
        GROUP BY o.id
      `)
      .get(organizationId);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    return res.json(organization);
  } catch (error) {
    console.error(
      "Super Admin organization lookup error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load organization",
    });
  }
});

// ============================================================
// UPDATE ORGANIZATION ACCESS
// Allows status and trial/subscription dates to be managed.
// ============================================================

router.put(
  "/organizations/:id/access",
  (req, res) => {
    const organizationId = Number(req.params.id);
    const {
      status,
      trialEndsAt,
      subscriptionExpiresAt,
    } = req.body;

    if (
      !Number.isInteger(organizationId) ||
      organizationId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid organization ID",
      });
    }

    const normalizedStatus = String(
      status || ""
    )
      .trim()
      .toLowerCase();

    const allowedStatuses = [
      "active",
      "trial",
      "suspended",
      "expired",
    ];

    if (
      !allowedStatuses.includes(normalizedStatus)
    ) {
      return res.status(400).json({
        message:
          "Status must be active, trial, suspended or expired",
      });
    }

    const normalizeDate = (
      value: unknown,
      fieldName: string
    ) => {
      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        return null;
      }

      const date = new Date(String(value));

      if (Number.isNaN(date.getTime())) {
        throw new Error(
          `${fieldName} must be a valid date`
        );
      }

      return date.toISOString();
    };

    try {
      const organization = db
        .prepare(`
          SELECT id
          FROM organizations
          WHERE id = ?
        `)
        .get(organizationId);

      if (!organization) {
        return res.status(404).json({
          message: "Organization not found",
        });
      }

      let normalizedTrialEndsAt: string | null;
      let normalizedSubscriptionExpiresAt:
        | string
        | null;

      try {
        normalizedTrialEndsAt = normalizeDate(
          trialEndsAt,
          "Trial end date"
        );

        normalizedSubscriptionExpiresAt =
          normalizeDate(
            subscriptionExpiresAt,
            "Subscription expiry date"
          );
      } catch (dateError) {
        return res.status(400).json({
          message:
            dateError instanceof Error
              ? dateError.message
              : "Invalid date",
        });
      }

      db.prepare(`
        UPDATE organizations
        SET
          status = ?,
          trial_ends_at = ?,
          subscription_expires_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        normalizedStatus,
        normalizedTrialEndsAt,
        normalizedSubscriptionExpiresAt,
        organizationId
      );

      const updatedOrganization = db
        .prepare(`
          SELECT
            id,
            name,
            slug,
            phone,
            email,
            address,
            currency,
            status,
            trial_ends_at,
            subscription_expires_at,
            created_at,
            updated_at
          FROM organizations
          WHERE id = ?
        `)
        .get(organizationId);

      return res.json({
        message:
          "Organization access updated successfully",
        organization: updatedOrganization,
      });
    } catch (error) {
      console.error(
        "Update organization access error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to update organization access",
      });
    }
  }
);

export default router;
