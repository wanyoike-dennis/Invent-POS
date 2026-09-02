import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

type SaleItemInput = {
  productId: number;
  quantity: number;
};

// ============================================================
// GET ALL SALES
// Refund-aware sales history
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  try {
    const sales = db
      .prepare(`
        SELECT
          sales.*,
          users.name AS sold_by_name,

          COALESCE(
            (
              SELECT SUM(sr.refund_amount)
              FROM sales_returns sr
              WHERE sr.sale_id = sales.id
            ),
            0
          ) AS refunded_amount

        FROM sales

        LEFT JOIN users
          ON users.id = sales.sold_by

        ${
          req.user?.role === "cashier"
            ? "WHERE sales.sold_by = ?"
            : ""
        }

        ORDER BY sales.id DESC
      `)
      .all(
        ...(req.user?.role === "cashier"
          ? [req.user.id]
          : [])
      )
      .map((sale: any) => {
        const originalTotal = Number(sale.total);

        const refundedAmount = Number(
          sale.refunded_amount || 0
        );

        const netTotal = Math.max(
          originalTotal - refundedAmount,
          0
        );

        let refundStatus:
          | "Not Refunded"
          | "Partially Refunded"
          | "Fully Refunded" = "Not Refunded";

        // Some money has been refunded,
        // but part of the sale remains
        if (
          refundedAmount > 0 &&
          netTotal > 0
        ) {
          refundStatus = "Partially Refunded";
        }

        // Entire sale value has been refunded
        if (
          refundedAmount > 0 &&
          netTotal === 0
        ) {
          refundStatus = "Fully Refunded";
        }

        return {
          ...sale,

          // Original sale value
          total: originalTotal,

          // Amount returned to customer
          refunded_amount: refundedAmount,

          // Actual sale value after refunds
          net_total: netTotal,

          // Refund state
          refund_status: refundStatus,
        };
      });

    return res.json(sales);

  } catch (error) {
    console.error(
      "Get sales history error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch sales history",
    });
  }
});


