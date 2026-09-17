import { Router } from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = Router();

type SupportLevelRow = {
  feature_value: string | null;
};

type BranchRow = {
  id: number;
  name: string;
  code: string | null;
  is_active: number;
};

const ALLOWED_CATEGORIES = new Set([
  "general",
  "technical",
  "billing",
  "account",
  "sales",
  "inventory",
  "reports",
  "other",
]);

const ALLOWED_PRIORITIES = new Set([
  "low",
  "normal",
  "high",
  "urgent",
]);

const normalizeSupportLevel = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "dedicated") return "Dedicated";
  if (normalized === "priority") return "Priority";
  return "Standard";
};

const getOrganizationSupportLevel = (organizationId: number) => {
  const row = db
    .prepare(`
      SELECT spf.feature_value
      FROM organizations o
      INNER JOIN subscription_plans sp
        ON LOWER(sp.code) = LOWER(o.subscription_plan)
      INNER JOIN subscription_plan_features spf
        ON spf.plan_id = sp.id
      WHERE o.id = ?
        AND spf.feature_key = 'support'
      LIMIT 1
    `)
    .get(organizationId) as SupportLevelRow | undefined;

  return normalizeSupportLevel(row?.feature_value);
};

const getTicketNumber = (organizationId: number) => {
  const datePart = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `SUP-${datePart}-${randomPart}`;

    const exists = db
      .prepare(`
        SELECT id
        FROM support_tickets
        WHERE organization_id = ?
          AND ticket_number = ?
        LIMIT 1
      `)
      .get(organizationId, ticketNumber);

    if (!exists) {
      return ticketNumber;
    }
  }

  return `SUP-${datePart}-${Date.now().toString().slice(-8)}`;
};

const getBranchForTicket = (
  organizationId: number,
  requestedBranchId: unknown,
  homeBranchId: number | null | undefined,
  role: string | undefined
) => {
  let branchId: number | null = null;

  if (role === "cashier") {
    branchId = homeBranchId ? Number(homeBranchId) : null;
  } else if (
    requestedBranchId !== undefined &&
    requestedBranchId !== null &&
    String(requestedBranchId).trim() !== ""
  ) {
    const parsed = Number(requestedBranchId);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("INVALID_BRANCH");
    }

    branchId = parsed;
  } else if (homeBranchId) {
    branchId = Number(homeBranchId);
  }

  if (!branchId) {
    return null;
  }

  const branch = db
    .prepare(`
      SELECT id, name, code, is_active
      FROM branches
      WHERE id = ?
        AND organization_id = ?
      LIMIT 1
    `)
    .get(branchId, organizationId) as BranchRow | undefined;

  if (!branch) {
    throw new Error("BRANCH_NOT_FOUND");
  }

  if (branch.is_active !== 1) {
    throw new Error("BRANCH_INACTIVE");
  }

  return branch;
};

