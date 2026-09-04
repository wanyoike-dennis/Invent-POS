import express from "express";
import db from "../database/db.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

type SaleItemInput = {
  productId: number;
  quantity: number;
};

type PaymentMethod = "Cash" | "M-Pesa" | "Split";

const preparePayment = ({
  paymentMethod,
  total,
  amountPaid,
  cashAmount,
  mpesaAmount,
  mpesaCode,
}: {
  paymentMethod: PaymentMethod;
  total: number;
  amountPaid?: number;
  cashAmount?: number;
  mpesaAmount?: number;
  mpesaCode?: string;
}) => {
  const roundMoney = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  let cash = 0;
  let mpesa = 0;
  let paid = 0;
  let changeAmount = 0;

  if (paymentMethod === "Cash") {
    paid = Number(amountPaid);

    if (!Number.isFinite(paid) || paid < total) {
      throw new Error("Amount paid cannot be less than total");
    }

    changeAmount = roundMoney(paid - total);
    cash = roundMoney(total);
  } else if (paymentMethod === "M-Pesa") {
    paid = Number(amountPaid);

    if (!Number.isFinite(paid) || paid < total) {
      throw new Error("M-Pesa amount cannot be less than total");
    }

    if (!mpesaCode?.trim()) {
      throw new Error("M-Pesa transaction code is required");
    }

    mpesa = roundMoney(total);
  } else {
    cash = Number(cashAmount);
    mpesa = Number(mpesaAmount);

    if (
      !Number.isFinite(cash) ||
      !Number.isFinite(mpesa) ||
      cash < 0 ||
      mpesa <= 0
    ) {
      throw new Error("Enter valid Cash and M-Pesa amounts");
    }

    if (!mpesaCode?.trim()) {
      throw new Error("M-Pesa transaction code is required");
    }

    paid = roundMoney(cash + mpesa);

    if (paid < total) {
      throw new Error(
        "Cash amount plus M-Pesa amount cannot be less than total"
      );
    }

    // M-Pesa is treated as an exact electronic payment.
    // Any overpayment/change must therefore come from Cash.
    const requiredCash = roundMoney(
      Math.max(total - mpesa, 0)
    );

    if (cash < requiredCash) {
      throw new Error(
        "Any change on a split payment must come from the Cash portion"
      );
    }

    changeAmount = roundMoney(paid - total);

    // Store the actual amount retained as sale proceeds after cash change.
    cash = roundMoney(cash - changeAmount);
    mpesa = roundMoney(mpesa);
  }

  return {
    paid: roundMoney(paid),
    changeAmount,
    cashAmount: cash,
    mpesaAmount: mpesa,
    mpesaCode:
      paymentMethod === "M-Pesa" ||
      paymentMethod === "Split"
        ? mpesaCode?.trim() || null
        : null,
  };
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);

  return parsed;
};

// ============================================================
// GET ALL SALES
// Refund-aware sales history
// ============================================================