// ============================================================
// CREATE SALE
// ============================================================

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

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "Sale must contain at least one product",
    });
  }

  // Validate payment method
  if (
    paymentMethod !== "Cash" &&
    paymentMethod !== "M-Pesa"
  ) {
    return res.status(400).json({
      message: "Invalid payment method",
    });
  }

  // Require M-Pesa transaction code
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

      // Prepare and validate sale items
      const preparedItems = items.map((item) => {
        const product = db
          .prepare(`
            SELECT
              id,
              name,
              price,
              cost_price,
              stock
            FROM products
            WHERE id = ?
          `)
          .get(item.productId) as
          | {
              id: number;
              name: string;
              price: number;
              cost_price: number;
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

      // Validate amount paid
      const paid = Number(amountPaid);

      if (!Number.isFinite(paid)) {
        throw new Error("Invalid amount paid");
      }

      if (
        paymentMethod === "Cash" &&
        paid < total
      ) {
        throw new Error(
          "Amount paid cannot be less than total"
        );
      }

      if (
        paymentMethod === "M-Pesa" &&
        paid < total
      ) {
        throw new Error(
          "M-Pesa amount cannot be less than total"
        );
      }

      // Calculate change
      const changeAmount =
        paymentMethod === "Cash"
          ? paid - total
          : 0;

      // Generate receipt number
      const receiptNumber =
        `INV-${Date.now()}`;

      // Create sale
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

      // Insert sale items
      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (
          sale_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          cost_price,
          subtotal
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Reduce stock
      const reduceStock = db.prepare(`
        UPDATE products
        SET stock = stock - ?
        WHERE id = ?
      `);

      // Record stock movement
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
          Number(item.cost_price || 0),
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

// ============================================================
// GET RETURNS HISTORY
// ============================================================

router.get("/returns/history", authorizeRoles("admin", "manager"), (req, res) => {
  try {
    const returns = db
      .prepare(`
        SELECT
          sr.id,
          sr.sale_id,
          sr.refund_amount,
          sr.reason,
          sr.returned_by,
          sr.created_at,

          s.receipt_number,
          s.payment_method,

          users.name AS returned_by_name

        FROM sales_returns sr

        INNER JOIN sales s
          ON s.id = sr.sale_id

        LEFT JOIN users
          ON users.id = sr.returned_by

        ORDER BY sr.id DESC
      `)
      .all()
      .map((item: any) => ({
        ...item,
        refund_amount: Number(item.refund_amount),
      }));

    return res.json(returns);
  } catch (error) {
    console.error(
      "Get returns history error:",
      error
    );

    return res.status(500).json({
      message: "Failed to fetch returns history",
    });
  }
});


// ============================================================
// GET SINGLE SALE
// Receipt + returned quantities + return history + refund summary
// ============================================================

router.get("/:id", (req: AuthRequest, res) => {
  try {
    const saleId = Number(req.params.id);

    if (!saleId || Number.isNaN(saleId)) {
      return res.status(400).json({
        message: "Invalid sale ID",
      });
    }

    const sale = db
      .prepare(`
        SELECT
          sales.*,
          users.name AS sold_by_name
        FROM sales
        LEFT JOIN users
          ON users.id = sales.sold_by
        WHERE sales.id = ?
          ${
            req.user?.role === "cashier"
              ? "AND sales.sold_by = ?"
              : ""
          }
      `)
      .get(
        saleId,
        ...(req.user?.role === "cashier"
          ? [req.user.id]
          : [])
      );

    if (!sale) {
      return res.status(404).json({
        message: "Sale not found",
      });
    }

    const items = db
      .prepare(`
        SELECT
          si.id,
          si.product_id,
          si.product_name,
          si.quantity,
          si.unit_price,
          si.subtotal,
          COALESCE(
            (
              SELECT SUM(sri.quantity)
              FROM sales_return_items sri
              INNER JOIN sales_returns sr
                ON sr.id = sri.return_id
              WHERE sri.sale_item_id = si.id
                AND sr.sale_id = si.sale_id
            ),
            0
          ) AS returned_quantity
        FROM sale_items si
        WHERE si.sale_id = ?
        ORDER BY si.id ASC
      `)
      .all(saleId)
      .map((item: any) => {
        const quantity = Number(item.quantity);
        const returnedQuantity = Number(item.returned_quantity || 0);

        return {
          ...item,
          quantity,
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          returned_quantity: returnedQuantity,
          returnable_quantity: Math.max(
            quantity - returnedQuantity,
            0
          ),
        };
      });

    const returnRecords = db
      .prepare(`
        SELECT
          sr.id,
          sr.sale_id,
          sr.refund_amount,
          sr.reason,
          sr.returned_by,
          sr.created_at,
          users.name AS returned_by_name
        FROM sales_returns sr
        LEFT JOIN users
          ON users.id = sr.returned_by
        WHERE sr.sale_id = ?
        ORDER BY sr.id DESC
      `)
      .all(saleId) as {
        id: number;
        sale_id: number;
        refund_amount: number;
        reason: string;
        returned_by: number;
        returned_by_name: string | null;
        created_at: string;
      }[];

    const returnItemQuery = db.prepare(`
      SELECT
        sri.id,
        sri.return_id,
        sri.sale_item_id,
        sri.product_id,
        sri.quantity,
        sri.unit_price,
        sri.subtotal,
        si.product_name
      FROM sales_return_items sri
      LEFT JOIN sale_items si
        ON si.id = sri.sale_item_id
      WHERE sri.return_id = ?
      ORDER BY sri.id ASC
    `);

    const returns = returnRecords.map((returnRecord) => ({
      ...returnRecord,
      refund_amount: Number(returnRecord.refund_amount),
      items: returnItemQuery
        .all(returnRecord.id)
        .map((item: any) => ({
          ...item,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
        })),
    }));

    const totalRefunded = returns.reduce(
      (sum, returnRecord) =>
        sum + Number(returnRecord.refund_amount),
      0
    );

    const originalTotal = Number((sale as any).total);
    const netTotal = Math.max(originalTotal - totalRefunded, 0);

    return res.json({
      sale,
      items,
      returns,
      summary: {
        original_total: originalTotal,
        total_refunded: totalRefunded,
        net_total: netTotal,
      },
    });
  } catch (error) {
    console.error("Get sale details error:", error);

    return res.status(500).json({
      message: "Failed to fetch sale details",
    });
  }
});


// ============================================================
// RETURN / REFUND SALE ITEMS
// ============================================================

router.post(
  "/:id/return",
  authorizeRoles("admin", "manager"),
  (req: AuthRequest, res) => {
    try {
      const saleId = Number(req.params.id);

      const { items, reason } = req.body as {
        items: {
          saleItemId: number;
          quantity: number;
        }[];

        reason: string;
      };


      // --------------------------------------------------------
      // 1. Validate sale ID
      // --------------------------------------------------------

      if (
        !saleId ||
        Number.isNaN(saleId)
      ) {
        return res.status(400).json({
          message: "Invalid sale ID",
        });
      }


      // --------------------------------------------------------
      // 2. Make sure user is logged in
      // --------------------------------------------------------

      const returnedBy = req.user?.id;

      if (!returnedBy) {
        return res.status(401).json({
          message:
            "You must be logged in to process a return",
        });
      }


      // --------------------------------------------------------
      // 3. Validate return reason
      // --------------------------------------------------------

      if (
        !reason ||
        !reason.trim()
      ) {
        return res.status(400).json({
          message: "Return reason is required",
        });
      }


      // --------------------------------------------------------
      // 4. Validate return items
      // --------------------------------------------------------

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({
          message:
            "At least one item must be returned",
        });
      }


      // --------------------------------------------------------
      // 5. Check original sale exists
      // --------------------------------------------------------

      const sale = db
        .prepare(`
          SELECT
            id,
            receipt_number,
            total
          FROM sales
          WHERE id = ?
        `)
        .get(saleId) as
        | {
            id: number;
            receipt_number: string;
            total: number;
          }
        | undefined;

      if (!sale) {
        return res.status(404).json({
          message: "Sale not found",
        });
      }


      // --------------------------------------------------------
      // 6. Combine duplicate item IDs
      // --------------------------------------------------------

      /*
        Example request:

        [
          {
            saleItemId: 5,
            quantity: 1
          },
          {
            saleItemId: 5,
            quantity: 2
          }
        ]

        Becomes:

        Sale Item 5 => quantity 3

        This prevents return quantity validation
        from being bypassed using duplicate rows.
      */

      const combinedItems =
        new Map<number, number>();


      for (const item of items) {
        const saleItemId =
          Number(item.saleItemId);

        const quantity =
          Number(item.quantity);

        if (
          !saleItemId ||
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          return res.status(400).json({
            message:
              "Invalid return item or quantity",
          });
        }

        combinedItems.set(
          saleItemId,
          (
            combinedItems.get(saleItemId) ||
            0
          ) + quantity
        );
      }


      // --------------------------------------------------------
      // 7. Prepare returned items
      // --------------------------------------------------------

      const preparedItems: {
        saleItemId: number;
        productId: number;
        productName: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }[] = [];


      let refundAmount = 0;


      // --------------------------------------------------------
      // 8. Validate each return item
      // --------------------------------------------------------

      for (
        const [
          saleItemId,
          returnQuantity,
        ] of combinedItems
      ) {

        // Find item on original sale
        const saleItem = db
          .prepare(`
            SELECT
              id,
              sale_id,
              product_id,
              product_name,
              quantity,
              unit_price

            FROM sale_items

            WHERE id = ?
              AND sale_id = ?
          `)
          .get(
            saleItemId,
            saleId
          ) as
          | {
              id: number;
              sale_id: number;
              product_id: number;
              product_name: string;
              quantity: number;
              unit_price: number;
            }
          | undefined;


        if (!saleItem) {
          return res.status(404).json({
            message:
              `Sale item ${saleItemId} ` +
              `was not found on this sale`,
          });
        }


        // ------------------------------------------------------
        // Find quantity already returned
        // ------------------------------------------------------

        const previousReturn = db
          .prepare(`
            SELECT
              COALESCE(
                SUM(sri.quantity),
                0
              ) AS returned_quantity

            FROM sales_return_items sri

            INNER JOIN sales_returns sr
              ON sr.id = sri.return_id

            WHERE sri.sale_item_id = ?
              AND sr.sale_id = ?
          `)
          .get(
            saleItemId,
            saleId
          ) as {
            returned_quantity: number;
          };


        const alreadyReturned =
          Number(
            previousReturn
              ?.returned_quantity ?? 0
          );


        const availableToReturn =
          Number(saleItem.quantity) -
          alreadyReturned;


        // ------------------------------------------------------
        // Prevent over-returning
        // ------------------------------------------------------

        if (
          returnQuantity >
          availableToReturn
        ) {
          return res.status(400).json({
            message:
              `Cannot return ` +
              `${returnQuantity} unit(s) of ` +
              `${saleItem.product_name}. ` +
              `Only ${availableToReturn} ` +
              `unit(s) can still be returned.`,
          });
        }


        // ------------------------------------------------------
        // Calculate item refund
        // ------------------------------------------------------

        const subtotal =
          Number(saleItem.unit_price) *
          returnQuantity;


        refundAmount += subtotal;


        preparedItems.push({
          saleItemId:
            saleItem.id,

          productId:
            saleItem.product_id,

          productName:
            saleItem.product_name,

          quantity:
            returnQuantity,

          unitPrice:
            Number(
              saleItem.unit_price
            ),

          subtotal,
        });
      }


      // --------------------------------------------------------
      // 9. Process return as SQLite transaction
      // --------------------------------------------------------

      const processReturn =
        db.transaction(() => {

          // ----------------------------------------------------
          // Create return record
          // ----------------------------------------------------

          const returnResult = db
            .prepare(`
              INSERT INTO sales_returns (
                sale_id,
                refund_amount,
                reason,
                returned_by
              )

              VALUES (?, ?, ?, ?)
            `)
            .run(
              saleId,
              refundAmount,
              reason.trim(),
              returnedBy
            );


          const returnId =
            Number(
              returnResult.lastInsertRowid
            );


          // ----------------------------------------------------
          // Prepare returned item insert
          // ----------------------------------------------------

          const insertReturnItem =
            db.prepare(`
              INSERT INTO sales_return_items (
                return_id,
                sale_item_id,
                product_id,
                quantity,
                unit_price,
                subtotal
              )

              VALUES (?, ?, ?, ?, ?, ?)
            `);


          // ----------------------------------------------------
          // Prepare stock restoration
          // ----------------------------------------------------

          const restoreStock =
            db.prepare(`
              UPDATE products

              SET stock = stock + ?

              WHERE id = ?
            `);


          // ----------------------------------------------------
          // Prepare stock movement
          // ----------------------------------------------------

          const recordStockMovement =
            db.prepare(`
              INSERT INTO stock_movements (
                product_id,
                type,
                quantity,
                reason
              )

              VALUES (?, 'in', ?, ?)
            `);


          // ----------------------------------------------------
          // Process each returned item
          // ----------------------------------------------------

          for (
            const item of preparedItems
          ) {

            // Save return item
            insertReturnItem.run(
              returnId,
              item.saleItemId,
              item.productId,
              item.quantity,
              item.unitPrice,
              item.subtotal
            );


            // Restore product stock
            restoreStock.run(
              item.quantity,
              item.productId
            );


            // Record inventory movement
            recordStockMovement.run(
              item.productId,
              item.quantity,

              `Return ${sale.receipt_number}: ` +
                `${reason.trim()}`
            );
          }


          // Return transaction result
          return {
            id: returnId,

            saleId,

            receiptNumber:
              sale.receipt_number,

            refundAmount,

            reason:
              reason.trim(),

            items:
              preparedItems,
          };
        });


      // --------------------------------------------------------
      // 10. Execute return transaction
      // --------------------------------------------------------

      const saleReturn =
        processReturn();


      // --------------------------------------------------------
      // 11. Send successful response
      // --------------------------------------------------------

      return res.status(201).json({
        message:
          "Return processed successfully",

        return:
          saleReturn,
      });

    } catch (error) {
      console.error(
        "Return sale error:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Failed to process return";

      return res.status(400).json({
        message,
      });
    }
  }
);


export default router;
