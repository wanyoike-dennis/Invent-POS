import { useEffect, useMemo, useState } from "react";
import {
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
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
  returned_quantity: number;
  returnable_quantity: number;
};

type SaleReturnItem = {
  id: number;
  return_id: number;
  sale_item_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type SaleReturn = {
  id: number;
  sale_id: number;
  refund_amount: number;
  reason: string;
  returned_by: number;
  returned_by_name: string | null;
  created_at: string;
  items: SaleReturnItem[];
};

type SaleSummary = {
  original_total: number;
  total_refunded: number;
  net_total: number;
};

type ReturnHistoryRecord = {
  id: number;
  sale_id: number;
  refund_amount: number;
  reason: string;
  returned_by: number;
  returned_by_name: string | null;
  created_at: string;
  receipt_number: string;
  payment_method: string;
};

function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] =
    useState<"sale" | "history" | "returns">("sale");

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<"Cash" | "M-Pesa">("Cash");

  const [amountPaid, setAmountPaid] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [processingSale, setProcessingSale] = useState(false);

  const [salesHistory, setSalesHistory] = useState<Sale[]>([]);

  const [returnsHistory, setReturnsHistory] = useState<ReturnHistoryRecord[]>([]);
  const [returnHistorySearch, setReturnHistorySearch] = useState("");
  const [returnHistoryDate, setReturnHistoryDate] = useState("");

  const [selectedSale, setSelectedSale] = useState<{
    sale: Sale;
    items: SaleItem[];
    returns: SaleReturn[];
    summary: SaleSummary;
  } | null>(null);

  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnError, setReturnError] = useState("");
  const [processingReturn, setProcessingReturn] = useState(false);

  const [historySearch, setHistorySearch] = useState("");
  const [paymentFilter, setPaymentFilter] =
    useState<"All" | "Cash" | "M-Pesa">("All");
  const [dateFilter, setDateFilter] = useState("");

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

  const fetchReturnsHistory = async () => {
    try {
      const response = await apiFetch("/api/sales/returns/history");

      if (!response.ok) {
        throw new Error("Failed to load returns history");
      }

      const data = await response.json();
      setReturnsHistory(data);
    } catch (error) {
      console.error("Error loading returns history:", error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchSalesHistory();
    fetchReturnsHistory();
  }, []);

  const viewSaleDetails = async (id: number) => {
    try {
      setLoadingReceipt(true);

      const response = await apiFetch(`/api/sales/${id}`);

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

  const handlePrintReceipt = () => {
    window.print();
  };

  const openReturnModal = () => {
    if (!selectedSale) return;

    const quantities: Record<number, number> = {};
    selectedSale.items.forEach((item) => {
      quantities[item.id] = 0;
    });

    setReturnQuantities(quantities);
    setReturnReason("");
    setReturnError("");
    setShowReturnModal(true);
  };

  const changeReturnQuantity = (item: SaleItem, change: number) => {
    setReturnQuantities((current) => {
      const currentQuantity = current[item.id] || 0;
      const nextQuantity = Math.min(
        Math.max(currentQuantity + change, 0),
        item.returnable_quantity
      );

      return {
        ...current,
        [item.id]: nextQuantity,
      };
    });
  };

  const returnRefundTotal = selectedSale
    ? selectedSale.items.reduce(
        (sum, item) =>
          sum + (returnQuantities[item.id] || 0) * Number(item.unit_price),
        0
      )
    : 0;

  const handleProcessReturn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedSale) return;

    setReturnError("");

    const items = selectedSale.items
      .map((item) => ({
        saleItemId: item.id,
        quantity: returnQuantities[item.id] || 0,
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setReturnError("Select at least one item to return.");
      return;
    }

    if (!returnReason.trim()) {
      setReturnError("Return reason is required.");
      return;
    }

    try {
      setProcessingReturn(true);

      const saleId = selectedSale.sale.id;
      const response = await apiFetch(`/api/sales/${saleId}/return`, {
        method: "POST",
        body: JSON.stringify({
          items,
          reason: returnReason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setReturnError(data.message || "Failed to process return.");
        return;
      }

      setShowReturnModal(false);
      setReturnQuantities({});
      setReturnReason("");
      setReturnError("");

      await fetchProducts();
      await fetchSalesHistory();
      await fetchReturnsHistory();
      await viewSaleDetails(saleId);
    } catch (error) {
      console.error("Error processing return:", error);
      setReturnError("Could not process the return.");
    } finally {
      setProcessingReturn(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search)
      );
    });
  }, [products, searchTerm]);

  const filteredSales = useMemo(() => {
    return salesHistory.filter((sale) => {
      const search = historySearch.trim().toLowerCase();

      const matchesSearch =
        sale.receipt_number.toLowerCase().includes(search) ||
        (sale.sold_by_name || "").toLowerCase().includes(search);

      const matchesPayment =
        paymentFilter === "All" ||
        sale.payment_method === paymentFilter;

      let matchesDate = true;

      if (dateFilter) {
        const saleDate = new Date(sale.created_at);

        const year = saleDate.getFullYear();

        const month = String(
          saleDate.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
          saleDate.getDate()
        ).padStart(2, "0");

        const formattedDate = `${year}-${month}-${day}`;

        matchesDate = formattedDate === dateFilter;
      }

      return (
        matchesSearch &&
        matchesPayment &&
        matchesDate
      );
    });
  }, [
    salesHistory,
    historySearch,
    paymentFilter,
    dateFilter,
  ]);

  const todaySummary = useMemo(() => {
    const now = new Date();

    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    const todaysSales = salesHistory.filter((sale) => {
      const saleDate = new Date(sale.created_at);

      return (
        saleDate.getFullYear() === todayYear &&
        saleDate.getMonth() === todayMonth &&
        saleDate.getDate() === todayDate
      );
    });

    const totalSales = todaysSales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );

    const cashSales = todaysSales
      .filter(
        (sale) => sale.payment_method === "Cash"
      )
      .reduce(
        (sum, sale) => sum + Number(sale.total),
        0
      );

    const mpesaSales = todaysSales
      .filter(
        (sale) => sale.payment_method === "M-Pesa"
      )
      .reduce(
        (sum, sale) => sum + Number(sale.total),
        0
      );

    return {
      totalSales,
      transactions: todaysSales.length,
      cashSales,
      mpesaSales,
    };
  }, [salesHistory]);

  const filteredReturns = useMemo(() => {
    return returnsHistory.filter((record) => {
      const search = returnHistorySearch.trim().toLowerCase();

      const matchesSearch =
        record.receipt_number.toLowerCase().includes(search) ||
        record.reason.toLowerCase().includes(search) ||
        (record.returned_by_name || "").toLowerCase().includes(search);

      let matchesDate = true;

      if (returnHistoryDate) {
        const returnDate = new Date(record.created_at);
        const year = returnDate.getFullYear();
        const month = String(returnDate.getMonth() + 1).padStart(2, "0");
        const day = String(returnDate.getDate()).padStart(2, "0");
        matchesDate = `${year}-${month}-${day}` === returnHistoryDate;
      }

      return matchesSearch && matchesDate;
    });
  }, [returnsHistory, returnHistorySearch, returnHistoryDate]);

  const returnsSummary = useMemo(() => {
    const now = new Date();

    const isToday = (value: string) => {
      const date = new Date(value);
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    };

    const todayReturns = returnsHistory.filter((record) =>
      isToday(record.created_at)
    );

    return {
      totalReturns: returnsHistory.length,
      totalRefunded: returnsHistory.reduce(
        (sum, record) => sum + Number(record.refund_amount),
        0
      ),
      returnsToday: todayReturns.length,
      refundedToday: todayReturns.reduce(
        (sum, record) => sum + Number(record.refund_amount),
        0
      ),
    };
  }, [returnsHistory]);

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

    if (!Number.isFinite(paid) || paid < total) {
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

      setCart([]);
      setShowPayment(false);
      setAmountPaid("");
      setMpesaCode("");
      setPaymentMethod("Cash");

      await fetchProducts();
      await fetchSalesHistory();

      await viewSaleDetails(data.sale.id);
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

      {/* RECEIPT MODAL */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 print:static print:bg-white print:p-0">

          <div
            id="print-receipt"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none"
          >

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
                onClick={() =>
                  setSelectedSale(null)
                }
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>

            </div>

            <div className="space-y-5 p-6">

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

                <p className="mt-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                  Sales Receipt
                </p>

              </div>

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
                            <div>{item.quantity}</div>
                            {item.returned_quantity > 0 && (
                              <div className="mt-1 text-xs font-medium text-orange-600 print:text-black">
                                {item.returned_quantity} returned
                              </div>
                            )}
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

              <div className="space-y-2 border-t border-slate-200 pt-4">

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Amount Paid</span>
                  <span>
                    KES {Number(selectedSale.sale.amount_paid).toLocaleString()}
                  </span>
                </div>

                {selectedSale.sale.payment_method === "Cash" && (
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Change</span>
                    <span>
                      KES {Number(selectedSale.sale.change_amount).toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedSale.summary.total_refunded > 0 ? (
                  <>
                    <div className="flex justify-between border-t border-slate-200 pt-3 text-sm text-slate-600">
                      <span>Original Total</span>
                      <span>
                        KES {selectedSale.summary.original_total.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm font-medium text-orange-600 print:text-black">
                      <span>Total Refunded</span>
                      <span>
                        - KES {selectedSale.summary.total_refunded.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between border-t border-slate-200 pt-3 text-xl font-bold text-slate-900">
                      <span>Net Sale</span>
                      <span>
                        KES {selectedSale.summary.net_total.toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between border-t border-slate-200 pt-3 text-xl font-bold text-slate-900">
                    <span>Total</span>
                    <span>
                      KES {Number(selectedSale.sale.total).toLocaleString()}
                    </span>
                  </div>
                )}

              </div>

              {selectedSale.returns.length > 0 && (
                <div className="space-y-4 border-t border-slate-200 pt-5">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                      Return History
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Refunds processed against this receipt.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {selectedSale.returns.map((saleReturn) => (
                      <div
                        key={saleReturn.id}
                        className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 print:border-slate-300 print:bg-white"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-800">
                              Return #{saleReturn.id}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(saleReturn.created_at).toLocaleString()}
                            </p>
                          </div>

                          <p className="font-bold text-orange-700 print:text-black">
                            Refund: KES {saleReturn.refund_amount.toLocaleString()}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <span className="text-slate-500">Reason: </span>
                            <span className="font-medium text-slate-700">
                              {saleReturn.reason}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-500">Processed by: </span>
                            <span className="font-medium text-slate-700">
                              {saleReturn.returned_by_name || "Unknown"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 overflow-hidden rounded-lg border border-orange-100 bg-white print:border-slate-200">
                          {saleReturn.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-700">
                                  {item.product_name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {item.quantity} × KES {item.unit_price.toLocaleString()}
                                </p>
                              </div>

                              <p className="whitespace-nowrap font-semibold text-slate-800">
                                KES {item.subtotal.toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-dashed border-slate-300 pt-5 text-center">

                <p className="text-sm font-medium text-slate-700">
                  Thank you for your business
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Powered by Invent POS
                </p>

              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 print:hidden sm:grid-cols-3">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedSale(null)
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={openReturnModal}
                  disabled={!selectedSale.items.some((item) => item.returnable_quantity > 0)}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {selectedSale.items.some((item) => item.returnable_quantity > 0)
                    ? "Return Items"
                    : "Fully Returned"}
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

      {/* RETURN / REFUND MODAL */}
      {showReturnModal && selectedSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Return Items</h2>
                <p className="text-sm text-slate-500">
                  {selectedSale.sale.receipt_number}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!processingReturn) {
                    setShowReturnModal(false);
                    setReturnError("");
                  }
                }}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="space-y-5 p-5">
              {returnError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {returnError}
                </div>
              )}

              <div className="space-y-3">
                {selectedSale.items.map((item) => {
                  const quantity = returnQuantities[item.id] || 0;
                  const fullyReturned = item.returnable_quantity <= 0;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-4 ${
                        fullyReturned
                          ? "border-slate-200 bg-slate-50 opacity-70"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">{item.product_name}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            KES {Number(item.unit_price).toLocaleString()} each
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Sold: {item.quantity} · Returned: {item.returned_quantity} · Returnable: {item.returnable_quantity}
                          </p>
                        </div>

                        {fullyReturned ? (
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                            Fully returned
                          </span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => changeReturnQuantity(item, -1)}
                              disabled={quantity <= 0 || processingReturn}
                              className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Minus size={16} />
                            </button>

                            <span className="min-w-8 text-center font-semibold text-slate-800">
                              {quantity}
                            </span>

                            <button
                              type="button"
                              onClick={() => changeReturnQuantity(item, 1)}
                              disabled={quantity >= item.returnable_quantity || processingReturn}
                              className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Return Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Defective item, wrong item, customer return..."
                  className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>

              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-orange-800">Refund Amount</span>
                  <span className="text-2xl font-bold text-orange-700">
                    KES {returnRefundTotal.toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-xs text-orange-700">
                  Returned quantities will be added back to inventory.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={processingReturn}
                  onClick={() => {
                    setShowReturnModal(false);
                    setReturnError("");
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={processingReturn || returnRefundTotal <= 0}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {processingReturn ? "Processing..." : "Confirm Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
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

      {/* PAGE HEADING */}
      <div>

        <h1 className="text-2xl font-bold text-slate-800">
          Point of Sale
        </h1>

        <p className="mt-1 text-slate-500">
          Process sales and review completed transactions.
        </p>

      </div>

      {/* TABS */}
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

        <button
          type="button"
          onClick={() => {
            setActiveTab("returns");
            fetchReturnsHistory();
          }}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
            activeTab === "returns"
              ? "border-orange-600 text-orange-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Returns History
        </button>

      </div>

      {/* NEW SALE TAB */}
      {activeTab === "sale" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">

          <section className="space-y-5">

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

          <aside className="h-fit rounded-xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-24">

            <div className="flex items-center justify-between border-b border-slate-200 p-5">

              <div>

                <h2 className="font-semibold text-slate-800">
                  Current Sale
                </h2>

                <p className="text-sm text-slate-500">
                  {itemCount} item
                  {itemCount === 1 ? "" : "s"}
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
                            removeFromCart(item.id)
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
                              decreaseQuantity(item.id)
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
                              increaseQuantity(item.id)
                            }
                            disabled={
                              item.quantity >= item.stock
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
                  setAmountPaid(total.toString());
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

      {/* SALES HISTORY TAB */}
      {activeTab === "history" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 p-5">

            <h2 className="text-lg font-semibold text-slate-800">
              Sales History
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Recent completed transactions.
            </p>

            <p className="mt-2 text-xs font-medium text-slate-400">
              Showing {filteredSales.length} of{" "}
              {salesHistory.length} transactions
            </p>

          </div>

          {/* TODAY SUMMARY */}
          <div className="border-b border-slate-200 bg-slate-50/50 p-5">

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  Today's Sales
                </p>

                <p className="mt-2 text-2xl font-bold text-slate-800">
                  KES{" "}
                  {todaySummary.totalSales.toLocaleString()}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Total revenue today
                </p>

              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  Transactions Today
                </p>

                <p className="mt-2 text-2xl font-bold text-slate-800">
                  {todaySummary.transactions}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Completed sales
                </p>

              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  Cash Sales
                </p>

                <p className="mt-2 text-2xl font-bold text-blue-600">
                  KES{" "}
                  {todaySummary.cashSales.toLocaleString()}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Cash received today
                </p>

              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  M-Pesa Sales
                </p>

                <p className="mt-2 text-2xl font-bold text-green-600">
                  KES{" "}
                  {todaySummary.mpesaSales.toLocaleString()}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  M-Pesa received today
                </p>

              </div>

            </div>

          </div>

          {/* FILTERS */}
          <div className="border-b border-slate-200 p-5">

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_auto]">

              <div className="relative">

                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) =>
                    setHistorySearch(e.target.value)
                  }
                  placeholder="Search receipt or cashier..."
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />

              </div>

              <select
                value={paymentFilter}
                onChange={(e) =>
                  setPaymentFilter(
                    e.target.value as
                      | "All"
                      | "Cash"
                      | "M-Pesa"
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="All">
                  All Payments
                </option>

                <option value="Cash">
                  Cash
                </option>

                <option value="M-Pesa">
                  M-Pesa
                </option>
              </select>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(e.target.value)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />

              <button
                type="button"
                onClick={() => {
                  setHistorySearch("");
                  setPaymentFilter("All");
                  setDateFilter("");
                }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Clear
              </button>

            </div>

          </div>

          {/* HISTORY TABLE */}
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

                {filteredSales.length > 0 ? (
                  filteredSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="transition hover:bg-slate-50"
                    >

                      <td className="px-6 py-4 font-medium text-slate-800">
                        {sale.receipt_number}
                      </td>

                      <td className="px-6 py-4 font-semibold text-slate-800">
                        KES{" "}
                        {sale.total.toLocaleString()}
                      </td>

                      <td className="px-6 py-4">

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            sale.payment_method === "M-Pesa"
                              ? "bg-green-50 text-green-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {sale.payment_method}
                        </span>

                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {sale.sold_by_name || "Unknown"}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {new Date(
                          sale.created_at
                        ).toLocaleString()}
                      </td>

                      <td className="px-6 py-4">

                        <button
                          type="button"
                          disabled={loadingReceipt}
                          onClick={() =>
                            viewSaleDetails(sale.id)
                          }
                          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {loadingReceipt
                            ? "Loading..."
                            : "View Receipt"}
                        </button>

                      </td>

                    </tr>
                  ))
                ) : (
                  <tr>

                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      {salesHistory.length === 0
                        ? "No sales recorded yet."
                        : "No sales match your filters."}
                    </td>

                  </tr>
                )}

              </tbody>

            </table>

          </div>

        </div>
      )}

      {/* RETURNS HISTORY TAB */}
      {activeTab === "returns" && (
        <div className="space-y-5">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Total Returns</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{returnsSummary.totalReturns}</p>
              <p className="mt-1 text-xs text-slate-400">All return transactions</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Total Refunded</p>
              <p className="mt-2 text-2xl font-bold text-orange-600">KES {returnsSummary.totalRefunded.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-400">Refund value across all returns</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Returns Today</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{returnsSummary.returnsToday}</p>
              <p className="mt-1 text-xs text-slate-400">Return transactions today</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Refunded Today</p>
              <p className="mt-2 text-2xl font-bold text-orange-600">KES {returnsSummary.refundedToday.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-400">Refund value processed today</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-800">Returns History</h2>
              <p className="mt-1 text-sm text-slate-500">Review all product returns and refunds.</p>
              <p className="mt-2 text-xs font-medium text-slate-400">Showing {filteredReturns.length} of {returnsHistory.length} returns</p>
            </div>

            <div className="border-b border-slate-200 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_190px_auto]">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={returnHistorySearch}
                    onChange={(e) => setReturnHistorySearch(e.target.value)}
                    placeholder="Search receipt, reason or staff..."
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <input
                  type="date"
                  value={returnHistoryDate}
                  onChange={(e) => setReturnHistoryDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={() => { setReturnHistorySearch(""); setReturnHistoryDate(""); }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Return</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Receipt</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Refund</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Reason</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Processed By</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Date</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredReturns.length > 0 ? (
                    filteredReturns.map((record) => (
                      <tr key={record.id} className="transition hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800">#{record.id}</td>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-700">{record.receipt_number}</td>
                        <td className="whitespace-nowrap px-6 py-4 font-semibold text-orange-600">KES {record.refund_amount.toLocaleString()}</td>
                        <td className="max-w-xs px-6 py-4 text-sm text-slate-600">{record.reason}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">{record.returned_by_name || "Unknown"}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{new Date(record.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            disabled={loadingReceipt}
                            onClick={() => viewSaleDetails(record.sale_id)}
                            className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        {returnsHistory.length === 0 ? "No returns recorded yet." : "No returns match your filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Sales;