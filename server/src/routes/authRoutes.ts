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

        const userResult = db
          .prepare(`
            INSERT INTO users (
              name,
              email,
              password,
              role,
              organization_id
            )
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            String(name).trim(),
            normalizedEmail,
            hashedPassword,
            "admin",
            organizationId
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
// CREATE STAFF USER
// Admin only
// ============================================================

router.post(
  "/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req: AuthRequest, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "Name, email, password and role are required",
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

      const hashedPassword = await bcrypt.hash(
        String(password),
        10
      );

      const organizationId =
        req.user?.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          message:
            "Organization context is missing. Please log in again.",
        });
      }

      const result = db
        .prepare(`
          INSERT INTO users (
            name,
            email,
            password,
            role,
            organization_id
          )
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          String(name).trim(),
          normalizedEmail,
          hashedPassword,
          normalizedRole,
          organizationId
        );

      const createdUser = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            organization_id,
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
        organizations.name AS organization_name,
        organizations.slug AS organization_slug,
        organizations.currency AS organization_currency
      FROM users
      LEFT JOIN organizations
        ON organizations.id = users.organization_id
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
        organization_name: string | null;
        organization_slug: string | null;
        organization_currency: string | null;
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
      },
    },
  });
});

export default router;