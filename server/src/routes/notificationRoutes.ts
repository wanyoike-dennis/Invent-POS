import { Router } from "express";
import db from "../database/db.js";
import { type AuthRequest } from "../middleware/authMiddleware.js";

const router = Router();

const getNotificationVisibility = (
  organizationId: number,
  userId: number
) => ({
  where: `
    n.organization_id = ?
    AND n.user_id = ?
  `,
  params: [organizationId, userId],
});

// ============================================================
// UNREAD COUNT
// GET /api/notifications/unread-count
// ============================================================

router.get("/unread-count", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const userId = req.user!.id;

  try {
    const visibility = getNotificationVisibility(
      organizationId,
      userId
    );

    const row = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM notifications n
        WHERE ${visibility.where}
          AND n.is_read = 0
      `)
      .get(...visibility.params) as
      | { total: number }
      | undefined;

    return res.json({
      unreadCount: Number(row?.total || 0),
    });
  } catch (error) {
    console.error(
      "Notification unread count error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load unread notification count",
    });
  }
});

// ============================================================
// NOTIFICATION LIST
// GET /api/notifications
//
// Supports:
// ?status=all|unread|read
// ?type=inventory|support|subscription|staff|security|system
// ?severity=info|success|warning|critical
// ?page=1
// ?limit=20
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const userId = req.user!.id;

  try {
    const page = Math.max(
      1,
      Number(req.query.page) || 1
    );

    const requestedLimit =
      Number(req.query.limit) || 20;

    const limit = Math.min(
      100,
      Math.max(1, requestedLimit)
    );

    const offset = (page - 1) * limit;

    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "all";

    const type =
      typeof req.query.type === "string"
        ? req.query.type.trim().toLowerCase()
        : "";

    const severity =
      typeof req.query.severity === "string"
        ? req.query.severity.trim().toLowerCase()
        : "";

    const allowedStatuses = [
      "all",
      "unread",
      "read",
    ];

    const allowedTypes = [
      "inventory",
      "support",
      "subscription",
      "staff",
      "security",
      "system",
    ];

    const allowedSeverities = [
      "info",
      "success",
      "warning",
      "critical",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid notification status",
      });
    }

    if (
      type &&
      !allowedTypes.includes(type)
    ) {
      return res.status(400).json({
        message: "Invalid notification type",
      });
    }

    if (
      severity &&
      !allowedSeverities.includes(severity)
    ) {
      return res.status(400).json({
        message: "Invalid notification severity",
      });
    }

    const visibility = getNotificationVisibility(
      organizationId,
      userId
    );

    const conditions: string[] = [
      visibility.where,
    ];

    const params: any[] = [
      ...visibility.params,
    ];

    if (status === "unread") {
      conditions.push("n.is_read = 0");
    }

    if (status === "read") {
      conditions.push("n.is_read = 1");
    }

    if (type) {
      conditions.push("n.type = ?");
      params.push(type);
    }

    if (severity) {
      conditions.push("n.severity = ?");
      params.push(severity);
    }

    const where = `WHERE ${conditions.join(
      " AND "
    )}`;

    const countRow = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM notifications n
        ${where}
      `)
      .get(...params) as
      | { total: number }
      | undefined;

    const rows = db
      .prepare(`
        SELECT
          n.id,
          n.user_id,
          n.branch_id,
          n.type,
          n.severity,
          n.title,
          n.message,
          n.entity_type,
          n.entity_id,
          n.action_url,
          n.is_read,
          n.read_at,
          n.created_at,
          b.name AS branch_name,
          b.code AS branch_code
        FROM notifications n
        LEFT JOIN branches b
          ON b.id = n.branch_id
         AND b.organization_id = n.organization_id
        ${where}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const total = Number(
      countRow?.total || 0
    );

    const totalPages = Math.max(
      1,
      Math.ceil(total / limit)
    );

    const notifications = rows.map((row) => ({
      id: Number(row.id),
      userId:
        row.user_id === null
          ? null
          : Number(row.user_id),
      branch: row.branch_id
        ? {
            id: Number(row.branch_id),
            name: row.branch_name,
            code: row.branch_code,
          }
        : null,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actionUrl: row.action_url,
      isRead: Boolean(row.is_read),
      readAt: row.read_at,
      createdAt: row.created_at,
    }));

    return res.json({
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
      notifications,
    });
  } catch (error) {
    console.error(
      "Notification list error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load notifications",
    });
  }
});

// ============================================================
// MARK ONE AS READ
// PATCH /api/notifications/:id/read
// ============================================================

router.patch(
  "/:id/read",
  (req: AuthRequest, res) => {
    const organizationId =
      req.user!.organizationId;

    const userId = req.user!.id;
    const notificationId = Number(
      req.params.id
    );

    if (
      !Number.isInteger(notificationId) ||
      notificationId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid notification id",
      });
    }

    try {
      const notification = db
        .prepare(`
          SELECT id, is_read
          FROM notifications
          WHERE id = ?
            AND organization_id = ?
            AND user_id = ?
          LIMIT 1
        `)
        .get(
          notificationId,
          organizationId,
          userId
        ) as
        | {
            id: number;
            is_read: number;
          }
        | undefined;

      if (!notification) {
        return res.status(404).json({
          message: "Notification not found",
        });
      }

      if (!notification.is_read) {
        db.prepare(`
          UPDATE notifications
          SET
            is_read = 1,
            read_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND organization_id = ?
        `).run(
          notificationId,
          organizationId
        );
      }

      const updated = db
        .prepare(`
          SELECT
            id,
            is_read,
            read_at
          FROM notifications
          WHERE id = ?
            AND organization_id = ?
            AND user_id = ?
          LIMIT 1
        `)
        .get(
          notificationId,
          organizationId,
          userId
        ) as any;

      return res.json({
        message: "Notification marked as read",
        notification: {
          id: Number(updated.id),
          isRead: Boolean(updated.is_read),
          readAt: updated.read_at,
        },
      });
    } catch (error) {
      console.error(
        "Mark notification read error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to mark notification as read",
      });
    }
  }
);

// ============================================================
// MARK ALL VISIBLE NOTIFICATIONS AS READ
// PATCH /api/notifications/read-all
// ============================================================

router.patch(
  "/read-all",
  (req: AuthRequest, res) => {
    const organizationId =
      req.user!.organizationId;

    const userId = req.user!.id;

    try {
      const result = db
        .prepare(`
          UPDATE notifications
          SET
            is_read = 1,
            read_at = CURRENT_TIMESTAMP
          WHERE organization_id = ?
            AND user_id = ?
            AND is_read = 0
        `)
        .run(
          organizationId,
          userId
        );

      return res.json({
        message:
          "All notifications marked as read",
        updatedCount: Number(
          result.changes || 0
        ),
      });
    } catch (error) {
      console.error(
        "Mark all notifications read error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to mark all notifications as read",
      });
    }
  }
);

export default router;
