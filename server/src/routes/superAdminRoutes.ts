import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../database/db.js";
import { tryCreateNotification } from "../services/notificationService.js";
import { type BillingCycle, type SubscriptionPlan } from "../config/subscriptionPricing.js";

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "dev_secret_change_me";

const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const SUPER_ADMIN_PASSWORD_HASH =
  process.env.SUPER_ADMIN_PASSWORD_HASH;


const getCurrentSubscriptionPrice = (
  planCode: string,
  billingCycle: string
) => {
  const row = db
    .prepare(`
      SELECT pp.amount
      FROM subscription_plan_prices pp
      INNER JOIN subscription_plans p
        ON p.id = pp.plan_id
      WHERE p.code = ?
        AND p.is_active = 1
        AND pp.billing_cycle = ?
        AND pp.is_active = 1
        AND datetime(pp.effective_from) <= datetime('now')
        AND (
          pp.effective_to IS NULL
          OR datetime(pp.effective_to) > datetime('now')
        )
      ORDER BY
        datetime(pp.effective_from) DESC,
        pp.id DESC
      LIMIT 1
    `)
    .get(
      planCode,
      billingCycle
    ) as
    | {
        amount: number;
      }
    | undefined;

  if (!row) {
    throw new Error(
      `No active ${billingCycle} price is configured for ${planCode}.`
    );
  }

  return Number(row.amount);
};


const calculateSubscriptionPeriodEnd = (
  periodStart: string,
  billingCycle: BillingCycle
) => {
  const start = new Date(
    `${periodStart}T00:00:00.000Z`
  );

  if (Number.isNaN(start.getTime())) {
    throw new Error(
      "Period start is invalid"
    );
  }

  const end = new Date(start);

  if (billingCycle === "monthly") {
    end.setUTCMonth(
      end.getUTCMonth() + 1
    );
  } else if (
    billingCycle === "quarterly"
  ) {
    end.setUTCMonth(
      end.getUTCMonth() + 3
    );
  } else if (
    billingCycle === "annual"
  ) {
    end.setUTCFullYear(
      end.getUTCFullYear() + 1
    );
  }

  end.setUTCDate(
    end.getUTCDate() - 1
  );

  return end
    .toISOString()
    .slice(0, 10);
};


// ============================================================
// ORGANIZATION EXPIRY SYNCHRONIZATION
// Keeps stored organization status aligned with access dates.
// Suspended organizations remain suspended until manually changed.
// ============================================================

const syncExpiredOrganizations = () => {
  db.exec(`
    UPDATE organizations
    SET
      status = 'expired',
      updated_at = CURRENT_TIMESTAMP
    WHERE status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND datetime(trial_ends_at) < datetime('now')
  `);

  db.exec(`
    UPDATE organizations
    SET
      status = 'expired',
      updated_at = CURRENT_TIMESTAMP
    WHERE status = 'active'
      AND subscription_expires_at IS NOT NULL
      AND datetime(subscription_expires_at) < datetime('now')
  `);
};

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

      // Enforce lifecycle invariants during onboarding.
      if (normalizedStatus === "active") {
        return res.status(400).json({
          message:
            "New organizations cannot be manually onboarded as active. Record a subscription payment to activate the organization.",
        });
      }

      if (normalizedStatus === "trial") {
        normalizedSubscriptionExpiresAt = null;
      } else {
        normalizedTrialEndsAt = null;
        normalizedSubscriptionExpiresAt = null;
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
// SUBSCRIPTION PLAN CATALOG
// Platform-owned plan metadata and active pricing.
// ============================================================

const planFeatureStatement = db.prepare(`
  SELECT
    id,
    plan_id,
    feature_key,
    feature_label,
    feature_value,
    sort_order
  FROM subscription_plan_features
  WHERE plan_id = ?
  ORDER BY sort_order ASC, id ASC
`);

router.get("/plans", (_req, res) => {
  try {
    const plans = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          description,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM subscription_plans
        ORDER BY sort_order ASC, id ASC
      `)
      .all() as Array<{
        id: number;
        code: string;
        name: string;
        description: string | null;
        is_active: number;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }>;

    const priceStatement = db.prepare(`
      SELECT
        id,
        plan_id,
        billing_cycle,
        amount,
        currency,
        is_active,
        effective_from,
        effective_to,
        created_at,
        updated_at
      FROM subscription_plan_prices
      WHERE plan_id = ?
        AND is_active = 1
        AND datetime(effective_from) <= datetime('now')
        AND (
          effective_to IS NULL
          OR datetime(effective_to) > datetime('now')
        )
      ORDER BY
        CASE billing_cycle
          WHEN 'monthly' THEN 1
          WHEN 'quarterly' THEN 2
          WHEN 'annual' THEN 3
          ELSE 4
        END,
        effective_from DESC,
        id DESC
    `);

    const result = plans.map((plan) => ({
      ...plan,
      is_active: Boolean(plan.is_active),
      prices: priceStatement
        .all(plan.id)
        .map((price: any) => ({
          ...price,
          is_active: Boolean(price.is_active),
        })),
      features: planFeatureStatement.all(plan.id),
    }));

    return res.json(result);
  } catch (error) {
    console.error(
      "Super Admin subscription plans error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load subscription plans",
    });
  }
});

router.get("/plans/:id", (req, res) => {
  const planId = Number(req.params.id);

  if (
    !Number.isInteger(planId) ||
    planId <= 0
  ) {
    return res.status(400).json({
      message: "Invalid subscription plan ID",
    });
  }

  try {
    const plan = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          description,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM subscription_plans
        WHERE id = ?
        LIMIT 1
      `)
      .get(planId) as
      | {
          id: number;
          code: string;
          name: string;
          description: string | null;
          is_active: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!plan) {
      return res.status(404).json({
        message: "Subscription plan not found",
      });
    }

    const prices = db
      .prepare(`
        SELECT
          id,
          plan_id,
          billing_cycle,
          amount,
          currency,
          is_active,
          effective_from,
          effective_to,
          created_at,
          updated_at
        FROM subscription_plan_prices
        WHERE plan_id = ?
        ORDER BY
          CASE billing_cycle
            WHEN 'monthly' THEN 1
            WHEN 'quarterly' THEN 2
            WHEN 'annual' THEN 3
            ELSE 4
          END,
          effective_from DESC,
          id DESC
      `)
      .all(planId)
      .map((price: any) => ({
        ...price,
        is_active: Boolean(price.is_active),
      }));

    const features = planFeatureStatement.all(planId);

    return res.json({
      ...plan,
      is_active: Boolean(plan.is_active),
      prices,
      features,
    });
  } catch (error) {
    console.error(
      "Super Admin subscription plan lookup error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load subscription plan",
    });
  }
});