const serializeTicket = (row: any) => ({
  id: row.id,
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

const ticketSelect = `
  SELECT
    st.*,
    b.name AS branch_name,
    b.code AS branch_code,
    u.name AS created_by_name,
    u.email AS created_by_email,
    u.role AS created_by_role
  FROM support_tickets st
  LEFT JOIN branches b
    ON b.id = st.branch_id
   AND b.organization_id = st.organization_id
  LEFT JOIN users u
    ON u.id = st.created_by
   AND u.organization_id = st.organization_id
`;

// ============================================================
// SUPPORT OVERVIEW / ENTITLEMENT
// GET /api/support/overview
// ============================================================

router.get("/overview", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const supportLevel = getOrganizationSupportLevel(organizationId);

    const counts = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'waiting_customer' THEN 1 ELSE 0 END) AS waiting_customer,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
        FROM support_tickets
        WHERE organization_id = ?
      `)
      .get(organizationId) as any;

    return res.json({
      supportLevel,
      counts: {
        total: Number(counts?.total || 0),
        open: Number(counts?.open || 0),
        inProgress: Number(counts?.in_progress || 0),
        waitingCustomer: Number(counts?.waiting_customer || 0),
        resolved: Number(counts?.resolved || 0),
        closed: Number(counts?.closed || 0),
      },
    });
  } catch (error) {
    console.error("Support overview error:", error);

    return res.status(500).json({
      message: "Failed to load support overview",
    });
  }
});

// ============================================================
// LIST TENANT SUPPORT TICKETS
// GET /api/support
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim()
        : "";

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const page = Math.max(1, Number(req.query.page) || 1);
    const requestedLimit = Number(req.query.limit) || 20;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const offset = (page - 1) * limit;

    const conditions = ["st.organization_id = ?"];
    const params: any[] = [organizationId];

    if (status) {
      const allowedStatuses = new Set([
        "open",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ]);

      if (!allowedStatuses.has(status)) {
        return res.status(400).json({
          message: "Invalid ticket status",
        });
      }

      conditions.push("st.status = ?");
      params.push(status);
    }

    if (search) {
      conditions.push(`
        (
          st.ticket_number LIKE ?
          OR st.subject LIKE ?
          OR st.description LIKE ?
          OR st.category LIKE ?
        )
      `);

      const value = `%${search}%`;
      params.push(value, value, value, value);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const countRow = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM support_tickets st
        ${where}
      `)
      .get(...params) as { total: number };

    const rows = db
      .prepare(`
        ${ticketSelect}
        ${where}
        ORDER BY
          CASE st.status
            WHEN 'open' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'waiting_customer' THEN 2
            WHEN 'resolved' THEN 3
            ELSE 4
          END,
          st.updated_at DESC,
          st.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const total = Number(countRow?.total || 0);

    return res.json({
      supportLevel: getOrganizationSupportLevel(organizationId),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      tickets: rows.map(serializeTicket),
    });
  } catch (error) {
    console.error("Support ticket list error:", error);

    return res.status(500).json({
      message: "Failed to load support tickets",
    });
  }
});

// ============================================================
// CREATE SUPPORT TICKET
// POST /api/support
// ============================================================

router.post("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const createdBy = req.user!.id;

  try {
    const {
      subject,
      description,
      category = "general",
      priority = "normal",
      branchId,
    } = req.body || {};

    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.trim().length > 160
    ) {
      return res.status(400).json({
        message: "Subject is required and must be 160 characters or fewer.",
      });
    }

    if (
      typeof description !== "string" ||
      !description.trim() ||
      description.trim().length > 5000
    ) {
      return res.status(400).json({
        message:
          "Description is required and must be 5,000 characters or fewer.",
      });
    }

    const normalizedCategory = String(category)
      .trim()
      .toLowerCase();

    if (!ALLOWED_CATEGORIES.has(normalizedCategory)) {
      return res.status(400).json({
        message: "Invalid support category",
      });
    }

    const normalizedPriority = String(priority)
      .trim()
      .toLowerCase();

    if (!ALLOWED_PRIORITIES.has(normalizedPriority)) {
      return res.status(400).json({
        message: "Invalid ticket priority",
      });
    }

    let branch: BranchRow | null;

    try {
      branch = getBranchForTicket(
        organizationId,
        branchId,
        req.user?.branchId,
        req.user?.role
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_BRANCH") {
        return res.status(400).json({
          message: "Invalid branchId",
        });
      }

      if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") {
        return res.status(404).json({
          message: "Branch not found",
        });
      }

      if (error instanceof Error && error.message === "BRANCH_INACTIVE") {
        return res.status(400).json({
          message: "Support tickets cannot be opened for an inactive branch.",
        });
      }

      throw error;
    }

    const supportLevel = getOrganizationSupportLevel(organizationId);
    const ticketNumber = getTicketNumber(organizationId);

    const createTicket = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO support_tickets (
            organization_id,
            branch_id,
            created_by,
            ticket_number,
            subject,
            description,
            category,
            priority,
            status,
            support_level
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
        `)
        .run(
          organizationId,
          branch?.id ?? null,
          createdBy,
          ticketNumber,
          subject.trim(),
          description.trim(),
          normalizedCategory,
          normalizedPriority,
          supportLevel
        );

      const ticketId = Number(result.lastInsertRowid);

      db.prepare(`
        INSERT INTO support_ticket_messages (
          ticket_id,
          organization_id,
          user_id,
          sender_type,
          message,
          is_internal
        )
        VALUES (?, ?, ?, 'tenant', ?, 0)
      `).run(
        ticketId,
        organizationId,
        createdBy,
        description.trim()
      );

      return ticketId;
    });

    const ticketId = createTicket();

    const row = db
      .prepare(`
        ${ticketSelect}
        WHERE st.id = ?
          AND st.organization_id = ?
        LIMIT 1
      `)
      .get(ticketId, organizationId);

    return res.status(201).json({
      message: "Support ticket created successfully",
      ticket: serializeTicket(row),
    });
  } catch (error) {
    console.error("Create support ticket error:", error);

    return res.status(500).json({
      message: "Failed to create support ticket",
    });
  }
});

