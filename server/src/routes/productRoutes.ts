import express from "express";
import db from "../database/db.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

type BranchRow = {
  id: number;
  name: string;
  code: string | null;
  is_active: number;
};

const getActiveOrganizationBranch = (
  organizationId: number,
  branchId: number
) => {
  return db.prepare(`
    SELECT id, name, code, is_active
    FROM branches
    WHERE id = ?
      AND organization_id = ?
      AND is_active = 1
    LIMIT 1
  `).get(branchId, organizationId) as BranchRow | undefined;
};

const getUserHomeBranch = (
  userId: number,
  organizationId: number
) => {
  return db.prepare(`
    SELECT
      b.id,
      b.name,
      b.code,
      b.is_active
    FROM users u
    INNER JOIN branches b
      ON b.id = u.branch_id
      AND b.organization_id = u.organization_id
    WHERE u.id = ?
      AND u.organization_id = ?
      AND u.is_active = 1
      AND b.is_active = 1
    LIMIT 1
  `).get(userId, organizationId) as BranchRow | undefined;
};

const resolveInventoryBranch = (
  req: AuthRequest,
  requestedBranchId?: unknown
) => {
  const organizationId = req.user!.organizationId;
  const userId = req.user?.id;

  if (!userId) {
    return {
      error: {
        status: 401,
        message: "Authenticated user not found",
      },
    };
  }

  const homeBranch = getUserHomeBranch(userId, organizationId);

  if (!homeBranch) {
    return {
      error: {
        status: 403,
        message:
          "Your account is not assigned to an active branch. Contact your organization Admin.",
      },
    };
  }

  if (
    requestedBranchId === undefined ||
    requestedBranchId === null ||
    requestedBranchId === ""
  ) {
    return { branch: homeBranch };
  }

  if (req.user?.role === "cashier") {
    return { branch: homeBranch };
  }

  const branchId = Number(requestedBranchId);

  if (!Number.isInteger(branchId) || branchId <= 0) {
    return {
      error: {
        status: 400,
        message: "Invalid branch selected",
      },
    };
  }

  const branch = getActiveOrganizationBranch(
    organizationId,
    branchId
  );

  if (!branch) {
    return {
      error: {
        status: 404,
        message: "Branch not found or inactive",
      },
    };
  }

  return { branch };
};




// ==========================================================
// BRANCH INVENTORY
// Cashiers can view only their assigned branch.
// Admins and Managers may optionally request another active branch
// in the same organization with ?branchId=<id>.
// Products without an allocation are returned with stock = 0.
// ==========================================================

router.get(
  "/branch-inventory",
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const resolved = resolveInventoryBranch(
      req,
      req.query.branchId
    );

    if ("error" in resolved) {
      return res.status(resolved.error.status).json({
        message: resolved.error.message,
      });
    }

    const branch = resolved.branch!;

    const isCashier = req.user?.role === "cashier";

    const products = isCashier
      ? db.prepare(`
          SELECT
            p.id,
            p.name,
            p.category,
            p.price,
            COALESCE(bi.stock, 0) AS stock,
            p.created_at
          FROM products p
          LEFT JOIN branch_inventory bi
            ON bi.product_id = p.id
            AND bi.branch_id = ?
            AND bi.organization_id = p.organization_id
          WHERE p.organization_id = ?
          ORDER BY p.id DESC
        `).all(branch.id, organizationId)
      : db.prepare(`
          SELECT
            p.id,
            p.name,
            p.category,
            p.cost_price,
            p.price,
            COALESCE(bi.stock, 0) AS stock,
            p.stock AS organization_stock_legacy,
            p.created_at
          FROM products p
          LEFT JOIN branch_inventory bi
            ON bi.product_id = p.id
            AND bi.branch_id = ?
            AND bi.organization_id = p.organization_id
          WHERE p.organization_id = ?
          ORDER BY p.id DESC
        `).all(branch.id, organizationId);

    return res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      products,
    });
  }
);


router.get("/", (req: AuthRequest, res) => {
  const isCashier = req.user?.role === "cashier";
  const organizationId = req.user!.organizationId;

  const products = isCashier
    ? db
        .prepare(`
          SELECT
            id,
            name,
            category,
            price,
            stock,
            created_at
          FROM products
          WHERE organization_id = ?
          ORDER BY id DESC
        `)
        .all(organizationId)
    : db
        .prepare(`
          SELECT *
          FROM products
          WHERE organization_id = ?
          ORDER BY id DESC
        `)
        .all(organizationId);

  res.json(products);
});

