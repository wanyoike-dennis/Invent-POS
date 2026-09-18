import db from "../database/db.js";

export type NotificationType =
  | "inventory"
  | "support"
  | "subscription"
  | "staff"
  | "security"
  | "system";

export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

export type NotificationInput = {
  organizationId: number;
  userId?: number | null;
  branchId?: number | null;
  type?: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | number | null;
  actionUrl?: string | null;
};

const normalizeRequiredText = (
  value: string,
  fieldName: string
) => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} is required for notification creation`
    );
  }

  return normalized;
};

const normalizeOptionalText = (
  value?: string | number | null
) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

export const createNotification = (
  input: NotificationInput
) => {
  const organizationId = Number(input.organizationId);

  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0
  ) {
    throw new Error(
      "A valid organizationId is required for notification creation"
    );
  }

  const userId =
    input.userId === null ||
    input.userId === undefined
      ? null
      : Number(input.userId);

  const branchId =
    input.branchId === null ||
    input.branchId === undefined
      ? null
      : Number(input.branchId);

  if (
    userId !== null &&
    (!Number.isInteger(userId) || userId <= 0)
  ) {
    throw new Error(
      "userId must be a valid positive integer when provided"
    );
  }

  if (
    branchId !== null &&
    (!Number.isInteger(branchId) || branchId <= 0)
  ) {
    throw new Error(
      "branchId must be a valid positive integer when provided"
    );
  }

  const type: NotificationType =
    input.type ?? "system";

  const severity: NotificationSeverity =
    input.severity ?? "info";

  const title = normalizeRequiredText(
    input.title,
    "title"
  );

  const message = normalizeRequiredText(
    input.message,
    "message"
  );

  const entityType = normalizeOptionalText(
    input.entityType
  );

  const entityId = normalizeOptionalText(
    input.entityId
  );

  const actionUrl = normalizeOptionalText(
    input.actionUrl
  );

  const result = db
    .prepare(`
      INSERT INTO notifications (
        organization_id,
        user_id,
        branch_id,
        type,
        severity,
        title,
        message,
        entity_type,
        entity_id,
        action_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      organizationId,
      userId,
      branchId,
      type,
      severity,
      title,
      message,
      entityType,
      entityId,
      actionUrl
    );

  return {
    id: Number(result.lastInsertRowid),
    organizationId,
    userId,
    branchId,
    type,
    severity,
    title,
    message,
    entityType,
    entityId,
    actionUrl,
    isRead: false,
  };
};

/**
 * Use this for secondary/non-critical notification writes.
 * A business operation should not fail only because creating
 * its notification failed.
 */
export const tryCreateNotification = (
  input: NotificationInput
) => {
  try {
    return createNotification(input);
  } catch (error) {
    console.error(
      "Notification creation failed:",
      error
    );
    return null;
  }
};
