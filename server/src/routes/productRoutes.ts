import express from "express";
import db from "../database/db.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();



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
  const { type, quantity, reason } = req.body;

  const product = db
    .prepare(`
      SELECT *
      FROM products
      WHERE id = ?
        AND organization_id = ?
    `)
    .get(id, organizationId) as {
      id: number;
      stock: number;
    } | undefined;

  if (!product) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

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

  let newStock = product.stock;

  if (type === "in") {
    newStock += qty;
  }

  if (type === "out") {
    if (qty > product.stock) {
      return res.status(400).json({
        message: "Not enough stock available",
      });
    }

    newStock -= qty;
  }

  const updateStock = db.prepare(`
    UPDATE products
    SET stock = ?
    WHERE id = ?
      AND organization_id = ?
  `);

  const addMovement = db.prepare(`
    INSERT INTO stock_movements (
      product_id,
      type,
      quantity,
      reason,
      organization_id
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    updateStock.run(
      newStock,
      id,
      organizationId
    );

    addMovement.run(
      id,
      type,
      qty,
      reason?.trim() || null,
      organizationId
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
    .get(id, organizationId);

  res.json(updatedProduct);
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
          organization_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        organizationId
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
        INSERT INTO stock_movements (
          product_id,
          type,
          quantity,
          reason,
          organization_id
        )
        VALUES (?, 'in', ?, ?, ?)
      `).run(
        product.id,
        qty,
        `Wholesale purchase/restock${
          typeof reference === "string" && reference.trim()
            ? ` - ${reference.trim()}`
            : ""
        }`,
        organizationId
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
          sp.created_at
        FROM stock_purchases sp
        INNER JOIN products p
          ON p.id = sp.product_id
        LEFT JOIN users u
          ON u.id = sp.purchased_by
        LEFT JOIN suppliers s
          ON s.id = sp.supplier_id
        WHERE sp.organization_id = ?
        ORDER BY sp.purchase_date DESC, sp.id DESC
      `)
      .all(organizationId);

    res.json(purchases);
  }
);


router.get("/stock/history", authorizeRoles("admin", "manager"), (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  const movements = db
    .prepare(`
      SELECT
        stock_movements.id,
        stock_movements.product_id,
        products.name AS product_name,
        stock_movements.type,
        stock_movements.quantity,
        stock_movements.reason,
        stock_movements.created_at
      FROM stock_movements
      INNER JOIN products
        ON products.id = stock_movements.product_id
      WHERE stock_movements.organization_id = ?
      ORDER BY stock_movements.id DESC
    `)
    .all(organizationId);

  res.json(movements);
});

export default router;