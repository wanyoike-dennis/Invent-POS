import express from "express";
import db from "../database/db.js";
import {
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import type {
  AuthRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

type OrganizationRow = {
  id: number;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  receipt_footer: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

const cleanOptionalText = (
  value: unknown
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned || null;
};

// ============================================================
// GET LOGGED-IN ORGANIZATION
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const organization = db
      .prepare(`
        SELECT
          id,
          name,
          slug,
          phone,
          email,
          address,
          receipt_footer,
          currency,
          created_at,
          updated_at
        FROM organizations
        WHERE id = ?
      `)
      .get(organizationId) as
      | OrganizationRow
      | undefined;

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    return res.json(organization);
  } catch (error) {
    console.error(
      "Get organization error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load organization settings",
    });
  }
});

// ============================================================
// UPDATE LOGGED-IN ORGANIZATION
// ADMIN ONLY
// ============================================================

router.put(
  "/",
  authorizeRoles("admin"),
  (req: AuthRequest, res) => {
    const organizationId =
      req.user!.organizationId;

    try {
      const {
        name,
        phone,
        email,
        address,
        receipt_footer,
        currency,
      } = req.body;

      if (
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          message: "Business name is required",
        });
      }

      const businessName = name.trim();

      if (businessName.length > 120) {
        return res.status(400).json({
          message:
            "Business name is too long",
        });
      }

      const normalizedEmail =
        cleanOptionalText(email)?.toLowerCase() ??
        null;

      if (
        normalizedEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          normalizedEmail
        )
      ) {
        return res.status(400).json({
          message:
            "Enter a valid business email",
        });
      }

      const normalizedCurrency =
        typeof currency === "string" &&
        currency.trim()
          ? currency.trim().toUpperCase()
          : "KES";

      // Keep currency controlled for now.
      if (normalizedCurrency !== "KES") {
        return res.status(400).json({
          message:
            "Only KES is currently supported",
        });
      }

      const existing = db
        .prepare(`
          SELECT id
          FROM organizations
          WHERE id = ?
        `)
        .get(organizationId);

      if (!existing) {
        return res.status(404).json({
          message: "Organization not found",
        });
      }

      db.prepare(`
        UPDATE organizations
        SET
          name = ?,
          phone = ?,
          email = ?,
          address = ?,
          receipt_footer = ?,
          currency = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        businessName,
        cleanOptionalText(phone),
        normalizedEmail,
        cleanOptionalText(address),
        cleanOptionalText(receipt_footer),
        normalizedCurrency,
        organizationId
      );

      const organization = db
        .prepare(`
          SELECT
            id,
            name,
            slug,
            phone,
            email,
            address,
            receipt_footer,
            currency,
            created_at,
            updated_at
          FROM organizations
          WHERE id = ?
        `)
        .get(organizationId) as OrganizationRow;

      return res.json({
        message:
          "Organization settings updated successfully",
        organization,
      });
    } catch (error) {
      console.error(
        "Update organization error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to update organization settings",
      });
    }
  }
);

export default router;