router.get("/", (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

  try {
    const sales = db
      .prepare(`
        SELECT
          sales.*,
          users.name AS sold_by_name,
          customers.name AS customer_name,
          customers.phone AS customer_phone,

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

        LEFT JOIN customers
          ON customers.id = sales.customer_id

        WHERE sales.organization_id = ?
        ${
          req.user?.role === "cashier"
            ? "AND sales.sold_by = ?"
            : ""
        }

        ORDER BY sales.id DESC
      `)
      .all(
        organizationId,
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
  const organizationId = req.user!.organizationId;

  const {
    items,
    paymentMethod,
    amountPaid,
    cashAmount,
    mpesaAmount,
    mpesaCode,
    customerId,
  } = req.body as {
    items: SaleItemInput[];
    paymentMethod: PaymentMethod;
    amountPaid?: number;
    cashAmount?: number;
    mpesaAmount?: number;
    mpesaCode?: string;
    customerId?: number | null;
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
    paymentMethod !== "M-Pesa" &&
    paymentMethod !== "Split"
  ) {
    return res.status(400).json({
      message: "Invalid payment method",
    });
  }

  try {
    const createSale = db.transaction(() => {
      let total = 0;

      // Customer is optional. NULL means Walk-in Customer.
      let selectedCustomerId: number | null = null;
      let selectedCustomer:
        | { id: number; name: string; phone: string | null }
        | undefined;

      if (
        customerId !== undefined &&
        customerId !== null &&
        customerId !== 0
      ) {
        const parsedCustomerId = Number(customerId);

        if (
          !Number.isInteger(parsedCustomerId) ||
          parsedCustomerId <= 0
        ) {
          throw new Error("Invalid customer");
        }

        selectedCustomer = db
          .prepare(`
            SELECT id, name, phone
            FROM customers
            WHERE id = ?
              AND organization_id = ?
          `)
          .get(
            parsedCustomerId,
            organizationId
          ) as
          | { id: number; name: string; phone: string | null }
          | undefined;

        if (!selectedCustomer) {
          throw new Error("Customer not found");
        }

        selectedCustomerId = selectedCustomer.id;
      }

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
              AND organization_id = ?
          `)
          .get(
            item.productId,
            organizationId
          ) as
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

      // Validate and prepare payment allocation
      const payment = preparePayment({
        paymentMethod,
        total,
        amountPaid,
        cashAmount,
        mpesaAmount,
        mpesaCode,
      });

      const {
        paid,
        changeAmount,
        cashAmount: allocatedCash,
        mpesaAmount: allocatedMpesa,
        mpesaCode: storedMpesaCode,
      } = payment;

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
            sold_by,
            sale_date,
            is_backdated,
            cash_amount,
            mpesa_amount,
            customer_id,
            organization_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          receiptNumber,
          total,
          paymentMethod,
          paid,
          changeAmount,
          storedMpesaCode,
          req.user?.id || null,
          formatLocalDate(new Date()),
          0,
          allocatedCash,
          allocatedMpesa,
          selectedCustomerId,
          organizationId
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
          AND organization_id = ?
      `);

      // Record stock movement
      const recordStockMovement = db.prepare(`
        INSERT INTO stock_movements (
          product_id,
          type,
          quantity,
          reason,
          organization_id
        )
        VALUES (?, 'out', ?, ?, ?)
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
          item.id,
          organizationId
        );

        recordStockMovement.run(
          item.id,
          item.quantity,
          `Sale ${receiptNumber}`,
          organizationId
        );
      }

      return {
        id: saleId,
        receiptNumber,
        total,
        paymentMethod,
        amountPaid: paid,
        changeAmount,
        cashAmount: allocatedCash,
        mpesaAmount: allocatedMpesa,
        mpesaCode: storedMpesaCode,
        customerId: selectedCustomerId,
        customer: selectedCustomer
          ? {
              id: selectedCustomer.id,
              name: selectedCustomer.name,
              phone: selectedCustomer.phone,
            }
          : null,
        saleDate: formatLocalDate(new Date()),
        isBackdated: false,
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
// CREATE PAST SALE
// Admin only. Sale must be 1 to 7 calendar days before today.
// created_at remains the real record-entry timestamp.
// ============================================================

router.post(
  "/past",
  authorizeRoles("admin"),
  (req: AuthRequest, res) => {
    const organizationId = req.user!.organizationId;

    const {
      items,
      paymentMethod,
      amountPaid,
      cashAmount,
      mpesaAmount,
      mpesaCode,
      saleDate,
      customerId,
    } = req.body as {
      items: SaleItemInput[];
      paymentMethod: PaymentMethod;
      amountPaid?: number;
      cashAmount?: number;
      mpesaAmount?: number;
      mpesaCode?: string;
      saleDate: string;
      customerId?: number | null;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Past sale must contain at least one product",
      });
    }

    if (
      paymentMethod !== "Cash" &&
      paymentMethod !== "M-Pesa" &&
      paymentMethod !== "Split"
    ) {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }

    if (!saleDate) {
      return res.status(400).json({
        message: "Past sale date is required",
      });
    }

    const parsedSaleDate = parseLocalDate(saleDate);

    if (!parsedSaleDate) {
      return res.status(400).json({
        message: "Invalid past sale date",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const differenceInDays = Math.round(
      (today.getTime() - parsedSaleDate.getTime()) /
        86_400_000
    );

    if (differenceInDays <= 0) {
      return res.status(400).json({
        message:
          "Past sales must use a date before today. Use normal checkout for today's sales.",
      });
    }

    if (differenceInDays > 7) {
      return res.status(400).json({
        message:
          "Past sales can only be recorded for the previous 7 calendar days.",
      });
    }

    const backdatedSaleDate =
      formatLocalDate(parsedSaleDate);

    try {
      const createPastSale = db.transaction(() => {
        let total = 0;

        // Customer is optional. NULL means Walk-in Customer.
        let selectedCustomerId: number | null = null;
        let selectedCustomer:
          | { id: number; name: string; phone: string | null }
          | undefined;

        if (
          customerId !== undefined &&
          customerId !== null &&
          customerId !== 0
        ) {
          const parsedCustomerId = Number(customerId);

          if (
            !Number.isInteger(parsedCustomerId) ||
            parsedCustomerId <= 0
          ) {
            throw new Error("Invalid customer");
          }

          selectedCustomer = db
            .prepare(`
              SELECT id, name, phone
              FROM customers
              WHERE id = ?
                AND organization_id = ?
            `)
            .get(
              parsedCustomerId,
              organizationId
            ) as
            | { id: number; name: string; phone: string | null }
            | undefined;

          if (!selectedCustomer) {
            throw new Error("Customer not found");
          }

          selectedCustomerId = selectedCustomer.id;
        }

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
                AND organization_id = ?
            `)
            .get(
              item.productId,
              organizationId
            ) as
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

        const payment = preparePayment({
          paymentMethod,
          total,
          amountPaid,
          cashAmount,
          mpesaAmount,
          mpesaCode,
        });

        const {
          paid,
          changeAmount,
          cashAmount: allocatedCash,
          mpesaAmount: allocatedMpesa,
          mpesaCode: storedMpesaCode,
        } = payment;

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
              sold_by,
              sale_date,
              is_backdated,
              cash_amount,
              mpesa_amount,
              customer_id,
              organization_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            receiptNumber,
            total,
            paymentMethod,
            paid,
            changeAmount,
            storedMpesaCode,
            req.user?.id || null,
            backdatedSaleDate,
            1,
            allocatedCash,
            allocatedMpesa,
            selectedCustomerId,
            organizationId
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
            cost_price,
            subtotal
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const reduceStock = db.prepare(`
          UPDATE products
          SET stock = stock - ?
          WHERE id = ?
            AND organization_id = ?
        `);

        const recordStockMovement = db.prepare(`
          INSERT INTO stock_movements (
            product_id,
            type,
            quantity,
            reason,
            organization_id
          )
          VALUES (?, 'out', ?, ?, ?)
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
            item.id,
            organizationId
          );

          recordStockMovement.run(
            item.id,
            item.quantity,
            `Backdated sale ${receiptNumber} (${backdatedSaleDate})`,
            organizationId
          );
        }

        return {
          id: saleId,
          receiptNumber,
          total,
          paymentMethod,
          amountPaid: paid,
          changeAmount,
          cashAmount: allocatedCash,
          mpesaAmount: allocatedMpesa,
          mpesaCode: storedMpesaCode,
          customerId: selectedCustomerId,
          customer: selectedCustomer
            ? {
                id: selectedCustomer.id,
                name: selectedCustomer.name,
                phone: selectedCustomer.phone,
              }
            : null,
          saleDate: backdatedSaleDate,
          isBackdated: true,
        };
      });

      const sale = createPastSale();

      return res.status(201).json({
        message: "Past sale recorded successfully",
        sale,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to record past sale";

      return res.status(400).json({
        message,
      });
    }
  }
);


// ============================================================
// GET RETURNS HISTORY
// ============================================================

router.get("/returns/history", authorizeRoles("admin", "manager"), (req: AuthRequest, res) => {
  const organizationId = req.user!.organizationId;

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

        WHERE s.organization_id = ?

        ORDER BY sr.id DESC
      `)
      .all(organizationId)
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
  const organizationId = req.user!.organizationId;

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
          users.name AS sold_by_name,
          customers.name AS customer_name,
          customers.phone AS customer_phone,
          customers.email AS customer_email,
          customers.address AS customer_address
        FROM sales
        LEFT JOIN users
          ON users.id = sales.sold_by
        LEFT JOIN customers
          ON customers.id = sales.customer_id
        WHERE sales.id = ?
          AND sales.organization_id = ?
          ${
            req.user?.role === "cashier"
              ? "AND sales.sold_by = ?"
              : ""
          }
      `)
      .get(
        saleId,
        organizationId,
        ...(req.user?.role === "cashier"
          ? [req.user.id]
          : [])
      );

    if (!sale) {
      return res.status(404).json({
        message: "Sale not found",
      });
    }

    const organization = db
      .prepare(`
        SELECT
          id,
          name,
          slug,
          phone,
          email,
          address,
          receipt_footer,
          currency
        FROM organizations
        WHERE id = ?
      `)
      .get(organizationId);

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
      organization,
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
    const organizationId = req.user!.organizationId;

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
            AND organization_id = ?
        `)
        .get(
          saleId,
          organizationId
        ) as
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
                AND organization_id = ?
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
                reason,
                organization_id
              )

              VALUES (?, 'in', ?, ?, ?)
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
              item.productId,
              organizationId
            );


            // Record inventory movement
            recordStockMovement.run(
              item.productId,
              item.quantity,

              `Return ${sale.receipt_number}: ` +
                `${reason.trim()}`,
              organizationId
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
