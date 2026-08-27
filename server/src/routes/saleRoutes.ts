import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

type SaleItemInput = {
  productId: number;
  quantity: number;
};

router.get("/", (req, res) => {
  const sales = db
    .prepare(`
      SELECT
        sales.*,
        users.name AS sold_by_name
      FROM sales
      LEFT JOIN users
        ON users.id = sales.sold_by
      ORDER BY sales.id DESC
    `)
    .all();

  res.json(sales);
});

router.post("/", (req: AuthRequest, res) => {
  const {
    items,
    paymentMethod,
    amountPaid,
    mpesaCode,
  } = req.body as {
    items: SaleItemInput[];
    paymentMethod: "Cash" | "M-Pesa";
    amountPaid: number;
    mpesaCode?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "Sale must contain at least one product",
    });
  }

  if (
    paymentMethod !== "Cash" &&
    paymentMethod !== "M-Pesa"
  ) {
    return res.status(400).json({
      message: "Invalid payment method",
    });
  }

  if (
    paymentMethod === "M-Pesa" &&
    !mpesaCode?.trim()
  ) {
    return res.status(400).json({
      message: "M-Pesa transaction code is required",
    });
  }

  try {
    const createSale = db.transaction(() => {
      let total = 0;

      const preparedItems = items.map((item) => {
        const product = db
          .prepare(`
            SELECT id, name, price, stock
            FROM products
            WHERE id = ?
          `)
          .get(item.productId) as
          | {
              id: number;
              name: string;
              price: number;
              stock: number;
            }
          | undefined;

        if (!product) {
          throw new Error("Product not found");
        }

        const quantity = Number(item.quantity);

        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          throw new Error(
            `Invalid quantity for ${product.name}`
          );
        }

        if (quantity > product.stock) {
          throw new Error(
            `Not enough stock for ${product.name}`
          );
        }

        const subtotal =
          product.price * quantity;

        total += subtotal;

        return {
          ...product,
          quantity,
          subtotal,
        };
      });

      const paid = Number(amountPaid);

      if (!Number.isFinite(paid)) {
        throw new Error("Invalid amount paid");
      }

      if (paymentMethod === "Cash" && paid < total) {
        throw new Error(
          "Amount paid cannot be less than total"
        );
      }

      if (paymentMethod === "M-Pesa" && paid < total) {
        throw new Error(
          "M-Pesa amount cannot be less than total"
        );
      }

      const changeAmount =
        paymentMethod === "Cash"
          ? paid - total
          : 0;

      const receiptNumber =
        `INV-${Date.now()}`;

      const saleResult = db
        .prepare(`
          INSERT INTO sales (
            receipt_number,
            total,
            payment_method,
            amount_paid,
            change_amount,
            mpesa_code,
            sold_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          receiptNumber,
          total,
          paymentMethod,
          paid,
          changeAmount,
          paymentMethod === "M-Pesa"
            ? mpesaCode?.trim()
            : null,
          req.user?.id || null
        );

      const saleId =
        Number(saleResult.lastInsertRowid);

      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (
          sale_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          subtotal
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const reduceStock = db.prepare(`
        UPDATE products
        SET stock = stock - ?
        WHERE id = ?
      `);

      const recordStockMovement = db.prepare(`
        INSERT INTO stock_movements (
          product_id,
          type,
          quantity,
          reason
        )
        VALUES (?, 'out', ?, ?)
      `);

      for (const item of preparedItems) {
        insertSaleItem.run(
          saleId,
          item.id,
          item.name,
          item.quantity,
          item.price,
          item.subtotal
        );

        reduceStock.run(
          item.quantity,
          item.id
        );

        recordStockMovement.run(
          item.id,
          item.quantity,
          `Sale ${receiptNumber}`
        );
      }

      return {
        id: saleId,
        receiptNumber,
        total,
        paymentMethod,
        amountPaid: paid,
        changeAmount,
      };
    });

    const sale = createSale();

    res.status(201).json({
      message: "Sale completed successfully",
      sale,
    });

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete sale";

    res.status(400).json({
      message,
    });
  }
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  const sale = db
    .prepare(`
      SELECT
        sales.*,
        users.name AS sold_by_name
      FROM sales
      LEFT JOIN users
        ON users.id = sales.sold_by
      WHERE sales.id = ?
    `)
    .get(id);

  if (!sale) {
    return res.status(404).json({
      message: "Sale not found",
    });
  }

  const items = db
    .prepare(`
      SELECT
        id,
        product_id,
        product_name,
        quantity,
        unit_price,
        subtotal
      FROM sale_items
      WHERE sale_id = ?
      ORDER BY id ASC
    `)
    .all(id);

  res.json({
    sale,
    items,
  });
});

export default router;