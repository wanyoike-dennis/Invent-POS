import type {
  Request,
  Response,
  NextFunction,
} from "express";
import jwt from "jsonwebtoken";
import db from "../database/db.js";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "invent-pos-secret-key";

export interface AuthRequest
  extends Request {
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId: number;
  };
}

type SessionAccountRow = {
  id: number;
  user_is_active: number;
  organization_id: number | null;
  organization_status: string | null;
  trial_ends_at: string | null;
  subscription_expires_at:
    | string
    | null;
};

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader =
    req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message:
        "Access denied. No token provided.",
    });
  }

  const [scheme, token] =
    authHeader.split(" ");

  if (
    scheme !== "Bearer" ||
    !token
  ) {
    return res.status(401).json({
      message:
        "Invalid authorization header.",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    ) as {
      id: number;
      name: string;
      email: string;
      role: string;
      organizationId: number;
    };

    if (
      !decoded.organizationId ||
      !Number.isInteger(
        decoded.organizationId
      )
    ) {
      return res.status(401).json({
        message:
          "Your session is outdated. Please log in again.",
      });
    }

    const account = db
      .prepare(`
        SELECT
          users.id,
          users.is_active
            AS user_is_active,
          users.organization_id,
          organizations.status
            AS organization_status,
          organizations.trial_ends_at,
          organizations.subscription_expires_at
        FROM users
        LEFT JOIN organizations
          ON organizations.id =
            users.organization_id
        WHERE users.id = ?
          AND users.organization_id = ?
        LIMIT 1
      `)
      .get(
        decoded.id,
        decoded.organizationId
      ) as
      | SessionAccountRow
      | undefined;

    if (!account) {
      return res.status(401).json({
        message:
          "This account is no longer available. Please log in again.",
      });
    }

    if (
      Number(
        account.user_is_active
      ) !== 1
    ) {
      return res.status(403).json({
        code: "USER_DEACTIVATED",
        message:
          "This account has been deactivated. Contact your organization Admin.",
      });
    }

    if (
      !account.organization_id
    ) {
      return res.status(403).json({
        code:
          "ORGANIZATION_MISSING",
        message:
          "This account is not assigned to an organization.",
      });
    }

    const organizationStatus =
      String(
        account.organization_status ||
          "active"
      ).toLowerCase();

    if (
      organizationStatus ===
      "suspended"
    ) {
      return res.status(403).json({
        code:
          "ORGANIZATION_SUSPENDED",
        message:
          "This organization has been suspended. Contact Invent POS support.",
      });
    }

    if (
      organizationStatus ===
      "expired"
    ) {
      return res.status(403).json({
        code:
          "ORGANIZATION_EXPIRED",
        message:
          "This organization's subscription has expired. Contact Invent POS support.",
      });
    }

    const now = new Date();

    if (
      organizationStatus ===
        "trial" &&
      account.trial_ends_at
    ) {
      const trialEndsAt =
        new Date(
          account.trial_ends_at
        );

      if (
        !Number.isNaN(
          trialEndsAt.getTime()
        ) &&
        trialEndsAt.getTime() <
          now.getTime()
      ) {
        return res
          .status(403)
          .json({
            code:
              "ORGANIZATION_TRIAL_EXPIRED",
            message:
              "This organization's trial period has ended. Contact Invent POS support.",
          });
      }
    }

    if (
      organizationStatus ===
        "active" &&
      account.subscription_expires_at
    ) {
      const subscriptionExpiresAt =
        new Date(
          account.subscription_expires_at
        );

      if (
        !Number.isNaN(
          subscriptionExpiresAt.getTime()
        ) &&
        subscriptionExpiresAt.getTime() <
          now.getTime()
      ) {
        return res
          .status(403)
          .json({
            code:
              "ORGANIZATION_SUBSCRIPTION_EXPIRED",
            message:
              "This organization's subscription has expired. Contact Invent POS support.",
          });
      }
    }

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message:
        "Invalid or expired token.",
    });
  }
};

export const authorizeRoles = (
  ...allowedRoles: string[]
) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required.",
      });
    }

    const userRole = String(
      req.user.role || ""
    ).toLowerCase();

    const normalizedAllowedRoles =
      allowedRoles.map((role) =>
        role.toLowerCase()
      );

    if (
      !normalizedAllowedRoles.includes(
        userRole
      )
    ) {
      return res.status(403).json({
        message:
          "You do not have permission to perform this action.",
      });
    }

    next();
  };
};