router.put("/plans/:id", (req, res) => {
  const planId = Number(req.params.id);

  if (
    !Number.isInteger(planId) ||
    planId <= 0
  ) {
    return res.status(400).json({
      message: "Invalid subscription plan ID",
    });
  }

  const {
    name,
    description,
    isActive,
    prices,
    features,
  } = req.body;

  const cleanName = String(
    name || ""
  ).trim();

  const cleanDescription =
    String(description || "").trim() ||
    null;

  if (!cleanName) {
    return res.status(400).json({
      message: "Plan name is required",
    });
  }

  if (
    typeof isActive !== "boolean"
  ) {
    return res.status(400).json({
      message:
        "Plan active status must be true or false",
    });
  }

  const cycles: BillingCycle[] = [
    "monthly",
    "quarterly",
    "annual",
  ];

  const normalizedPrices =
    Object.fromEntries(
      cycles.map((cycle) => [
        cycle,
        Number(prices?.[cycle]),
      ])
    ) as Record<BillingCycle, number>;

  for (const cycle of cycles) {
    const amount =
      normalizedPrices[cycle];

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        message:
          `${cycle} price must be greater than 0`,
      });
    }
  }

  const normalizedFeatures =
    features &&
    typeof features === "object"
      ? Object.fromEntries(
          Object.entries(features).map(
            ([key, value]) => [
              String(key).trim(),
              String(value ?? "").trim(),
            ]
          )
        )
      : {};

  const requiredFeatureKeys = [
    "branches_included",
    "users_included",
    "sales_inventory",
    "mpesa_recording",
    "customer_expense_tracking",
    "staff_roles",
    "multi_branch_reports",
    "audit_analytics",
    "support",
  ];

  for (const key of requiredFeatureKeys) {
    if (!normalizedFeatures[key]) {
      return res.status(400).json({
        message: `Feature value is required for ${key}`,
      });
    }
  }

  const branchesIncluded = Number(
    normalizedFeatures.branches_included
  );
  const usersIncluded = Number(
    normalizedFeatures.users_included
  );

  if (
    !Number.isInteger(branchesIncluded) ||
    branchesIncluded < 1
  ) {
    return res.status(400).json({
      message:
        "Branches included must be a whole number greater than 0",
    });
  }

  if (
    !Number.isInteger(usersIncluded) ||
    usersIncluded < 1
  ) {
    return res.status(400).json({
      message:
        "Users included must be a whole number greater than 0",
    });
  }

  const inclusionValues = new Set([
    "included",
    "not_included",
  ]);

  for (const key of [
    "sales_inventory",
    "mpesa_recording",
    "customer_expense_tracking",
    "multi_branch_reports",
    "audit_analytics",
  ]) {
    if (
      !inclusionValues.has(
        normalizedFeatures[key]
      )
    ) {
      return res.status(400).json({
        message:
          `${key} must be included or not_included`,
      });
    }
  }

  if (
    !["Basic", "Advanced"].includes(
      normalizedFeatures.staff_roles
    )
  ) {
    return res.status(400).json({
      message:
        "Staff roles must be Basic or Advanced",
    });
  }

  if (
    !["Standard", "Priority", "Dedicated"].includes(
      normalizedFeatures.support
    )
  ) {
    return res.status(400).json({
      message:
        "Support must be Standard, Priority or Dedicated",
    });
  }

  try {
    const currentPlan = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          description,
          is_active
        FROM subscription_plans
        WHERE id = ?
        LIMIT 1
      `)
      .get(planId) as
      | {
          id: number;
          code: string;
          name: string;
          description: string | null;
          is_active: number;
        }
      | undefined;

    if (!currentPlan) {
      return res.status(404).json({
        message:
          "Subscription plan not found",
      });
    }

    const updatePlan =
      db.transaction(() => {
        db.prepare(`
          UPDATE subscription_plans
          SET
            name = ?,
            description = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          cleanName,
          cleanDescription,
          isActive ? 1 : 0,
          planId
        );

        for (const cycle of cycles) {
          const currentPrice = db
            .prepare(`
              SELECT
                id,
                amount
              FROM subscription_plan_prices
              WHERE plan_id = ?
                AND billing_cycle = ?
                AND is_active = 1
                AND datetime(effective_from) <= datetime('now')
                AND (
                  effective_to IS NULL
                  OR datetime(effective_to) > datetime('now')
                )
              ORDER BY
                datetime(effective_from) DESC,
                id DESC
              LIMIT 1
            `)
            .get(
              planId,
              cycle
            ) as
            | {
                id: number;
                amount: number;
              }
            | undefined;

          const nextAmount =
            normalizedPrices[cycle];

          if (
            currentPrice &&
            Math.abs(
              Number(currentPrice.amount) -
                nextAmount
            ) < 0.001
          ) {
            continue;
          }

          if (currentPrice) {
            db.prepare(`
              UPDATE subscription_plan_prices
              SET
                is_active = 0,
                effective_to = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(currentPrice.id);
          }

          db.prepare(`
            INSERT INTO subscription_plan_prices (
              plan_id,
              billing_cycle,
              amount,
              currency,
              is_active,
              effective_from
            )
            VALUES (
              ?, ?, ?, 'KES', 1,
              CURRENT_TIMESTAMP
            )
          `).run(
            planId,
            cycle,
            nextAmount
          );
        }

        const updateFeature = db.prepare(`
          UPDATE subscription_plan_features
          SET
            feature_value = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE plan_id = ?
            AND feature_key = ?
        `);

        for (const key of requiredFeatureKeys) {
          const result = updateFeature.run(
            normalizedFeatures[key],
            planId,
            key
          );

          if (result.changes === 0) {
            throw new Error(
              `Missing plan feature configuration: ${key}`
            );
          }
        }
      });

    updatePlan();

    const updatedPlan = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          description,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM subscription_plans
        WHERE id = ?
      `)
      .get(planId) as any;

    const updatedPrices = db
      .prepare(`
        SELECT
          id,
          plan_id,
          billing_cycle,
          amount,
          currency,
          is_active,
          effective_from,
          effective_to,
          created_at,
          updated_at
        FROM subscription_plan_prices
        WHERE plan_id = ?
          AND is_active = 1
          AND datetime(effective_from) <= datetime('now')
          AND (
            effective_to IS NULL
            OR datetime(effective_to) > datetime('now')
          )
        ORDER BY
          CASE billing_cycle
            WHEN 'monthly' THEN 1
            WHEN 'quarterly' THEN 2
            WHEN 'annual' THEN 3
            ELSE 4
          END
      `)
      .all(planId)
      .map((price: any) => ({
        ...price,
        is_active:
          Boolean(price.is_active),
      }));

    const updatedFeatures =
      planFeatureStatement.all(planId);

    return res.json({
      message:
        "Subscription plan updated successfully",
      plan: {
        ...updatedPlan,
        is_active:
          Boolean(updatedPlan.is_active),
        prices: updatedPrices,
        features: updatedFeatures,
      },
    });
  } catch (error) {
    console.error(
      "Super Admin subscription plan update error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to update subscription plan",
    });
  }
});


