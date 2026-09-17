import { Router } from "express";
import db from "../database/db.js";
import {
  authorizeRoles,
  type AuthRequest,
} from "../middleware/authMiddleware.js";

const router = Router();

type BranchRow = {
  id: number;
  organization_id: number;
  name: string;
  code: string | null;
  is_active: number;
};

type ProductRow = {
  id: number;
  name: string;
  organization_id: number;
};

type TransferItemInput = {
  productId?: unknown;
  quantity?: unknown;
};

const getOrganizationBranch = (
  organizationId: number,
  branchId: number
): BranchRow | undefined =>
  db
    .prepare(`
      SELECT
        id,
        organization_id,
        name,
        code,
        is_active
      FROM branches
      WHERE id = ?
        AND organization_id = ?
      LIMIT 1
    `)
    .get(branchId, organizationId) as BranchRow | undefined;

const generateTransferNumber = (organizationId: number) => {
  const latest = db
    .prepare(`
      SELECT id
      FROM stock_transfers
      WHERE organization_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(organizationId) as { id: number } | undefined;

  const nextSequence = (latest?.id ?? 0) + 1;
  return `TRF-${String(nextSequence).padStart(6, "0")}`;
};

router.get(
  "/history",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const rawBranchId = req.query.branchId;

    let branchId: number | null = null;

    if (rawBranchId !== undefined) {
      branchId = Number(rawBranchId);

      if (!Number.isInteger(branchId) || branchId <= 0) {
        return res.status(400).json({
          message: "A valid branchId is required",
        });
      }

      const branch = getOrganizationBranch(organizationId, branchId);

      if (!branch) {
        return res.status(404).json({
          message: "Branch not found",
        });
      }
    }

    const transfers = branchId
      ? db
          .prepare(`
            SELECT
              st.id,
              st.transfer_number,
              st.status,
              st.notes,
              st.transferred_at,
              st.created_at,
              st.from_branch_id,
              fb.name AS from_branch_name,
              fb.code AS from_branch_code,
              st.to_branch_id,
              tb.name AS to_branch_name,
              tb.code AS to_branch_code,
              st.transferred_by,
              u.name AS transferred_by_name,
              COUNT(sti.id) AS item_count,
              COALESCE(SUM(sti.quantity), 0) AS total_units
            FROM stock_transfers st
            INNER JOIN branches fb
              ON fb.id = st.from_branch_id
              AND fb.organization_id = st.organization_id
            INNER JOIN branches tb
              ON tb.id = st.to_branch_id
              AND tb.organization_id = st.organization_id
            LEFT JOIN users u
              ON u.id = st.transferred_by
              AND u.organization_id = st.organization_id
            LEFT JOIN stock_transfer_items sti
              ON sti.transfer_id = st.id
            WHERE st.organization_id = ?
              AND (
                st.from_branch_id = ?
                OR st.to_branch_id = ?
              )
            GROUP BY st.id
            ORDER BY st.transferred_at DESC, st.id DESC
          `)
          .all(organizationId, branchId, branchId)
      : db
          .prepare(`
            SELECT
              st.id,
              st.transfer_number,
              st.status,
              st.notes,
              st.transferred_at,
              st.created_at,
              st.from_branch_id,
              fb.name AS from_branch_name,
              fb.code AS from_branch_code,
              st.to_branch_id,
              tb.name AS to_branch_name,
              tb.code AS to_branch_code,
              st.transferred_by,
              u.name AS transferred_by_name,
              COUNT(sti.id) AS item_count,
              COALESCE(SUM(sti.quantity), 0) AS total_units
            FROM stock_transfers st
            INNER JOIN branches fb
              ON fb.id = st.from_branch_id
              AND fb.organization_id = st.organization_id
            INNER JOIN branches tb
              ON tb.id = st.to_branch_id
              AND tb.organization_id = st.organization_id
            LEFT JOIN users u
              ON u.id = st.transferred_by
              AND u.organization_id = st.organization_id
            LEFT JOIN stock_transfer_items sti
              ON sti.transfer_id = st.id
            WHERE st.organization_id = ?
            GROUP BY st.id
            ORDER BY st.transferred_at DESC, st.id DESC
          `)
          .all(organizationId);

    res.json({ transfers });
  }
);

router.get(
  "/:id",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const transferId = Number(req.params.id);

    if (!Number.isInteger(transferId) || transferId <= 0) {
      return res.status(400).json({
        message: "Invalid transfer ID",
      });
    }

    const transfer = db
      .prepare(`
        SELECT
          st.id,
          st.transfer_number,
          st.status,
          st.notes,
          st.transferred_at,
          st.created_at,
          st.from_branch_id,
          fb.name AS from_branch_name,
          fb.code AS from_branch_code,
          st.to_branch_id,
          tb.name AS to_branch_name,
          tb.code AS to_branch_code,
          st.transferred_by,
          u.name AS transferred_by_name
        FROM stock_transfers st
        INNER JOIN branches fb
          ON fb.id = st.from_branch_id
          AND fb.organization_id = st.organization_id
        INNER JOIN branches tb
          ON tb.id = st.to_branch_id
          AND tb.organization_id = st.organization_id
        LEFT JOIN users u
          ON u.id = st.transferred_by
          AND u.organization_id = st.organization_id
        WHERE st.id = ?
          AND st.organization_id = ?
        LIMIT 1
      `)
      .get(transferId, organizationId);

    if (!transfer) {
      return res.status(404).json({
        message: "Stock transfer not found",
      });
    }

    const items = db
      .prepare(`
        SELECT
          sti.id,
          sti.product_id,
          p.name AS product_name,
          sti.quantity,
          sti.from_stock_before,
          sti.from_stock_after,
          sti.to_stock_before,
          sti.to_stock_after,
          sti.created_at
        FROM stock_transfer_items sti
        INNER JOIN products p
          ON p.id = sti.product_id
        WHERE sti.transfer_id = ?
          AND p.organization_id = ?
        ORDER BY sti.id ASC
      `)
      .all(transferId, organizationId);

    res.json({
      transfer,
      items,
    });
  }
);

router.post(
  "/",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const transferredBy = req.user!.id;

    const fromBranchId = Number(req.body?.fromBranchId);
    const toBranchId = Number(req.body?.toBranchId);
    const notes =
      typeof req.body?.notes === "string" && req.body.notes.trim()
        ? req.body.notes.trim()
        : null;
    const rawItems = req.body?.items;

    if (!Number.isInteger(fromBranchId) || fromBranchId <= 0) {
      return res.status(400).json({
        message: "A valid source branch is required",
      });
    }

    if (!Number.isInteger(toBranchId) || toBranchId <= 0) {
      return res.status(400).json({
        message: "A valid destination branch is required",
      });
    }

    if (fromBranchId === toBranchId) {
      return res.status(400).json({
        message: "Source and destination branches must be different",
      });
    }

    const fromBranch = getOrganizationBranch(
      organizationId,
      fromBranchId
    );
    const toBranch = getOrganizationBranch(
      organizationId,
      toBranchId
    );

    if (!fromBranch) {
      return res.status(404).json({
        message: "Source branch not found",
      });
    }

    if (!toBranch) {
      return res.status(404).json({
        message: "Destination branch not found",
      });
    }

    if (fromBranch.is_active !== 1) {
      return res.status(400).json({
        message: "Source branch is inactive",
      });
    }

    if (toBranch.is_active !== 1) {
      return res.status(400).json({
        message: "Destination branch is inactive",
      });
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({
        message: "At least one product is required for the transfer",
      });
    }

    const normalizedItems: { productId: number; quantity: number }[] = [];
    const seenProductIds = new Set<number>();

    for (const rawItem of rawItems as TransferItemInput[]) {
      const productId = Number(rawItem?.productId);
      const quantity = Number(rawItem?.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          message: "Every transfer item must have a valid productId",
        });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: "Transfer quantities must be positive whole numbers",
        });
      }

      if (seenProductIds.has(productId)) {
        return res.status(400).json({
          message: "The same product cannot appear more than once in one transfer",
        });
      }

      seenProductIds.add(productId);
      normalizedItems.push({ productId, quantity });
    }

    try {
      const createTransfer = db.transaction(() => {
        const validatedItems = normalizedItems.map((item) => {
          const product = db
            .prepare(`
              SELECT
                id,
                name,
                organization_id
              FROM products
              WHERE id = ?
                AND organization_id = ?
              LIMIT 1
            `)
            .get(item.productId, organizationId) as ProductRow | undefined;

          if (!product) {
            throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
          }

          const sourceInventory = db
            .prepare(`
              SELECT stock
              FROM branch_inventory
              WHERE organization_id = ?
                AND branch_id = ?
                AND product_id = ?
              LIMIT 1
            `)
            .get(
              organizationId,
              fromBranchId,
              item.productId
            ) as { stock: number } | undefined;

          const destinationInventory = db
            .prepare(`
              SELECT stock
              FROM branch_inventory
              WHERE organization_id = ?
                AND branch_id = ?
                AND product_id = ?
              LIMIT 1
            `)
            .get(
              organizationId,
              toBranchId,
              item.productId
            ) as { stock: number } | undefined;

          const fromStockBefore = Number(sourceInventory?.stock ?? 0);
          const toStockBefore = Number(destinationInventory?.stock ?? 0);

          if (fromStockBefore < item.quantity) {
            throw new Error(
              `INSUFFICIENT_STOCK:${product.name}:${fromStockBefore}:${item.quantity}`
            );
          }

          return {
            ...item,
            product,
            fromStockBefore,
            fromStockAfter: fromStockBefore - item.quantity,
            toStockBefore,
            toStockAfter: toStockBefore + item.quantity,
          };
        });

        let transferNumber = generateTransferNumber(organizationId);

        const insertTransfer = db.prepare(`
          INSERT INTO stock_transfers (
            organization_id,
            transfer_number,
            from_branch_id,
            to_branch_id,
            status,
            notes,
            transferred_by,
            transferred_at
          )
          VALUES (?, ?, ?, ?, 'completed', ?, ?, CURRENT_TIMESTAMP)
        `);

        let transferResult;

        try {
          transferResult = insertTransfer.run(
            organizationId,
            transferNumber,
            fromBranchId,
            toBranchId,
            notes,
            transferredBy
          );
        } catch (error: any) {
          if (
            String(error?.message || "").includes(
              "stock_transfers.organization_id, stock_transfers.transfer_number"
            )
          ) {
            transferNumber = `TRF-${Date.now()}`;
            transferResult = insertTransfer.run(
              organizationId,
              transferNumber,
              fromBranchId,
              toBranchId,
              notes,
              transferredBy
            );
          } else {
            throw error;
          }
        }

        const transferId = Number(transferResult.lastInsertRowid);

        const updateSource = db.prepare(`
          UPDATE branch_inventory
          SET
            stock = stock - ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = ?
            AND branch_id = ?
            AND product_id = ?
            AND stock >= ?
        `);

        const upsertDestination = db.prepare(`
          INSERT INTO branch_inventory (
            organization_id,
            branch_id,
            product_id,
            stock,
            updated_at
          )
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(branch_id, product_id)
          DO UPDATE SET
            stock = branch_inventory.stock + excluded.stock,
            updated_at = CURRENT_TIMESTAMP
        `);

        const insertTransferItem = db.prepare(`
          INSERT INTO stock_transfer_items (
            transfer_id,
            product_id,
            quantity,
            from_stock_before,
            from_stock_after,
            to_stock_before,
            to_stock_after
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMovement = db.prepare(`
          INSERT INTO stock_movements (
            product_id,
            type,
            quantity,
            reason,
            organization_id,
            branch_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of validatedItems) {
          const sourceUpdate = updateSource.run(
            item.quantity,
            organizationId,
            fromBranchId,
            item.productId,
            item.quantity
          );

          if (sourceUpdate.changes !== 1) {
            throw new Error(
              `INSUFFICIENT_STOCK:${item.product.name}:${item.fromStockBefore}:${item.quantity}`
            );
          }

          upsertDestination.run(
            organizationId,
            toBranchId,
            item.productId,
            item.quantity
          );

          insertTransferItem.run(
            transferId,
            item.productId,
            item.quantity,
            item.fromStockBefore,
            item.fromStockAfter,
            item.toStockBefore,
            item.toStockAfter
          );

          insertMovement.run(
            item.productId,
            "out",
            item.quantity,
            `Transfer ${transferNumber} to ${toBranch.name}${
              toBranch.code ? ` (${toBranch.code})` : ""
            }`,
            organizationId,
            fromBranchId
          );

          insertMovement.run(
            item.productId,
            "in",
            item.quantity,
            `Transfer ${transferNumber} from ${fromBranch.name}${
              fromBranch.code ? ` (${fromBranch.code})` : ""
            }`,
            organizationId,
            toBranchId
          );
        }

        return {
          transferId,
          transferNumber,
          items: validatedItems,
        };
      });

      const result = createTransfer();

      const organizationStock = result.items.map((item) => {
        const aggregate = db
          .prepare(`
            SELECT stock
            FROM products
            WHERE id = ?
              AND organization_id = ?
            LIMIT 1
          `)
          .get(item.productId, organizationId) as
          | { stock: number }
          | undefined;

        return {
          product_id: item.productId,
          product_name: item.product.name,
          organization_stock: Number(aggregate?.stock ?? 0),
        };
      });

      return res.status(201).json({
        message: "Stock transfer completed successfully",
        transfer: {
          id: result.transferId,
          transfer_number: result.transferNumber,
          from_branch: {
            id: fromBranch.id,
            name: fromBranch.name,
            code: fromBranch.code,
          },
          to_branch: {
            id: toBranch.id,
            name: toBranch.name,
            code: toBranch.code,
          },
          notes,
          items: result.items.map((item) => ({
            product_id: item.productId,
            product_name: item.product.name,
            quantity: item.quantity,
            from_stock_before: item.fromStockBefore,
            from_stock_after: item.fromStockAfter,
            to_stock_before: item.toStockBefore,
            to_stock_after: item.toStockAfter,
          })),
          organization_stock: organizationStock,
        },
      });
    } catch (error: any) {
      const message = String(error?.message || "");

      if (message.startsWith("PRODUCT_NOT_FOUND:")) {
        return res.status(404).json({
          message: "One of the selected products was not found",
        });
      }

      if (message.startsWith("INSUFFICIENT_STOCK:")) {
        const [, productName, available, requested] = message.split(":");

        return res.status(400).json({
          message: `Insufficient stock for ${productName}. Available: ${available}, requested: ${requested}.`,
          code: "INSUFFICIENT_BRANCH_STOCK",
        });
      }

      console.error("Error creating stock transfer:", error);

      return res.status(500).json({
        message: "Failed to complete stock transfer",
      });
    }
  }
);

export default router;