// ============================================================
// SUPPORT TICKET DETAILS + CONVERSATION
// GET /api/support/:id
// ============================================================

router.get("/:id", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const ticketId = Number(req.params.id);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      message: "Invalid ticket id",
    });
  }

  try {
    const row = db
      .prepare(`
        ${ticketSelect}
        WHERE st.id = ?
          AND st.organization_id = ?
        LIMIT 1
      `)
      .get(ticketId, organizationId) as any;

    if (!row) {
      return res.status(404).json({
        message: "Support ticket not found",
      });
    }

    const messages = db
      .prepare(`
        SELECT
          stm.id,
          stm.message,
          stm.sender_type,
          stm.created_at,
          stm.user_id,
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
        ORDER BY stm.created_at ASC, stm.id ASC
      `)
      .all(ticketId, organizationId) as any[];

    return res.json({
      ticket: serializeTicket(row),
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
    console.error("Support ticket details error:", error);

    return res.status(500).json({
      message: "Failed to load support ticket",
    });
  }
});

// ============================================================
// ADD TENANT REPLY
// POST /api/support/:id/messages
// ============================================================

router.post("/:id/messages", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const userId = req.user!.id;
  const ticketId = Number(req.params.id);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      message: "Invalid ticket id",
    });
  }

  const message =
    typeof req.body?.message === "string"
      ? req.body.message.trim()
      : "";

  if (!message || message.length > 5000) {
    return res.status(400).json({
      message: "Reply is required and must be 5,000 characters or fewer.",
    });
  }

  try {
    const ticket = db
      .prepare(`
        SELECT id, status
        FROM support_tickets
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .get(ticketId, organizationId) as
      | { id: number; status: string }
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
          VALUES (?, ?, ?, 'tenant', ?, 0)
        `)
        .run(ticketId, organizationId, userId, message);

      db.prepare(`
        UPDATE support_tickets
        SET
          status = CASE
            WHEN status IN ('resolved', 'waiting_customer')
              THEN 'open'
            ELSE status
          END,
          resolved_at = CASE
            WHEN status = 'resolved' THEN NULL
            ELSE resolved_at
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND organization_id = ?
      `).run(ticketId, organizationId);

      return Number(result.lastInsertRowid);
    });

    const messageId = addReply();

    return res.status(201).json({
      message: "Reply added successfully",
      reply: {
        id: messageId,
        message,
        senderType: "tenant",
        userId,
      },
    });
  } catch (error) {
    console.error("Support reply error:", error);

    return res.status(500).json({
      message: "Failed to add support reply",
    });
  }
});

export default router;