// ============================================================
// SUBSCRIPTION PAYMENTS
// Platform billing metadata only; never exposes tenant sales data.
// ============================================================

router.get("/organizations/:id/subscription-payments", (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return res.status(400).json({ message: "Invalid organization ID" });
  }

  try {
    const organization = db.prepare(`
      SELECT id FROM organizations WHERE id = ? LIMIT 1
    `).get(organizationId);

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const payments = db.prepare(`
      SELECT
        id,
        organization_id,
        plan,
        billing_cycle,
        amount,
        payment_method,
        payment_reference,
        period_start,
        period_end,
        paid_at,
        notes,
        created_at
      FROM subscription_payments
      WHERE organization_id = ?
      ORDER BY paid_at DESC, id DESC
    `).all(organizationId);

    return res.json(payments);
  } catch (error) {
    console.error("Subscription payment history error:", error);
    return res.status(500).json({
      message: "Failed to load subscription payment history",
    });
  }
});

router.post("/organizations/:id/subscription-payments", (req, res) => {
  const organizationId = Number(req.params.id);
  const {
    plan,
    billingCycle,
    amount,
    paymentMethod,
    paymentReference,
    periodStart,
    notes,
    allowPriceOverride,
    priceOverrideReason,
  } = req.body;

  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return res.status(400).json({ message: "Invalid organization ID" });
  }

  const normalizedPlan = String(plan || "").trim().toLowerCase();
  const normalizedBillingCycle = String(billingCycle || "").trim().toLowerCase();
  const normalizedPaymentMethod = String(paymentMethod || "").trim();
  const numericAmount = Number(amount);

  if (!["starter", "business", "pro"].includes(normalizedPlan)) {
    return res.status(400).json({
      message: "Plan must be Starter, Business or Pro",
    });
  }

  if (!["monthly", "quarterly", "annual"].includes(normalizedBillingCycle)) {
    return res.status(400).json({
      message: "Billing cycle must be Monthly, Quarterly or Annual",
    });
  }

  let officialPrice: number;

  try {
    officialPrice =
      getCurrentSubscriptionPrice(
        normalizedPlan,
        normalizedBillingCycle
      );
  } catch (priceError) {
    return res.status(400).json({
      message:
        priceError instanceof Error
          ? priceError.message
          : "Subscription price is not configured",
    });
  }

  const isPriceOverride =
    Math.abs(numericAmount - officialPrice) > 0.001;

  if (isPriceOverride && !allowPriceOverride) {
    return res.status(400).json({
      message: `Official ${normalizedPlan} ${normalizedBillingCycle} price is KES ${officialPrice}. Enable price override to record a different amount.`,
      officialPrice,
    });
  }

  const normalizedOverrideReason = String(
    priceOverrideReason || ""
  ).trim();

  if (isPriceOverride && !normalizedOverrideReason) {
    return res.status(400).json({
      message:
        "A reason is required when overriding the official subscription price.",
    });
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Payment amount must be greater than 0" });
  }

  if (!normalizedPaymentMethod) {
    return res.status(400).json({ message: "Payment method is required" });
  }

  const parseDateOnly = (value: unknown, fieldName: string) => {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new Error(`${fieldName} must use YYYY-MM-DD`);
    }
    const date = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${fieldName} is invalid`);
    }
    return text;
  };

  let normalizedPeriodStart: string;
  let normalizedPeriodEnd: string;

  try {
    normalizedPeriodStart = parseDateOnly(
      periodStart,
      "Period start"
    );

    normalizedPeriodEnd =
      calculateSubscriptionPeriodEnd(
        normalizedPeriodStart,
        normalizedBillingCycle as BillingCycle
      );
  } catch (error) {
    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Invalid subscription period",
    });
  }

  try {
    const organization = db.prepare(`
      SELECT id FROM organizations WHERE id = ? LIMIT 1
    `).get(organizationId);

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const recordPayment = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO subscription_payments (
          organization_id,
          plan,
          billing_cycle,
          amount,
          payment_method,
          payment_reference,
          period_start,
          period_end,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        organizationId,
        normalizedPlan,
        normalizedBillingCycle,
        numericAmount,
        normalizedPaymentMethod,
        String(paymentReference || "").trim() || null,
        normalizedPeriodStart,
        normalizedPeriodEnd,
        [
          String(notes || "").trim(),
          isPriceOverride
            ? `PRICE OVERRIDE: ${normalizedOverrideReason}`
            : "",
        ]
          .filter(Boolean)
          .join(" | ") || null
      );

      db.prepare(`
        UPDATE organizations
        SET
          status = 'active',
          trial_ends_at = NULL,
          subscription_plan = ?,
          billing_cycle = ?,
          subscription_expires_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        normalizedPlan,
        normalizedBillingCycle,
        `${normalizedPeriodEnd}T23:59:59.999Z`,
        organizationId
      );

      return Number(result.lastInsertRowid);
    });

    const paymentId = recordPayment();

    const payment = db.prepare(`
      SELECT * FROM subscription_payments WHERE id = ?
    `).get(paymentId);

    const updatedOrganization = db.prepare(`
      SELECT
        id, name, slug, status, subscription_plan, billing_cycle,
        trial_ends_at, subscription_expires_at, updated_at
      FROM organizations
      WHERE id = ?
    `).get(organizationId);

    return res.status(201).json({
      message: "Subscription payment recorded successfully",
      payment,
      organization: updatedOrganization,
    });
  } catch (error) {
    console.error("Record subscription payment error:", error);
    return res.status(500).json({
      message: "Failed to record subscription payment",
    });
  }
});

