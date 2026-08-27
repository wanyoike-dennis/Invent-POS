import { useEffect, useMemo, useState } from "react";
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Printer,
} from "lucide-react";
import { apiFetch } from "../services/api";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
};

type CartItem = Product & {
  quantity: number;
};

type Sale = {
  id: number;
  receipt_number: string;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  mpesa_code: string | null;
  sold_by_name: string | null;
  created_at: string;
};

type SaleItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] =
    useState<"sale" | "history">("sale");

  const [showPayment, setShowPayment] = useState(false);

  const [paymentMethod, setPaymentMethod] =
    useState<"Cash" | "M-Pesa">("Cash");

  const [amountPaid, setAmountPaid] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [processingSale, setProcessingSale] = useState(false);

  const [salesHistory, setSalesHistory] = useState<Sale[]>([]);

  const [selectedSale, setSelectedSale] = useState<{
    sale: Sale;
    items: SaleItem[];
  } | null>(null);

  const [loadingReceipt, setLoadingReceipt] = useState(false);

  // --------------------------------------------------
  // PRODUCTS
  // --------------------------------------------------

  const fetchProducts = async () => {
    try {
      setLoading(true);

      const response = await apiFetch("/api/products");

      if (!response.ok) {
        throw new Error("Failed to load products");
      }

      const data = await response.json();

      setProducts(data);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // SALES HISTORY
  // --------------------------------------------------

  const fetchSalesHistory = async () => {
    try {
      const response = await apiFetch("/api/sales");

      if (!response.ok) {
        throw new Error("Failed to load sales history");
      }

      const data = await response.json();

      setSalesHistory(data);
    } catch (error) {
      console.error("Error loading sales history:", error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchSalesHistory();
  }, []);

  const viewSaleDetails = async (id: number) => {
    try {
      setLoadingReceipt(true);

      const response = await apiFetch(
        `/api/sales/${id}`
      );

      if (!response.ok) {
        throw new Error("Failed to load receipt");
      }

      const data = await response.json();

      setSelectedSale(data);
    } catch (error) {
      console.error("Error loading receipt:", error);
    } finally {
      setLoadingReceipt(false);
    }
  };

  // --------------------------------------------------
  // PRINT RECEIPT
  // --------------------------------------------------

  const handlePrintReceipt = () => {
    window.print();
  };

  // --------------------------------------------------
  // PRODUCT SEARCH
  // --------------------------------------------------

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const search = searchTerm.toLowerCase();

      return (
        product.name.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search)
      );
    });
  }, [products, searchTerm]);

  // --------------------------------------------------
  // CART
  // --------------------------------------------------

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      return;
    }

    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.id === product.id
      );

      if (existingItem) {
        if (existingItem.quantity >= product.stock) {
          return currentCart;
        }

        return currentCart.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...currentCart,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  };

  const increaseQuantity = (id: number) => {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (item.quantity >= item.stock) {
          return item;
        }

        return {
          ...item,
          quantity: item.quantity + 1,
        };
      })
    );
  };

  const decreaseQuantity = (id: number) => {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (id: number) => {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== id)
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  // --------------------------------------------------
  // TOTALS
  // --------------------------------------------------

  const total = cart.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  const itemCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const change =
    paymentMethod === "Cash"
      ? Math.max(
          Number(amountPaid || 0) - total,
          0
        )
      : 0;

  // --------------------------------------------------
  // COMPLETE SALE
  // --------------------------------------------------

  const handleCompleteSale = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setPaymentError("");

    if (cart.length === 0) {
      setPaymentError("Cart is empty.");
      return;
    }

    const paid = Number(amountPaid);

    if (
      !Number.isFinite(paid) ||
      paid < total
    ) {
      setPaymentError(
        "Amount paid cannot be less than the total."
      );
      return;
    }

    if (
      paymentMethod === "M-Pesa" &&
      !mpesaCode.trim()
    ) {
      setPaymentError(
        "M-Pesa transaction code is required."
      );
      return;
    }

    try {
      setProcessingSale(true);

      const response = await apiFetch(
        "/api/sales",
        {
          method: "POST",
          body: JSON.stringify({
            items: cart.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
            paymentMethod,
            amountPaid: paid,
            mpesaCode:
              paymentMethod === "M-Pesa"
                ? mpesaCode.trim()
                : undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setPaymentError(
          data.message ||
            "Failed to complete sale"
        );
        return;
      }

      alert(
        `Sale completed successfully.\nReceipt: ${data.sale.receiptNumber}`
      );

      setCart([]);
      setShowPayment(false);
      setAmountPaid("");
      setMpesaCode("");
      setPaymentMethod("Cash");

      await fetchProducts();
      await fetchSalesHistory();
    } catch (error) {
      console.error(
        "Error completing sale:",
        error
      );

      setPaymentError(
        "Could not complete the sale."
      );
    } finally {
      setProcessingSale(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* ========================================= */}
      {/* RECEIPT DETAILS MODAL */}
      {/* ========================================= */}

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 print:static print:bg-white print:p-0">

          <div
            id="print-receipt"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none"
          >

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 p-5 print:hidden">

              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  Receipt Details
                </h2>

                <p className="text-sm text-slate-500">
                  {selectedSale.sale.receipt_number}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>

            </div>

            {/* Printable Receipt */}
            <div className="space-y-5 p-6">

              {/* Business Header */}
              <div className="border-b border-slate-200 pb-5 text-center">

                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-bold text-white print:border print:border-black print:bg-white print:text-black">
                  IP
                </div>

                <h1 className="text-xl font-bold text-slate-900">
                  Invent POS
                </h1>

                <p className="text-sm text-slate-500">
                  Business Management System
                </p>

                <p className="mt-2 text-xs text-slate-400">
                  Sales Receipt
                </p>

              </div>

              {/* Receipt Information */}
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">

                <div>
                  <p className="text-xs text-slate-500">
                    Receipt No.
                  </p>

                  <p className="mt-1 font-medium text-slate-800">
                    {selectedSale.sale.receipt_number}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Date
                  </p>

                  <p className="mt-1 text-slate-800">
                    {new Date(
                      selectedSale.sale.created_at
                    ).toLocaleString()}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Cashier
                  </p>

                  <p className="mt-1 font-medium text-slate-800">
                    {selectedSale.sale.sold_by_name ||
                      "Unknown"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Payment
                  </p>

                  <p className="mt-1 font-medium text-slate-800">
                    {selectedSale.sale.payment_method}
                  </p>
                </div>

                {selectedSale.sale.mpesa_code && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">
                      M-Pesa Code
                    </p>

                    <p className="mt-1 font-medium text-slate-800">
                      {selectedSale.sale.mpesa_code}
                    </p>
                  </div>
                )}

              </div>

              {/* Receipt Items */}
              <div className="overflow-hidden rounded-xl border border-slate-200">

                <div className="overflow-x-auto">

                  <table className="w-full">

                    <thead className="bg-slate-50">
                      <tr>

                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                          Item
                        </th>

                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
                          Qty
                        </th>

                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                          Price
                        </th>

                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                          Total
                        </th>

                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">

                      {selectedSale.items.map((item) => (
                        <tr key={item.id}>

                          <td className="px-4 py-3 text-sm text-slate-800">
                            {item.product_name}
                          </td>

                          <td className="px-4 py-3 text-center text-sm text-slate-600">
                            {item.quantity}
                          </td>

                          <td className="px-4 py-3 text-right text-sm text-slate-600">
                            KES{" "}
                            {item.unit_price.toLocaleString()}
                          </td>

                          <td className="px-4 py-3 text-right text-sm font-medium text-slate-800">
                            KES{" "}
                            {item.subtotal.toLocaleString()}
                          </td>

                        </tr>
                      ))}

                    </tbody>

                  </table>

                </div>

              </div>

              {/* Totals */}
              <div className="space-y-2 border-t border-slate-200 pt-4">

                <div className="flex justify-between text-sm text-slate-600">
                  <span>
                    Amount Paid
                  </span>

                  <span>
                    KES{" "}
                    {selectedSale.sale.amount_paid.toLocaleString()}
                  </span>
                </div>

                {selectedSale.sale.payment_method ===
                  "Cash" && (
                  <div className="flex justify-between text-sm text-slate-600">

                    <span>
                      Change
                    </span>

                    <span>
                      KES{" "}
                      {selectedSale.sale.change_amount.toLocaleString()}
                    </span>

                  </div>
                )}

                <div className="flex justify-between border-t border-slate-200 pt-3 text-xl font-bold text-slate-900">

                  <span>
                    Total
                  </span>

                  <span>
                    KES{" "}
                    {selectedSale.sale.total.toLocaleString()}
                  </span>

                </div>

              </div>

              {/* Footer */}
              <div className="border-t border-dashed border-slate-300 pt-5 text-center">

                <p className="text-sm font-medium text-slate-700">
                  Thank you for your business
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Powered by Invent POS
                </p>

              </div>

              {/* Receipt Buttons */}
              <div className="flex gap-3 pt-2 print:hidden">

                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  <Printer size={18} />

                  Print Receipt
                </button>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================= */}
      {/* PAYMENT MODAL */}
      {/* ========================================= */}

      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">

          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-200 p-5">

              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  Complete Payment
                </h2>

                <p className="text-sm text-slate-500">
                  Finalize the current sale.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowPayment(false);
                  setPaymentError("");
                }}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>

            </div>

            <form
              onSubmit={handleCompleteSale}
              className="space-y-5 p-5"
            >

              <div className="rounded-xl bg-slate-50 p-4">

                <div className="flex items-center justify-between">

                  <span className="text-sm text-slate-500">
                    Amount Due
                  </span>

                  <span className="text-2xl font-bold text-slate-800">
                    KES {total.toLocaleString()}
                  </span>

                </div>

              </div>

              {paymentError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {paymentError}
                </div>
              )}

              {/* Payment Method */}
              <div>

                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Payment Method
                </label>

                <div className="grid grid-cols-2 gap-3">

                  <button
                    type="button"
                    onClick={() =>
                      setPaymentMethod("Cash")
                    }
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                      paymentMethod === "Cash"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Cash
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPaymentMethod("M-Pesa")
                    }
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                      paymentMethod === "M-Pesa"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    M-Pesa
                  </button>

                </div>

              </div>

              {/* Amount Paid */}
              <div>

                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Amount Paid
                </label>

                <input
                  type="number"
                  required
                  min={total}
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) =>
                    setAmountPaid(e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />

              </div>

              {/* Cash Change */}
              {paymentMethod === "Cash" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">

                  <p className="text-sm text-slate-500">
                    Change
                  </p>

                  <p className="mt-1 text-xl font-bold text-green-600">
                    KES {change.toLocaleString()}
                  </p>

                </div>
              )}

              {/* M-Pesa Code */}
              {paymentMethod === "M-Pesa" && (
                <div>

                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    M-Pesa Transaction Code
                  </label>

                  <input
                    type="text"
                    required
                    value={mpesaCode}
                    onChange={(e) =>
                      setMpesaCode(
                        e.target.value.toUpperCase()
                      )
                    }
                    placeholder="e.g. QGH12ABC34"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />

                </div>
              )}

              <div className="flex gap-3 pt-2">

                <button
                  type="button"
                  onClick={() => {
                    setShowPayment(false);
                    setPaymentError("");
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={processingSale}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingSale
                    ? "Processing..."
                    : "Complete Sale"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

      {/* ========================================= */}
      {/* PAGE HEADING */}
      {/* ========================================= */}

      <div>

        <h1 className="text-2xl font-bold text-slate-800">
          Point of Sale
        </h1>

        <p className="mt-1 text-slate-500">
          Process sales and review completed transactions.
        </p>

      </div>

      {/* ========================================= */}
      {/* TABS */}
      {/* ========================================= */}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">

        <button
          type="button"
          onClick={() =>
            setActiveTab("sale")
          }
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
            activeTab === "sale"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          New Sale
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab("history")
          }
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
            activeTab === "history"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Sales History
        </button>

      </div>

      {/* ========================================= */}
      {/* NEW SALE TAB */}
      {/* ========================================= */}

      {activeTab === "sale" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">

          {/* PRODUCTS AREA */}
          <section className="space-y-5">

            {/* Search */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

              <div className="relative">

                <Search
                  size={19}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) =>
                    setSearchTerm(e.target.value)
                  }
                  placeholder="Search products or categories..."
                  className="w-full rounded-lg border border-slate-300 py-3 pl-11 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />

              </div>

            </div>

            {/* Products Grid */}
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                Loading products...
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">

                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={product.stock === 0}
                    onClick={() =>
                      addToCart(product)
                    }
                    className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:shadow-sm"
                  >

                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <ShoppingCart size={22} />
                    </div>

                    <h3 className="font-semibold text-slate-800">
                      {product.name}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {product.category}
                    </p>

                    <div className="mt-5 flex items-end justify-between gap-3">

                      <div>
                        <p className="text-xs text-slate-400">
                          Selling Price
                        </p>

                        <p className="font-bold text-slate-800">
                          KES{" "}
                          {product.price.toLocaleString()}
                        </p>
                      </div>

                      <div className="text-right">

                        <p className="text-xs text-slate-400">
                          Stock
                        </p>

                        <p
                          className={`text-sm font-semibold ${
                            product.stock === 0
                              ? "text-red-600"
                              : product.stock <= 5
                              ? "text-orange-600"
                              : "text-green-600"
                          }`}
                        >
                          {product.stock}
                        </p>

                      </div>

                    </div>

                  </button>
                ))}

              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                No products found.
              </div>
            )}

          </section>

          {/* ========================================= */}
          {/* CART */}
          {/* ========================================= */}

          <aside className="h-fit rounded-xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-24">

            <div className="flex items-center justify-between border-b border-slate-200 p-5">

              <div>

                <h2 className="font-semibold text-slate-800">
                  Current Sale
                </h2>

                <p className="text-sm text-slate-500">
                  {itemCount}{" "}
                  item
                  {itemCount === 1
                    ? ""
                    : "s"}
                </p>

              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Clear
                </button>
              )}

            </div>

            <div className="max-h-[430px] overflow-y-auto">

              {cart.length > 0 ? (
                <div className="divide-y divide-slate-200">

                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <p className="truncate font-medium text-slate-800">
                            {item.name}
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            KES{" "}
                            {item.price.toLocaleString()}{" "}
                            each
                          </p>

                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(
                              item.id
                            )
                          }
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>

                      </div>

                      <div className="mt-4 flex items-center justify-between">

                        <div className="flex items-center rounded-lg border border-slate-200">

                          <button
                            type="button"
                            onClick={() =>
                              decreaseQuantity(
                                item.id
                              )
                            }
                            className="p-2 text-slate-600 hover:bg-slate-100"
                          >
                            <Minus size={16} />
                          </button>

                          <span className="min-w-10 text-center text-sm font-semibold text-slate-800">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              increaseQuantity(
                                item.id
                              )
                            }
                            disabled={
                              item.quantity >=
                              item.stock
                            }
                            className="p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus size={16} />
                          </button>

                        </div>

                        <p className="font-semibold text-slate-800">
                          KES{" "}
                          {(
                            item.price *
                            item.quantity
                          ).toLocaleString()}
                        </p>

                      </div>

                    </div>
                  ))}

                </div>
              ) : (
                <div className="px-6 py-14 text-center">

                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <ShoppingCart size={24} />
                  </div>

                  <p className="font-medium text-slate-700">
                    Your cart is empty
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Select products to start a sale.
                  </p>

                </div>
              )}

            </div>

            {/* Total */}
            <div className="border-t border-slate-200 p-5">

              <div className="mb-5 flex items-center justify-between">

                <span className="text-slate-500">
                  Total
                </span>

                <span className="text-2xl font-bold text-slate-800">
                  KES {total.toLocaleString()}
                </span>

              </div>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  setPaymentError("");
                  setAmountPaid(
                    total.toString()
                  );
                  setShowPayment(true);
                }}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Proceed to Payment
              </button>

            </div>

          </aside>

        </div>
      )}

      {/* ========================================= */}
      {/* SALES HISTORY TAB */}
      {/* ========================================= */}

      {activeTab === "history" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 p-5">

            <h2 className="text-lg font-semibold text-slate-800">
              Sales History
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Recent completed transactions.
            </p>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-left">

              <thead className="border-b border-slate-200 bg-slate-50">

                <tr>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Receipt
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Total
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Payment
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Cashier
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Date
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Action
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-200">

                {salesHistory.length > 0 ? (
                  salesHistory.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-slate-50"
                    >

                      <td className="px-6 py-4 font-medium text-slate-800">
                        {sale.receipt_number}
                      </td>

                      <td className="px-6 py-4 font-semibold text-slate-800">
                        KES{" "}
                        {sale.total.toLocaleString()}
                      </td>

                      <td className="px-6 py-4">

                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          {sale.payment_method}
                        </span>

                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {sale.sold_by_name ||
                          "Unknown"}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(
                          sale.created_at
                        ).toLocaleString()}
                      </td>

                      <td className="px-6 py-4">

                        <button
                          type="button"
                          disabled={loadingReceipt}
                          onClick={() =>
                            viewSaleDetails(
                              sale.id
                            )
                          }
                          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                        >
                          View Receipt
                        </button>

                      </td>

                    </tr>
                  ))
                ) : (
                  <tr>

                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      No sales recorded yet.
                    </td>

                  </tr>
                )}

              </tbody>

            </table>

          </div>

        </div>
      )}

    </div>
  );
}

export default Sales;