router.post("/", authorizeRoles("admin", "manager"), (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const { name, category, cost_price, price, stock } = req.body;

  if (!name || !category || cost_price === undefined || price === undefined || stock === undefined) {
    return res.status(400).json({
      message: "All product fields are required",
    });
  }

  const costPrice = Number(cost_price);
  const sellingPrice = Number(price);
  const stockQuantity = Number(stock);

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return res.status(400).json({
      message: "Cost price must be a valid non-negative number",
    });
  }

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return res.status(400).json({
      message: "Selling price must be a valid non-negative number",
    });
  }

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return res.status(400).json({
      message: "Stock must be a non-negative whole number",
    });
  }

  const result = db
    .prepare(`
      INSERT INTO products (
        name,
        category,
        cost_price,
        price,
        stock,
        organization_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      name,
      category,
      costPrice,
      sellingPrice,
      stockQuantity,
      organizationId
    );

  const product = db
    .prepare(`
      SELECT *
      FROM products
      WHERE id = ?
        AND organization_id = ?
    `)
    .get(result.lastInsertRowid, organizationId);

  res.status(201).json(product);
});

router.put("/:id", authorizeRoles("admin", "manager"), (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const { id } = req.params;
  const { name, category, cost_price, price, stock } = req.body;

  if (!name || !category || cost_price === undefined || price === undefined || stock === undefined) {
    return res.status(400).json({
      message: "All product fields are required",
    });
  }

  const costPrice = Number(cost_price);
  const sellingPrice = Number(price);
  const stockQuantity = Number(stock);

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return res.status(400).json({
      message: "Cost price must be a valid non-negative number",
    });
  }

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return res.status(400).json({
      message: "Selling price must be a valid non-negative number",
    });
  }

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return res.status(400).json({
      message: "Stock must be a non-negative whole number",
    });
  }

  const existingProduct = db
    .prepare(`
      SELECT id
      FROM products
      WHERE id = ?
        AND organization_id = ?
    `)
    .get(id, organizationId);

  if (!existingProduct) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  db.prepare(`
    UPDATE products
    SET name = ?, category = ?, cost_price = ?, price = ?, stock = ?
    WHERE id = ?
      AND organization_id = ?
  `).run(
    name,
    category,
    costPrice,
    sellingPrice,
    stockQuantity,
    id,
    organizationId
  );

  const product = db
    .prepare(`
      SELECT *
      FROM products
      WHERE id = ?
        AND organization_id = ?
    `)
    .get(id, organizationId);

  res.json(product);
});

router.delete("/:id", authorizeRoles("admin"), (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const { id } = req.params;

  db.prepare(
    `
      DELETE FROM products
      WHERE id = ?
        AND organization_id = ?
    `
  ).run(id, organizationId);

  res.json({
    message: "Product deleted successfully",
  });
});

router.patch("/:id/stock", authorizeRoles("admin", "manager"), (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;
  const { id } = req.params;
  const { type, quantity, reason, branchId } = req.body;

  const product = db
    .prepare(`
      SELECT id, name, stock
      FROM products
      WHERE id = ?
        AND organization_id = ?
    `)
    .get(id, organizationId) as {
      id: number;
      name: string;
      stock: number;
    } | undefined;

  if (!product) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  const resolved = resolveInventoryBranch(req, branchId);

  if ("error" in resolved) {
    return res.status(resolved.error.status).json({
      message: resolved.error.message,
    });
  }

  const branch = resolved.branch!;
  const qty = Number(quantity);

  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({
      message: "Quantity must be a positive whole number",
    });
  }

  if (type !== "in" && type !== "out") {
    return res.status(400).json({
      message: "Invalid stock adjustment type",
    });
  }

  const branchInventory = db
    .prepare(`
      SELECT stock
      FROM branch_inventory
      WHERE organization_id = ?
        AND branch_id = ?
        AND product_id = ?
      LIMIT 1
    `)
    .get(organizationId, branch.id, product.id) as
    | { stock: number }
    | undefined;

  const previousBranchStock = Number(branchInventory?.stock || 0);
  const previousOrganizationStock = Number(product.stock || 0);

  if (type === "out" && qty > previousBranchStock) {
    return res.status(400).json({
      message: `Not enough stock available at ${branch.name}`,
    });
  }

  const branchDelta = type === "in" ? qty : -qty;
  const organizationDelta = branchDelta;
  const newBranchStock = previousBranchStock + branchDelta;
  const newOrganizationStock = previousOrganizationStock + organizationDelta;

  if (newOrganizationStock < 0) {
    return res.status(400).json({
      message: "Organization stock cannot become negative",
    });
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO branch_inventory (
        organization_id,
        branch_id,
        product_id,
        stock
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(branch_id, product_id)
      DO UPDATE SET
        stock = excluded.stock,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      organizationId,
      branch.id,
      product.id,
      newBranchStock
    );

    db.prepare(`
      UPDATE products
      SET stock = ?
      WHERE id = ?
        AND organization_id = ?
    `).run(
      newOrganizationStock,
      product.id,
      organizationId
    );

    db.prepare(`
      INSERT INTO stock_movements (
        product_id,
        type,
        quantity,
        reason,
        organization_id,
        branch_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      product.id,
      type,
      qty,
      reason?.trim() || "Manual stock adjustment",
      organizationId,
      branch.id
    );
  });

  transaction();

  return res.json({
    message: "Stock updated successfully",
    branch: {
      id: branch.id,
      name: branch.name,
      code: branch.code,
    },
    product: {
      id: product.id,
      name: product.name,
      stock: newBranchStock,
      organization_stock_legacy: newOrganizationStock,
    },
  });
});