// ============================================================
// PLATFORM BILLING / REVENUE SUMMARY
// Subscription revenue only. Does not read tenant POS sales.
// ============================================================

router.get("/billing/summary", (req, res) => {
  try {
    syncExpiredOrganizations();

    const requestedMonths = Number(
      req.query.months || 6
    );

    const allowedTrendMonths = [3, 6, 12];

    const trendMonths =
      allowedTrendMonths.includes(
        requestedMonths
      )
        ? requestedMonths
        : 6;

    const totals = db
      .prepare(`
        SELECT
          COALESCE(SUM(amount), 0) AS total_revenue,
          COUNT(*) AS total_payments,
          COALESCE(
            SUM(
              CASE
                WHEN datetime(paid_at) >= datetime('now', 'start of month')
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS revenue_this_month,
          SUM(
            CASE
              WHEN datetime(paid_at) >= datetime('now', 'start of month')
              THEN 1
              ELSE 0
            END
          ) AS payments_this_month
        FROM subscription_payments
      `)
      .get();

    const subscriptions = db
      .prepare(`
        SELECT
          SUM(
            CASE
              WHEN status = 'active'
                AND subscription_plan IS NOT NULL
                AND billing_cycle IS NOT NULL
              THEN 1
              ELSE 0
            END
          ) AS active_paid_subscriptions,
          SUM(
            CASE
              WHEN status = 'trial'
              THEN 1
              ELSE 0
            END
          ) AS trial_organizations,
          SUM(
            CASE
              WHEN status = 'expired'
              THEN 1
              ELSE 0
            END
          ) AS expired_organizations,
          SUM(
            CASE
              WHEN status = 'suspended'
              THEN 1
              ELSE 0
            END
          ) AS suspended_organizations
        FROM organizations
      `)
      .get();

    const activeSubscriptions = db
      .prepare(`
        SELECT
          id,
          subscription_plan,
          billing_cycle
        FROM organizations
        WHERE status = 'active'
          AND subscription_plan IS NOT NULL
          AND billing_cycle IS NOT NULL
          AND subscription_expires_at IS NOT NULL
          AND datetime(subscription_expires_at) >= datetime('now')
      `)
      .all() as Array<{
        id: number;
        subscription_plan: string;
        billing_cycle: string;
      }>;

    const recurringRevenue = activeSubscriptions.reduce(
      (totals, organization) => {
        try {
          const officialPrice =
            getCurrentSubscriptionPrice(
              organization.subscription_plan,
              organization.billing_cycle
            );

          let monthlyEquivalent = 0;

          if (organization.billing_cycle === "monthly") {
            monthlyEquivalent = officialPrice;
          } else if (
            organization.billing_cycle === "quarterly"
          ) {
            monthlyEquivalent = officialPrice / 3;
          } else if (
            organization.billing_cycle === "annual"
          ) {
            monthlyEquivalent = officialPrice / 12;
          }

          totals.mrr += monthlyEquivalent;
          return totals;
        } catch {
          return totals;
        }
      },
      { mrr: 0 }
    );

    const rawMrr = recurringRevenue.mrr;

    const mrr = Number(
      rawMrr.toFixed(2)
    );

    const arr = Number(
      (rawMrr * 12).toFixed(2)
    );

    const revenueByPlan = db
      .prepare(`
        SELECT
          plan,
          COUNT(*) AS payment_count,
          COALESCE(SUM(amount), 0) AS revenue
        FROM subscription_payments
        GROUP BY plan
        ORDER BY revenue DESC
      `)
      .all();

    const revenueByBillingCycle = db
      .prepare(`
        SELECT
          billing_cycle,
          COUNT(*) AS payment_count,
          COALESCE(SUM(amount), 0) AS revenue
        FROM subscription_payments
        GROUP BY billing_cycle
        ORDER BY revenue DESC
      `)
      .all();

    const revenueByPaymentMethod = db
      .prepare(`
        SELECT
          payment_method,
          COUNT(*) AS payment_count,
          COALESCE(SUM(amount), 0) AS revenue
        FROM subscription_payments
        GROUP BY payment_method
        ORDER BY revenue DESC
      `)
      .all();

    const monthlyRevenue = db
      .prepare(`
        WITH RECURSIVE months(offset) AS (
          SELECT ?
          UNION ALL
          SELECT offset - 1
          FROM months
          WHERE offset > 0
        )
        SELECT
          strftime(
            '%Y-%m',
            date(
              'now',
              'start of month',
              printf('-%d months', offset)
            )
          ) AS month,
          COALESCE(
            (
              SELECT SUM(sp.amount)
              FROM subscription_payments sp
              WHERE strftime('%Y-%m', sp.paid_at) =
                strftime(
                  '%Y-%m',
                  date(
                    'now',
                    'start of month',
                    printf('-%d months', offset)
                  )
                )
            ),
            0
          ) AS revenue,
          COALESCE(
            (
              SELECT COUNT(*)
              FROM subscription_payments sp
              WHERE strftime('%Y-%m', sp.paid_at) =
                strftime(
                  '%Y-%m',
                  date(
                    'now',
                    'start of month',
                    printf('-%d months', offset)
                  )
                )
            ),
            0
          ) AS payment_count
        FROM months
        ORDER BY month ASC
      `)
      .all(trendMonths - 1);

    const renewalRows = db
      .prepare(`
        SELECT
          id,
          name,
          slug,
          status,
          subscription_plan,
          billing_cycle,
          subscription_expires_at
        FROM organizations
        WHERE subscription_plan IS NOT NULL
          AND billing_cycle IS NOT NULL
          AND subscription_expires_at IS NOT NULL
          AND status IN ('active', 'expired')
          AND datetime(subscription_expires_at) <= datetime('now', '+30 days')
        ORDER BY datetime(subscription_expires_at) ASC
        LIMIT 20
      `)
      .all() as Array<{
        id: number;
        name: string;
        slug: string;
        status: string;
        subscription_plan: string;
        billing_cycle: string;
        subscription_expires_at: string;
      }>;

    const upcomingRenewals = renewalRows.map(
      (organization) => {
        let expectedAmount = 0;

        try {
          expectedAmount =
            getCurrentSubscriptionPrice(
              organization.subscription_plan,
              organization.billing_cycle
            );
        } catch {
          expectedAmount = 0;
        }

        return {
          organization_id: organization.id,
          organization_name: organization.name,
          organization_slug: organization.slug,
          status: organization.status,
          plan: organization.subscription_plan,
          billing_cycle: organization.billing_cycle,
          expected_amount: expectedAmount,
          subscription_expires_at:
            organization.subscription_expires_at,
        };
      }
    );

    const recentPayments = db
      .prepare(`
        SELECT
          sp.id,
          sp.organization_id,
          o.name AS organization_name,
          o.slug AS organization_slug,
          sp.plan,
          sp.billing_cycle,
          sp.amount,
          sp.payment_method,
          sp.payment_reference,
          sp.period_start,
          sp.period_end,
          sp.paid_at,
          sp.notes
        FROM subscription_payments sp
        INNER JOIN organizations o
          ON o.id = sp.organization_id
        ORDER BY sp.paid_at DESC, sp.id DESC
        LIMIT 10
      `)
      .all();

    return res.json({
      totals,
      subscriptions,
      recurring_revenue: {
        mrr,
        arr,
      },
      revenue_by_plan: revenueByPlan,
      revenue_by_billing_cycle:
        revenueByBillingCycle,
      revenue_by_payment_method:
        revenueByPaymentMethod,
      trend_months: trendMonths,
      monthly_revenue: monthlyRevenue,
      upcoming_renewals: upcomingRenewals,
      recent_payments: recentPayments,
    });
  } catch (error) {
    console.error(
      "Super Admin billing summary error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load subscription revenue summary",
    });
  }
});

