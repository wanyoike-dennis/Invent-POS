import db from "../database/db.js";

export type AuditMetadata = Record<string, unknown>;

export type AuditEventInput = {
  organizationId: number;
  branchId?: number | null;
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  description?: string | null;
  metadata?: AuditMetadata | null;
};

const normalizeRequiredText = (
  value: string,
  fieldName: string
) => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required for audit logging`);
  }

  return normalized;
};

const serializeMetadata = (
  metadata?: AuditMetadata | null
) => {
  if (!metadata) {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return JSON.stringify({
      serialization_error: true,
    });
  }
};

export const logAuditEvent = (
  input: AuditEventInput
) => {
  const organizationId = Number(input.organizationId);

  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0
  ) {
    throw new Error(
      "A valid organizationId is required for audit logging"
    );
  }

  const action = normalizeRequiredText(
    input.action,
    "action"
  );

  const entityType = normalizeRequiredText(
    input.entityType,
    "entityType"
  );

  const branchId =
    input.branchId === null ||
    input.branchId === undefined
      ? null
      : Number(input.branchId);

  const userId =
    input.userId === null ||
    input.userId === undefined
      ? null
      : Number(input.userId);

  const entityId =
    input.entityId === null ||
    input.entityId === undefined
      ? null
      : String(input.entityId);

  const description =
    input.description === null ||
    input.description === undefined
      ? null
      : String(input.description).trim() || null;

  const metadata = serializeMetadata(input.metadata);

  const result = db
    .prepare(`
      INSERT INTO audit_logs (
        organization_id,
        branch_id,
        user_id,
        action,
        entity_type,
        entity_id,
        description,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      organizationId,
      branchId,
      userId,
      action,
      entityType,
      entityId,
      description,
      metadata
    );

  return {
    id: Number(result.lastInsertRowid),
    organizationId,
    branchId,
    userId,
    action,
    entityType,
    entityId,
    description,
    metadata: input.metadata ?? null,
  };
};

/**
 * Use this for secondary/non-critical audit writes where the business
 * operation must not fail solely because audit logging failed.
 */
export const tryLogAuditEvent = (
  input: AuditEventInput
) => {
  try {
    return logAuditEvent(input);
  } catch (error) {
    console.error("Audit log write failed:", error);
    return null;
  }
};