// ==========================================================
// WHOLESALE PURCHASE / RESTOCK
// Calculates unit cost and weighted-average inventory cost.
// Admin and Manager only.
// ==========================================================

router.post(
  "/:id/purchase",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const { id } = req.params;
    const {
      quantity,
      total_cost,
      purchase_date,
      supplier_id,
      reference,
      notes,
      branchId,
    } = req.body;

    const qty = Number(quantity);
    const totalCost = Number(total_cost);

    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({
        message: "Purchase quantity must be a positive whole number",
      });
    }

    if (!Number.isFinite(totalCost) || totalCost <= 0) {
      return res.status(400).json({
        message: "Total purchase cost must be greater than 0",
      });
    }

    if (!purchase_date || typeof purchase_date !== "string") {
      return res.status(400).json({
        message: "Purchase date is required",
      });
    }

    let supplierId: number | null = null;

    if (
      supplier_id !== undefined &&
      supplier_id !== null &&
      supplier_id !== ""
    ) {
      supplierId = Number(supplier_id);

      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return res.status(400).json({
          message: "Invalid supplier selected",
        });
      }

      const supplier = db
        .prepare(`
          SELECT id
          FROM suppliers
          WHERE id = ?
            AND organization_id = ?
        `)
        .get(
          supplierId,
          organizationId
        );

      if (!supplier) {
        return res.status(404).json({
          message: "Supplier not found",
        });
      }
    }

    const resolved = resolveInventoryBranch(req, branchId);

    if ("error" in resolved) {
      return res.status(resolved.error.status).json({
        message: resolved.error.message,
      });
    }

    const branch = resolved.branch!;

    const product = db
      .prepare(`
        SELECT
          id,
          name,
          stock,
          cost_price,
          price
        FROM products
        WHERE id = ?
          AND organization_id = ?
      `)
      .get(id, organizationId) as
      | {
          id: number;
          name: string;
          stock: number;
          cost_price: number;
          price: number;
        }
      | undefined;

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const previousStock = Number(product.stock || 0);
    const previousCostPrice = Number(product.cost_price || 0);

    const branchInventory = db
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
        branch.id,
        product.id
      ) as { stock: number } | undefined;

    const previousBranchStock = Number(branchInventory?.stock || 0);
    const newBranchStock = previousBranchStock + qty;

    // Keep inventory money values at 2 decimal places.
    const roundMoney = (value: number) =>
      Math.round((value + Number.EPSILON) * 100) / 100;

    const unitCost = roundMoney(totalCost / qty);

    const previousInventoryValue =
      previousStock * previousCostPrice;

    const newStock = previousStock + qty;

    const newInventoryValue =
      previousInventoryValue + totalCost;

    const newCostPrice = roundMoney(
      newStock > 0 ? newInventoryValue / newStock : unitCost
    );

    const purchasedBy = req.user?.id;

    if (!purchasedBy) {
      return res.status(401).json({
        message: "Authenticated user not found",
      });
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO stock_purchases (
          product_id,
          quantity,
          total_cost,
          unit_cost,
          previous_stock,
          previous_cost_price,
          new_stock,
          new_cost_price,
          supplier_id,
          reference,
          notes,
          purchased_by,
          purchase_date,
          organization_id,
          branch_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.id,
        qty,
        totalCost,
        unitCost,
        previousStock,
        previousCostPrice,
        newStock,
        newCostPrice,
        supplierId,
        typeof reference === "string" && reference.trim()
          ? reference.trim()
          : null,
        typeof notes === "string" && notes.trim()
          ? notes.trim()
          : null,
        purchasedBy,
        purchase_date,
        organizationId,
        branch.id
      );

      db.prepare(`
        UPDATE products
        SET stock = ?, cost_price = ?
        WHERE id = ?
          AND organization_id = ?
      `).run(
        newStock,
        newCostPrice,
        product.id,
        organizationId
      );

      db.prepare(`
        INSERT INTO branch_inventory (
          organization_id,
          branch_id,
          product_id,
          stock
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(branch_id, product_id)
        DO UPDATE SET
          stock = excluded.stock,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        organizationId,
        branch.id,
        product.id,
        newBranchStock
      );

      db.prepare(`
        INSERT INTO stock_movements (
          product_id,
          type,
          quantity,
          reason,
          organization_id,
          branch_id
        )
        VALUES (?, 'in', ?, ?, ?, ?)
      `).run(
        product.id,
        qty,
        `Wholesale purchase/restock${
          typeof reference === "string" && reference.trim()
            ? ` - ${reference.trim()}`
            : ""
        }`,
        organizationId,
        branch.id
      );
    });

    transaction();

    const updatedProduct = db
      .prepare(`
        SELECT *
        FROM products
        WHERE id = ?
          AND organization_id = ?
      `)
      .get(
        product.id,
        organizationId
      );

    res.status(201).json({
      message: "Stock purchase recorded successfully",
      purchase: {
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        total_cost: totalCost,
        unit_cost: unitCost,
        previous_stock: previousStock,
        previous_cost_price: previousCostPrice,
        new_stock: newStock,
        new_cost_price: newCostPrice,
        supplier_id: supplierId,
        purchase_date,
        branch_id: branch.id,
        branch_name: branch.name,
        branch_code: branch.code,
        previous_branch_stock: previousBranchStock,
        new_branch_stock: newBranchStock,
      },
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      product: updatedProduct,
    });
  }
);


// ==========================================================
// WHOLESALE PURCHASE / RESTOCK HISTORY
// Admin and Manager only.
// ==========================================================

router.get(
  "/purchases/history",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const resolved = resolveInventoryBranch(
      req,
      req.query.branchId
    );

    if ("error" in resolved) {
      return res.status(resolved.error.status).json({
        message: resolved.error.message,
      });
    }

    const branch = resolved.branch!;

    const purchases = db
      .prepare(`
        SELECT
          sp.id,
          sp.product_id,
          p.name AS product_name,
          sp.quantity,
          sp.total_cost,
          sp.unit_cost,
          sp.previous_stock,
          sp.previous_cost_price,
          sp.new_stock,
          sp.new_cost_price,
          sp.supplier_id,
          s.name AS supplier_name,
          sp.reference,
          sp.notes,
          sp.purchased_by,
          u.name AS purchased_by_name,
          sp.purchase_date,
          sp.created_at,
          sp.branch_id,
          b.name AS branch_name,
          b.code AS branch_code
        FROM stock_purchases sp
        INNER JOIN products p
          ON p.id = sp.product_id
          AND p.organization_id = sp.organization_id
        LEFT JOIN users u
          ON u.id = sp.purchased_by
          AND u.organization_id = sp.organization_id
        LEFT JOIN suppliers s
          ON s.id = sp.supplier_id
          AND s.organization_id = sp.organization_id
        LEFT JOIN branches b
          ON b.id = sp.branch_id
          AND b.organization_id = sp.organization_id
        WHERE sp.organization_id = ?
          AND sp.branch_id = ?
        ORDER BY sp.purchase_date DESC, sp.id DESC
      `)
      .all(organizationId, branch.id);

    res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      purchases,
    });
  }
);


router.get(
  "/stock/history",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;
    const resolved = resolveInventoryBranch(
      req,
      req.query.branchId
    );

    if ("error" in resolved) {
      return res.status(resolved.error.status).json({
        message: resolved.error.message,
      });
    }

    const branch = resolved.branch!;

    const movements = db
      .prepare(`
        SELECT
          sm.id,
          sm.product_id,
          p.name AS product_name,
          sm.type,
          sm.quantity,
          sm.reason,
          sm.created_at,
          sm.branch_id,
          b.name AS branch_name,
          b.code AS branch_code
        FROM stock_movements sm
        INNER JOIN products p
          ON p.id = sm.product_id
          AND p.organization_id = sm.organization_id
        LEFT JOIN branches b
          ON b.id = sm.branch_id
          AND b.organization_id = sm.organization_id
        WHERE sm.organization_id = ?
          AND sm.branch_id = ?
        ORDER BY sm.id DESC
      `)
      .all(organizationId, branch.id);

    res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
      },
      movements,
    });
  }
);

export default router;