// ============================================================
// PLATFORM SUMMARY
// Metadata only: no tenant sales/customer/inventory records.
// ============================================================

router.get("/summary", (_req, res) => {
  try {
    syncExpiredOrganizations();
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
    syncExpiredOrganizations();
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
          o.subscription_plan,
          o.billing_cycle,
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
    syncExpiredOrganizations();

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
          o.subscription_plan,
          o.billing_cycle,
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
// ORGANIZATION USERS
// Platform metadata only; no tenant sales or operational data.
// ============================================================

router.get(
  "/organizations/:id/users",
  (req, res) => {
    const organizationId = Number(
      req.params.id
    );

    if (
      !Number.isInteger(
        organizationId
      ) ||
      organizationId <= 0
    ) {
      return res.status(400).json({
        message:
          "Invalid organization ID",
      });
    }

    try {
      const organization = db
        .prepare(`
          SELECT id
          FROM organizations
          WHERE id = ?
          LIMIT 1
        `)
        .get(organizationId);

      if (!organization) {
        return res.status(404).json({
          message:
            "Organization not found",
        });
      }

      const users = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
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

      return res.json(users);
    } catch (error) {
      console.error(
        "Super Admin organization users error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to load organization users",
      });
    }
  }
);

// ============================================================
// UPDATE ORGANIZATION ACCESS
// Trial uses trial date only. Paid activation comes from Record Payment.
// Suspension/expiry preserve billing metadata.
// ============================================================

router.put(
  "/organizations/:id/access",
  (req, res) => {
    const organizationId = Number(req.params.id);
    const { status, trialEndsAt } = req.body;

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({ message: "Invalid organization ID" });
    }

    const normalizedStatus = String(status || "").trim().toLowerCase();
    const allowedStatuses = ["active", "trial", "suspended", "expired"];

    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        message: "Status must be active, trial, suspended or expired",
      });
    }

    const normalizeDate = (value: unknown, fieldName: string) => {
      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        return null;
      }

      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} must be a valid date`);
      }

      return date.toISOString();
    };

    try {
      const organization = db.prepare(`
        SELECT
          id, status, trial_ends_at, subscription_plan,
          billing_cycle, subscription_expires_at
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `).get(organizationId) as
        | {
            id: number;
            status: string;
            trial_ends_at: string | null;
            subscription_plan: string | null;
            billing_cycle: string | null;
            subscription_expires_at: string | null;
          }
        | undefined;

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      let normalizedTrialEndsAt: string | null;

      try {
        normalizedTrialEndsAt = normalizeDate(
          trialEndsAt,
          "Trial end date"
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
        normalizedStatus === "active" &&
        organization.status !== "active"
      ) {
        return res.status(400).json({
          message: "Use Record Payment to activate this organization.",
        });
      }

      if (normalizedStatus === "trial") {
        if (!normalizedTrialEndsAt) {
          return res.status(400).json({
            message: "Trial end date is required for a trial organization",
          });
        }

        db.prepare(`
          UPDATE organizations
          SET
            status = 'trial',
            trial_ends_at = ?,
            subscription_plan = NULL,
            billing_cycle = NULL,
            subscription_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(normalizedTrialEndsAt, organizationId);
      } else if (
        normalizedStatus === "suspended" ||
        normalizedStatus === "expired"
      ) {
        db.prepare(`
          UPDATE organizations
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(normalizedStatus, organizationId);
      } else {
        if (
          !organization.subscription_plan ||
          !organization.billing_cycle ||
          !organization.subscription_expires_at
        ) {
          return res.status(400).json({
            message:
              "An active organization requires a recorded subscription plan, billing cycle and expiry date.",
          });
        }

        db.prepare(`
          UPDATE organizations
          SET
            status = 'active',
            trial_ends_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(organizationId);
      }

      const updatedOrganization = db.prepare(`
        SELECT
          id, name, slug, phone, email, address, currency, status,
          trial_ends_at, subscription_plan, billing_cycle,
          subscription_expires_at, created_at, updated_at
        FROM organizations
        WHERE id = ?
      `).get(organizationId);

      return res.json({
        message: "Organization access updated successfully",
        organization: updatedOrganization,
      });
    } catch (error) {
      console.error("Update organization access error:", error);
      return res.status(500).json({
        message: "Failed to update organization access",
      });
    }
  }
);


// ============================================================
// SUPER ADMIN SUPPORT CENTER
// Platform-wide support management. This intentionally exposes
// support-ticket data only, not tenant POS sales/customer/inventory data.
// ============================================================

const normalizeSupportStatus = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const normalizeSupportPriority = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const serializeSuperAdminSupportTicket = (row: any) => ({
  id: row.id,
  organizationId: row.organization_id,
  ticketNumber: row.ticket_number,
  subject: row.subject,
  description: row.description,
  category: row.category,
  priority: row.priority,
  status: row.status,
  supportLevel: row.support_level,
  assignedTo: row.assigned_to,
  resolvedAt: row.resolved_at,
  closedAt: row.closed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  organization: {
    id: row.organization_id,
    name: row.organization_name,
    slug: row.organization_slug,
    status: row.organization_status,
    subscriptionPlan: row.subscription_plan,
  },
  branch: row.branch_id
    ? {
        id: row.branch_id,
        name: row.branch_name,
        code: row.branch_code,
      }
    : null,
  createdBy: row.created_by
    ? {
        id: row.created_by,
        name: row.created_by_name,
        email: row.created_by_email,
        role: row.created_by_role,
      }
    : null,
});

const superAdminSupportTicketSelect = `
  SELECT
    st.*,
    o.name AS organization_name,
    o.slug AS organization_slug,
    o.status AS organization_status,
    o.subscription_plan,
    b.name AS branch_name,
    b.code AS branch_code,
    u.name AS created_by_name,
    u.email AS created_by_email,
    u.role AS created_by_role
  FROM support_tickets st
  INNER JOIN organizations o
    ON o.id = st.organization_id
  LEFT JOIN branches b
    ON b.id = st.branch_id
   AND b.organization_id = st.organization_id
  LEFT JOIN users u
    ON u.id = st.created_by
   AND u.organization_id = st.organization_id
`;

router.get("/support/overview", (_req, res) => {
  try {
    const counts = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'waiting_customer' THEN 1 ELSE 0 END) AS waiting_customer,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
          SUM(CASE WHEN priority = 'urgent' AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS urgent,
          SUM(CASE WHEN support_level = 'Dedicated' AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS dedicated_open,
          SUM(CASE WHEN support_level = 'Priority' AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS priority_open,
          SUM(CASE WHEN support_level = 'Standard' AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS standard_open
        FROM support_tickets
      `)
      .get() as any;

    return res.json({
      counts: {
        total: Number(counts?.total || 0),
        open: Number(counts?.open || 0),
        inProgress: Number(counts?.in_progress || 0),
        waitingCustomer: Number(counts?.waiting_customer || 0),
        resolved: Number(counts?.resolved || 0),
        closed: Number(counts?.closed || 0),
        urgent: Number(counts?.urgent || 0),
      },
      bySupportLevel: {
        Dedicated: Number(counts?.dedicated_open || 0),
        Priority: Number(counts?.priority_open || 0),
        Standard: Number(counts?.standard_open || 0),
      },
    });
  } catch (error) {
    console.error("Super Admin support overview error:", error);
    return res.status(500).json({
      message: "Failed to load support overview",
    });
  }
});

router.get("/support/options", (_req, res) => {
  try {
    const organizations = db
      .prepare(`
        SELECT DISTINCT
          o.id,
          o.name,
          o.slug
        FROM organizations o
        INNER JOIN support_tickets st
          ON st.organization_id = o.id
        ORDER BY o.name ASC
      `)
      .all();

    const categories = db
      .prepare(`
        SELECT DISTINCT category
        FROM support_tickets
        WHERE category IS NOT NULL
          AND TRIM(category) <> ''
        ORDER BY category ASC
      `)
      .all()
      .map((row: any) => row.category);

    return res.json({
      organizations,
      statuses: [
        "open",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ],
      priorities: ["low", "normal", "high", "urgent"],
      supportLevels: ["Standard", "Priority", "Dedicated"],
      categories,
    });
  } catch (error) {
    console.error("Super Admin support options error:", error);
    return res.status(500).json({
      message: "Failed to load support filter options",
    });
  }
});

router.get("/support", (req, res) => {
  try {
    const requestedPage = Number(req.query.page || 1);
    const requestedLimit = Number(req.query.limit || 20);

    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;

    const offset = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const status = normalizeSupportStatus(req.query.status);
    const priority = normalizeSupportPriority(req.query.priority);
    const supportLevel = String(req.query.supportLevel || "").trim();
    const category = String(req.query.category || "").trim();
    const organizationId = Number(req.query.organizationId || 0);

    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(`
        (
          st.ticket_number LIKE ?
          OR st.subject LIKE ?
          OR st.description LIKE ?
          OR o.name LIKE ?
          OR COALESCE(u.name, '') LIKE ?
          OR COALESCE(u.email, '') LIKE ?
        )
      `);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (status) {
      if (
        ![
          "open",
          "in_progress",
          "waiting_customer",
          "resolved",
          "closed",
        ].includes(status)
      ) {
        return res.status(400).json({
          message: "Invalid support ticket status",
        });
      }

      conditions.push("st.status = ?");
      params.push(status);
    }

    if (priority) {
      if (!["low", "normal", "high", "urgent"].includes(priority)) {
        return res.status(400).json({
          message: "Invalid support ticket priority",
        });
      }

      conditions.push("st.priority = ?");
      params.push(priority);
    }

    if (supportLevel) {
      if (!["Standard", "Priority", "Dedicated"].includes(supportLevel)) {
        return res.status(400).json({
          message: "Invalid support level",
        });
      }

      conditions.push("st.support_level = ?");
      params.push(supportLevel);
    }

    if (category) {
      conditions.push("st.category = ?");
      params.push(category);
    }

    if (organizationId) {
      if (!Number.isInteger(organizationId) || organizationId <= 0) {
        return res.status(400).json({
          message: "Invalid organization ID",
        });
      }

      conditions.push("st.organization_id = ?");
      params.push(organizationId);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const totalRow = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM support_tickets st
        INNER JOIN organizations o
          ON o.id = st.organization_id
        LEFT JOIN users u
          ON u.id = st.created_by
         AND u.organization_id = st.organization_id
        ${whereClause}
      `)
      .get(...params) as { total: number };

    const rows = db
      .prepare(`
        ${superAdminSupportTicketSelect}
        ${whereClause}
        ORDER BY
          CASE st.support_level
            WHEN 'Dedicated' THEN 1
            WHEN 'Priority' THEN 2
            ELSE 3
          END,
          CASE st.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
          END,
          CASE st.status
            WHEN 'open' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'waiting_customer' THEN 3
            WHEN 'resolved' THEN 4
            ELSE 5
          END,
          datetime(st.updated_at) DESC,
          st.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const total = Number(totalRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      tickets: rows.map(serializeSuperAdminSupportTicket),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Super Admin support ticket list error:", error);
    return res.status(500).json({
      message: "Failed to load support tickets",
    });
  }
});

router.get("/support/:id", (req, res) => {
  const ticketId = Number(req.params.id);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      message: "Invalid support ticket ID",
    });
  }

  try {
    const row = db
      .prepare(`
        ${superAdminSupportTicketSelect}
        WHERE st.id = ?
        LIMIT 1
      `)
      .get(ticketId) as any;

    if (!row) {
      return res.status(404).json({
        message: "Support ticket not found",
      });
    }

    const messages = db
      .prepare(`
        SELECT
          stm.id,
          stm.ticket_id,
          stm.organization_id,
          stm.user_id,
          stm.sender_type,
          stm.message,
          stm.is_internal,
          stm.created_at,
          u.name AS user_name,
          u.email AS user_email,
          u.role AS user_role
        FROM support_ticket_messages stm
        LEFT JOIN users u
          ON u.id = stm.user_id
         AND u.organization_id = stm.organization_id
        WHERE stm.ticket_id = ?
          AND stm.organization_id = ?
          AND stm.is_internal = 0
        ORDER BY datetime(stm.created_at) ASC, stm.id ASC
      `)
      .all(ticketId, row.organization_id) as any[];

    return res.json({
      ticket: serializeSuperAdminSupportTicket(row),
      messages: messages.map((message) => ({
        id: message.id,
        message: message.message,
        senderType: message.sender_type,
        createdAt: message.created_at,
        user: message.user_id
          ? {
              id: message.user_id,
              name: message.user_name,
              email: message.user_email,
              role: message.user_role,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Super Admin support ticket detail error:", error);
    return res.status(500).json({
      message: "Failed to load support ticket",
    });
  }
});

router.post("/support/:id/messages", (req: SuperAdminRequest, res) => {
  const ticketId = Number(req.params.id);
  const message =
    typeof req.body?.message === "string"
      ? req.body.message.trim()
      : "";

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      message: "Invalid support ticket ID",
    });
  }

  if (!message || message.length > 5000) {
    return res.status(400).json({
      message: "Reply is required and must be 5,000 characters or fewer.",
    });
  }

  try {
    const ticket = db
      .prepare(`
        SELECT id, organization_id, created_by, ticket_number, subject, status
        FROM support_tickets
        WHERE id = ?
        LIMIT 1
      `)
      .get(ticketId) as
      | {
          id: number;
          organization_id: number;
          created_by: number;
          ticket_number: string;
          subject: string;
          status: string;
        }
      | undefined;

    if (!ticket) {
      return res.status(404).json({
        message: "Support ticket not found",
      });
    }

    if (ticket.status === "closed") {
      return res.status(409).json({
        message: "Closed support tickets cannot receive new replies.",
        code: "SUPPORT_TICKET_CLOSED",
      });
    }

    const addReply = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO support_ticket_messages (
            ticket_id,
            organization_id,
            user_id,
            sender_type,
            message,
            is_internal
          )
          VALUES (?, ?, NULL, 'support', ?, 0)
        `)
        .run(ticketId, ticket.organization_id, message);

      db.prepare(`
        UPDATE support_tickets
        SET
          status = CASE
            WHEN status IN ('open', 'waiting_customer')
              THEN 'in_progress'
            ELSE status
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(ticketId);

      return Number(result.lastInsertRowid);
    });

    const messageId = addReply();

    tryCreateNotification({
      organizationId: ticket.organization_id,
      userId: ticket.created_by,
      type: "support",
      severity: "info",
      title: "Support replied",
      message: `Support replied to ticket ${ticket.ticket_number}: ${ticket.subject}.`,
      entityType: "support_ticket",
      entityId: ticket.id,
      actionUrl: "/support",
    });

    return res.status(201).json({
      message: "Support reply sent successfully",
      reply: {
        id: messageId,
        message,
        senderType: "support",
        supportAgent: req.superAdmin?.email || null,
      },
    });
  } catch (error) {
    console.error("Super Admin support reply error:", error);
    return res.status(500).json({
      message: "Failed to send support reply",
    });
  }
});

router.patch("/support/:id", (req, res) => {
  const ticketId = Number(req.params.id);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      message: "Invalid support ticket ID",
    });
  }

  const requestedStatus =
    req.body?.status === undefined
      ? undefined
      : normalizeSupportStatus(req.body.status);

  const requestedPriority =
    req.body?.priority === undefined
      ? undefined
      : normalizeSupportPriority(req.body.priority);

  if (requestedStatus === undefined && requestedPriority === undefined) {
    return res.status(400).json({
      message: "Provide a status or priority to update",
    });
  }

  if (
    requestedStatus !== undefined &&
    ![
      "open",
      "in_progress",
      "waiting_customer",
      "resolved",
      "closed",
    ].includes(requestedStatus)
  ) {
    return res.status(400).json({
      message: "Invalid support ticket status",
    });
  }

  if (
    requestedPriority !== undefined &&
    !["low", "normal", "high", "urgent"].includes(requestedPriority)
  ) {
    return res.status(400).json({
      message: "Invalid support ticket priority",
    });
  }

  try {
    const existing = db
      .prepare(`
        SELECT id, organization_id, created_by, ticket_number, subject, status, priority
        FROM support_tickets
        WHERE id = ?
        LIMIT 1
      `)
      .get(ticketId) as
      | {
          id: number;
          organization_id: number;
          created_by: number;
          ticket_number: string;
          subject: string;
          status: string;
          priority: string;
        }
      | undefined;

    if (!existing) {
      return res.status(404).json({
        message: "Support ticket not found",
      });
    }

    const nextStatus = requestedStatus ?? existing.status;
    const nextPriority = requestedPriority ?? existing.priority;

    db.prepare(`
      UPDATE support_tickets
      SET
        status = ?,
        priority = ?,
        resolved_at = CASE
          WHEN ? = 'resolved'
            THEN COALESCE(resolved_at, CURRENT_TIMESTAMP)
          WHEN ? <> 'resolved'
            THEN NULL
          ELSE resolved_at
        END,
        closed_at = CASE
          WHEN ? = 'closed'
            THEN COALESCE(closed_at, CURRENT_TIMESTAMP)
          WHEN ? <> 'closed'
            THEN NULL
          ELSE closed_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextStatus,
      nextPriority,
      nextStatus,
      nextStatus,
      nextStatus,
      nextStatus,
      ticketId
    );

    const statusChanged = nextStatus !== existing.status;

    if (statusChanged) {
      const statusLabels: Record<string, string> = {
        open: "Open",
        in_progress: "In progress",
        waiting_customer: "Waiting for customer",
        resolved: "Resolved",
        closed: "Closed",
      };

      const severity =
        nextStatus === "resolved"
          ? "success"
          : nextStatus === "closed"
            ? "info"
            : nextStatus === "waiting_customer"
              ? "warning"
              : "info";

      tryCreateNotification({
        organizationId: existing.organization_id,
        userId: existing.created_by,
        type: "support",
        severity,
        title: "Support ticket status updated",
        message: `Ticket ${existing.ticket_number}: ${existing.subject} is now ${statusLabels[nextStatus] || nextStatus}.`,
        entityType: "support_ticket",
        entityId: existing.id,
        actionUrl: "/support",
      });
    }

    const updated = db
      .prepare(`
        ${superAdminSupportTicketSelect}
        WHERE st.id = ?
        LIMIT 1
      `)
      .get(ticketId) as any;

    return res.json({
      message: "Support ticket updated successfully",
      ticket: serializeSuperAdminSupportTicket(updated),
    });
  } catch (error) {
    console.error("Super Admin support ticket update error:", error);
    return res.status(500).json({
      message: "Failed to update support ticket",
    });
  }
});


export default router;
