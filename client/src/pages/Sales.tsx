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

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
};

type Sale = {
  id: number;
  receipt_number: string;
  total: number;
  refunded_amount: number;
  net_total: number;
  refund_status:
    | "Not Refunded"
    | "Partially Refunded"
    | "Fully Refunded";
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  mpesa_code: string | null;
  cash_amount: number;
  mpesa_amount: number;
  sold_by_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  sale_date: string | null;
  is_backdated: number;
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
  const storedUser = localStorage.getItem("user");

  let userRole = "";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;
    userRole = String(user?.role || "").toLowerCase();
  } catch {
    userRole = "";
  }

  const canManageReturns =
    userRole === "admin" || userRole === "manager";

  const canRecordPastSale =
    userRole === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [pastCustomerId, setPastCustomerId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] =
    useState<"sale" | "history" | "returns">("sale");

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<"Cash" | "M-Pesa" | "Split">("Cash");

  const [amountPaid, setAmountPaid] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [mpesaAmount, setMpesaAmount] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [processingSale, setProcessingSale] = useState(false);

  const [showPastSaleModal, setShowPastSaleModal] = useState(false);
  const [pastSaleDate, setPastSaleDate] = useState("");
  const [pastSaleSearch, setPastSaleSearch] = useState("");
  const [pastSaleCart, setPastSaleCart] = useState<CartItem[]>([]);
  const [pastPaymentMethod, setPastPaymentMethod] =
    useState<"Cash" | "M-Pesa" | "Split">("Cash");
  const [pastAmountPaid, setPastAmountPaid] = useState("");
  const [pastCashAmount, setPastCashAmount] = useState("");
  const [pastMpesaAmount, setPastMpesaAmount] = useState("");
  const [pastMpesaCode, setPastMpesaCode] = useState("");
  const [pastSaleError, setPastSaleError] = useState("");
  const [processingPastSale, setProcessingPastSale] = useState(false);

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
    useState<"All" | "Cash" | "M-Pesa" | "Split">("All");
  const [dateFilter, setDateFilter] = useState("");

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const pastSaleMaxDate = (() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return formatLocalDate(date);
  })();

  const pastSaleMinDate = (() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatLocalDate(date);
  })();

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

  const fetchCustomers = async () => {
    try {
      const response = await apiFetch("/api/customers");

      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : data.customers || []);
    } catch (error) {
      console.error("Error loading customers:", error);
      setCustomers([]);
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
    if (!canManageReturns) {
      setReturnsHistory([]);
      return;
    }

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
    fetchCustomers();
    fetchSalesHistory();

    if (canManageReturns) {
      fetchReturnsHistory();
    }
  }, [canManageReturns]);

  useEffect(() => {
    if (!canManageReturns && activeTab === "returns") {
      setActiveTab("history");
    }

    if (!canManageReturns && showReturnModal) {
      setShowReturnModal(false);
    }
  }, [canManageReturns, activeTab, showReturnModal]);

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
    if (!canManageReturns || !selectedSale) return;

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

    if (!canManageReturns || !selectedSale) {
      setReturnError("You do not have permission to process returns.");
      return;
    }

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
        (sale.sold_by_name || "").toLowerCase().includes(search) ||
        (sale.customer_name || "Walk-in Customer").toLowerCase().includes(search) ||
        (sale.customer_phone || "").toLowerCase().includes(search);

      const matchesPayment =
        paymentFilter === "All" ||
        sale.payment_method === paymentFilter;

      let matchesDate = true;

      if (dateFilter) {
        const saleDate = sale.sale_date
          ? new Date(`${sale.sale_date}T00:00:00`)
          : new Date(sale.created_at);

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

    const isToday = (value: string) => {
      const date = new Date(value);

      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    };

    const todaysSales = salesHistory.filter((sale) =>
      isToday(
        sale.sale_date
          ? `${sale.sale_date}T00:00:00`
          : sale.created_at
      )
    );

    const todaysReturns = returnsHistory.filter((record) =>
      isToday(record.created_at)
    );

    const grossSales = todaysSales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );

    const refundsToday = todaysReturns.reduce(
      (sum, record) =>
        sum + Number(record.refund_amount),
      0
    );

    const netSales = Math.max(
      grossSales - refundsToday,
      0
    );

    const cashSales = todaysSales
      .filter(
        (sale) => sale.payment_method === "Cash"
      )
      .reduce(
        (sum, sale) => sum + Number(sale.net_total),
        0
      );

    const mpesaSales = todaysSales
      .filter(
        (sale) => sale.payment_method === "M-Pesa"
      )
      .reduce(
        (sum, sale) => sum + Number(sale.net_total),
        0
      );

    return {
      grossSales,
      refundsToday,
      netSales,
      transactions: todaysSales.length,
      cashSales,
      mpesaSales,
    };
  }, [salesHistory, returnsHistory]);

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

  const splitPaid =
    Number(cashAmount || 0) + Number(mpesaAmount || 0);

  const change =
    paymentMethod === "Cash"
      ? Math.max(Number(amountPaid || 0) - total, 0)
      : paymentMethod === "Split"
        ? Math.max(splitPaid - total, 0)
        : 0;

  const filteredPastSaleProducts = useMemo(() => {
    const search = pastSaleSearch.trim().toLowerCase();

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search)
      );
    });
  }, [products, pastSaleSearch]);

  const pastSaleTotal = pastSaleCart.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  const pastSplitPaid =
    Number(pastCashAmount || 0) +
    Number(pastMpesaAmount || 0);

  const pastSaleChange =
    pastPaymentMethod === "Cash"
      ? Math.max(Number(pastAmountPaid || 0) - pastSaleTotal, 0)
      : pastPaymentMethod === "Split"
        ? Math.max(pastSplitPaid - pastSaleTotal, 0)
        : 0;

  const openPastSaleModal = () => {
    if (!canRecordPastSale) {
      return;
    }

    setPastSaleDate(pastSaleMaxDate);
    setPastCustomerId("");
    setPastSaleSearch("");
    setPastSaleCart([]);
    setPastPaymentMethod("Cash");
    setPastAmountPaid("");
    setPastCashAmount("");
    setPastMpesaAmount("");
    setPastMpesaCode("");
    setPastSaleError("");
    setShowPastSaleModal(true);
  };

  const closePastSaleModal = () => {
    if (processingPastSale) {
      return;
    }

    setShowPastSaleModal(false);
    setPastSaleError("");
  };

  const addPastSaleItem = (product: Product) => {
    if (product.stock <= 0) {
      return;
    }

    setPastSaleCart((currentCart) => {
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

  const changePastSaleQuantity = (
    id: number,
    change: number
  ) => {
    setPastSaleCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.id !== id) {
            return item;
          }

          const nextQuantity =
            item.quantity + change;

          if (nextQuantity > item.stock) {
            return item;
          }

          return {
            ...item,
            quantity: nextQuantity,
          };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removePastSaleItem = (id: number) => {
    setPastSaleCart((currentCart) =>
      currentCart.filter((item) => item.id !== id)
    );
  };

  const handleRecordPastSale = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!canRecordPastSale) {
      setPastSaleError(
        "Only an administrator can record a past sale."
      );
      return;
    }

    setPastSaleError("");

    if (!pastSaleDate) {
      setPastSaleError("Past sale date is required.");
      return;
    }

    if (
      pastSaleDate < pastSaleMinDate ||
      pastSaleDate > pastSaleMaxDate
    ) {
      setPastSaleError(
        "Past sales can only be recorded for the previous 7 calendar days."
      );
      return;
    }

    if (pastSaleCart.length === 0) {
      setPastSaleError(
        "Add at least one product to the past sale."
      );
      return;
    }

    const paid =
      pastPaymentMethod === "Split"
        ? pastSplitPaid
        : Number(pastAmountPaid);

    if (pastPaymentMethod !== "Split") {
      if (!Number.isFinite(paid) || paid < pastSaleTotal) {
        setPastSaleError("Amount paid cannot be less than the total.");
        return;
      }
    } else {
      const cash = Number(pastCashAmount);
      const mpesa = Number(pastMpesaAmount);

      if (
        !Number.isFinite(cash) ||
        !Number.isFinite(mpesa) ||
        cash < 0 ||
        mpesa <= 0
      ) {
        setPastSaleError("Enter valid Cash and M-Pesa amounts.");
        return;
      }

      if (cash + mpesa < pastSaleTotal) {
        setPastSaleError(
          "Cash amount plus M-Pesa amount cannot be less than the total."
        );
        return;
      }

      if (cash < Math.max(pastSaleTotal - mpesa, 0)) {
        setPastSaleError(
          "Any change on a split payment must come from the Cash portion."
        );
        return;
      }
    }

    if (
      (pastPaymentMethod === "M-Pesa" ||
        pastPaymentMethod === "Split") &&
      !pastMpesaCode.trim()
    ) {
      setPastSaleError("M-Pesa transaction code is required.");
      return;
    }

    try {
      setProcessingPastSale(true);

      const response = await apiFetch(
        "/api/sales/past",
        {
          method: "POST",
          body: JSON.stringify({
            items: pastSaleCart.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
            paymentMethod: pastPaymentMethod,
            amountPaid:
              pastPaymentMethod === "Split" ? undefined : paid,
            cashAmount:
              pastPaymentMethod === "Split"
                ? Number(pastCashAmount)
                : undefined,
            mpesaAmount:
              pastPaymentMethod === "Split"
                ? Number(pastMpesaAmount)
                : undefined,
            mpesaCode:
              pastPaymentMethod === "M-Pesa" ||
              pastPaymentMethod === "Split"
                ? pastMpesaCode.trim()
                : undefined,
            saleDate: pastSaleDate,
            customerId: pastCustomerId
              ? Number(pastCustomerId)
              : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setPastSaleError(
          data.message ||
            "Failed to record past sale."
        );
        return;
      }

      setShowPastSaleModal(false);
      setPastSaleCart([]);
      setPastSaleSearch("");
      setPastSaleDate("");
      setPastCustomerId("");
      setPastAmountPaid("");
      setPastCashAmount("");
      setPastMpesaAmount("");
      setPastMpesaCode("");
      setPastPaymentMethod("Cash");

      await fetchProducts();
      await fetchSalesHistory();
      await viewSaleDetails(data.sale.id);
    } catch (error) {
      console.error(
        "Error recording past sale:",
        error
      );

      setPastSaleError(
        "Could not record the past sale."
      );
    } finally {
      setProcessingPastSale(false);
    }
  };

  const handleCompleteSale = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setPaymentError("");

    if (cart.length === 0) {
      setPaymentError("Cart is empty.");
      return;
    }

    const paid =
      paymentMethod === "Split"
        ? splitPaid
        : Number(amountPaid);

    if (paymentMethod !== "Split") {
      if (!Number.isFinite(paid) || paid < total) {
        setPaymentError("Amount paid cannot be less than the total.");
        return;
      }
    } else {
      const cash = Number(cashAmount);
      const mpesa = Number(mpesaAmount);

      if (
        !Number.isFinite(cash) ||
        !Number.isFinite(mpesa) ||
        cash < 0 ||
        mpesa <= 0
      ) {
        setPaymentError("Enter valid Cash and M-Pesa amounts.");
        return;
      }

      if (cash + mpesa < total) {
        setPaymentError(
          "Cash amount plus M-Pesa amount cannot be less than the total."
        );
        return;
      }

      if (cash < Math.max(total - mpesa, 0)) {
        setPaymentError(
          "Any change on a split payment must come from the Cash portion."
        );
        return;
      }
    }

    if (
      (paymentMethod === "M-Pesa" ||
        paymentMethod === "Split") &&
      !mpesaCode.trim()
    ) {
      setPaymentError("M-Pesa transaction code is required.");
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

            amountPaid:
              paymentMethod === "Split" ? undefined : paid,

            cashAmount:
              paymentMethod === "Split"
                ? Number(cashAmount)
                : undefined,

            mpesaAmount:
              paymentMethod === "Split"
                ? Number(mpesaAmount)
                : undefined,

            mpesaCode:
              paymentMethod === "M-Pesa" ||
              paymentMethod === "Split"
                ? mpesaCode.trim()
                : undefined,

            customerId: selectedCustomerId
              ? Number(selectedCustomerId)
              : null,
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
      setCashAmount("");
      setMpesaAmount("");
      setMpesaCode("");
      setPaymentMethod("Cash");
      setSelectedCustomerId("");

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
                    {selectedSale.sale.sale_date
                      ? new Date(
                          `${selectedSale.sale.sale_date}T00:00:00`
                        ).toLocaleDateString()
                      : new Date(
                          selectedSale.sale.created_at
                        ).toLocaleString()}
                  </p>

                  {Boolean(selectedSale.sale.is_backdated) && (
                    <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      Backdated sale
                    </span>
                  )}
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
                    Customer
                  </p>

                  <p className="mt-1 font-medium text-slate-800">
                    {selectedSale.sale.customer_name || "Walk-in Customer"}
                  </p>

                  {selectedSale.sale.customer_phone && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selectedSale.sale.customer_phone}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Payment
                  </p>

                  <p className="mt-1 font-medium text-slate-800">
                    {selectedSale.sale.payment_method}
                  </p>
                </div>

                {selectedSale.sale.payment_method === "Split" && (
                  <>
                    <div>
                      <p className="text-xs text-slate-500">Cash Portion</p>
                      <p className="mt-1 font-medium text-slate-800">
                        KES {Number(selectedSale.sale.cash_amount || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">M-Pesa Portion</p>
                      <p className="mt-1 font-medium text-slate-800">
                        KES {Number(selectedSale.sale.mpesa_amount || 0).toLocaleString()}
                      </p>
                    </div>
                  </>
                )}

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

                {(selectedSale.sale.payment_method === "Cash" ||
                  selectedSale.sale.payment_method === "Split") && (
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

              <div
                className={`grid grid-cols-1 gap-3 pt-2 print:hidden ${
                  canManageReturns ? "sm:grid-cols-3" : "sm:grid-cols-2"
                }`}
              >

                <button
                  type="button"
                  onClick={() =>
                    setSelectedSale(null)
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

                {canManageReturns && (
                  <button
                    type="button"
                    onClick={openReturnModal}
                    disabled={!selectedSale.items.some(
                      (item) => item.returnable_quantity > 0
                    )}
                    className="flex-1 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {selectedSale.items.some(
                      (item) => item.returnable_quantity > 0
                    )
                      ? "Return Items"
                      : "Fully Returned"}
                  </button>
                )}

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
      {canManageReturns && showReturnModal && selectedSale && (
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

      {/* ADMIN PAST SALE MODAL */}
      {canRecordPastSale && showPastSaleModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#18C8E8]">
                  Admin only
                </p>

                <h2 className="text-xl font-semibold text-[#071827]">
                  Record Past Sale
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Record a missed sale from the previous 7 calendar days.
                </p>
              </div>

              <button
                type="button"
                disabled={processingPastSale}
                onClick={closePastSaleModal}
                className="text-2xl text-slate-400 transition hover:text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleRecordPastSale}
              className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_390px]"
            >
              <section className="space-y-5 border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  This feature is for missed historical sales only. The selected date must be before today and no more than 7 calendar days old.
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Sale Date
                  </label>

                  <input
                    type="date"
                    required
                    min={pastSaleMinDate}
                    max={pastSaleMaxDate}
                    value={pastSaleDate}
                    onChange={(e) =>
                      setPastSaleDate(e.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 sm:max-w-sm"
                  />

                  <p className="mt-1.5 text-xs text-slate-500">
                    Allowed range: {pastSaleMinDate} to {pastSaleMaxDate}.
                  </p>
                </div>

                <div className="relative">
                  <Search
                    size={19}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="text"
                    value={pastSaleSearch}
                    onChange={(e) =>
                      setPastSaleSearch(e.target.value)
                    }
                    placeholder="Search products..."
                    className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredPastSaleProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      disabled={product.stock <= 0}
                      onClick={() =>
                        addPastSaleItem(product)
                      }
                      className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#246BFD]/40 hover:bg-[#246BFD]/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <p className="font-semibold text-[#071827]">
                        {product.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {product.category}
                      </p>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-semibold text-[#246BFD]">
                          KES {Number(product.price).toLocaleString()}
                        </span>

                        <span className="text-slate-500">
                          Stock: {product.stock}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <aside className="flex flex-col">
                <div className="border-b border-slate-200 p-5">
                  <h3 className="font-semibold text-[#071827]">
                    Past Sale Items
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {pastSaleCart.reduce(
                      (sum, item) => sum + item.quantity,
                      0
                    )}{" "}
                    item(s)
                  </p>
                </div>

                <div className="max-h-72 flex-1 space-y-3 overflow-y-auto p-5">
                  {pastSaleCart.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      Select products to add them to the past sale.
                    </div>
                  ) : (
                    pastSaleCart.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-[#071827]">
                              {item.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              KES {Number(item.price).toLocaleString()} each
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removePastSaleItem(item.id)
                            }
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                changePastSaleQuantity(item.id, -1)
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                            >
                              <Minus size={15} />
                            </button>

                            <span className="min-w-8 text-center font-semibold">
                              {item.quantity}
                            </span>

                            <button
                              type="button"
                              disabled={item.quantity >= item.stock}
                              onClick={() =>
                                changePastSaleQuantity(item.id, 1)
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus size={15} />
                            </button>
                          </div>

                          <p className="font-semibold text-[#071827]">
                            KES {(item.price * item.quantity).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-4 border-t border-slate-200 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">
                      Total
                    </span>
                    <span className="text-2xl font-bold text-[#071827]">
                      KES {pastSaleTotal.toLocaleString()}
                    </span>
                  </div>

                  {pastSaleError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {pastSaleError}
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Customer
                    </label>

                    <select
                      value={pastCustomerId}
                      onChange={(e) => setPastCustomerId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                    >
                      <option value="">Walk-in Customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                          {customer.phone ? ` - ${customer.phone}` : ""}
                        </option>
                      ))}
                    </select>

                    <p className="mt-1.5 text-xs text-slate-500">
                      Optional. Leave as Walk-in Customer for an unregistered customer.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Payment Method
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      {(["Cash", "M-Pesa", "Split"] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => {
                            setPastPaymentMethod(method);
                            setPastSaleError("");
                          }}
                          className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                            pastPaymentMethod === method
                              ? "border-[#246BFD] bg-[#246BFD]/[0.07] text-[#246BFD]"
                              : "border-slate-300 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  {pastPaymentMethod !== "Split" ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Amount Paid
                      </label>
                      <input
                        type="number"
                        required
                        min={pastSaleTotal}
                        step="0.01"
                        value={pastAmountPaid}
                        onChange={(e) => setPastAmountPaid(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Cash Amount
                          </label>
                          <input
                            type="number"
                            required
                            min="0"
                            step="0.01"
                            value={pastCashAmount}
                            onChange={(e) => setPastCashAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            M-Pesa Amount
                          </label>
                          <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            value={pastMpesaAmount}
                            onChange={(e) => setPastMpesaAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between rounded-xl bg-slate-50 p-4 text-sm">
                        <span className="text-slate-500">Total entered</span>
                        <span className="font-semibold text-slate-800">
                          KES {pastSplitPaid.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {(pastPaymentMethod === "Cash" ||
                    pastPaymentMethod === "Split") && (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Change</p>
                      <p className="mt-1 text-xl font-bold text-emerald-600">
                        KES {pastSaleChange.toLocaleString()}
                      </p>
                    </div>
                  )}

                  {(pastPaymentMethod === "M-Pesa" ||
                    pastPaymentMethod === "Split") && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        M-Pesa Transaction Code
                      </label>
                      <input
                        type="text"
                        required
                        value={pastMpesaCode}
                        onChange={(e) =>
                          setPastMpesaCode(e.target.value.toUpperCase())
                        }
                        placeholder="e.g. QGH12ABC34"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 uppercase outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      disabled={processingPastSale}
                      onClick={closePastSaleModal}
                      className="rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={
                        processingPastSale ||
                        pastSaleCart.length === 0
                      }
                      className="rounded-xl bg-[#246BFD] px-4 py-3 font-semibold text-white transition hover:bg-[#1D5EEA] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processingPastSale
                        ? "Recording..."
                        : "Record Past Sale"}
                    </button>
                  </div>
                </div>
              </aside>
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
                  Customer
                </label>

                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Walk-in Customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone ? ` - ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>

                <p className="mt-1.5 text-xs text-slate-500">
                  Optional. Select a registered customer only when needed.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Payment Method
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {(["Cash", "M-Pesa", "Split"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(method);
                        setPaymentError("");
                      }}
                      className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                        paymentMethod === method
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod !== "Split" ? (
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
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Cash Amount
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        M-Pesa Amount
                      </label>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={mpesaAmount}
                        onChange={(e) => setMpesaAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-500">Total entered</span>
                    <span className="font-semibold text-slate-800">
                      KES {splitPaid.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {(paymentMethod === "Cash" ||
                paymentMethod === "Split") && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Change</p>
                  <p className="mt-1 text-xl font-bold text-green-600">
                    KES {change.toLocaleString()}
                  </p>
                </div>
              )}

              {(paymentMethod === "M-Pesa" ||
                paymentMethod === "Split") && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    M-Pesa Transaction Code
                  </label>
                  <input
                    type="text"
                    required
                    value={mpesaCode}
                    onChange={(e) =>
                      setMpesaCode(e.target.value.toUpperCase())
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Point of Sale
          </h1>

          <p className="mt-1 text-slate-500">
            Process sales and review completed transactions.
          </p>
        </div>

        {canRecordPastSale && (
          <button
            type="button"
            onClick={openPastSaleModal}
            className="rounded-xl border border-[#246BFD]/20 bg-[#246BFD]/[0.07] px-4 py-2.5 text-sm font-semibold text-[#246BFD] transition hover:bg-[#246BFD]/[0.12]"
          >
            Record Past Sale
          </button>
        )}

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

        {canManageReturns && (
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
        )}

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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  Gross Sales Today
                </p>

                <p className="mt-2 text-2xl font-bold text-slate-800">
                  KES{" "}
                  {todaySummary.grossSales.toLocaleString()}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Sales before refunds
                </p>

              </div>

              <div className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  Refunds Today
                </p>

                <p className="mt-2 text-2xl font-bold text-orange-600">
                  - KES{" "}
                  {todaySummary.refundsToday.toLocaleString()}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Refunds processed today
                </p>

              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                <p className="text-sm font-medium text-slate-500">
                  Net Sales Today
                </p>

                <p className="mt-2 text-2xl font-bold text-slate-800">
                  KES{" "}
                  {todaySummary.netSales.toLocaleString()}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Gross sales minus today's refunds
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
                  Current net cash sales
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
                  Current net M-Pesa sales
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
                    Customer
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Original
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Refunded
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Net Sale
                  </th>

                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Status
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

                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{sale.receipt_number}</span>

                          {Boolean(sale.is_backdated) && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              Backdated
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium text-slate-700">
                          {sale.customer_name || "Walk-in Customer"}
                        </div>
                        {sale.customer_phone && (
                          <div className="mt-0.5 text-xs text-slate-400">
                            {sale.customer_phone}
                          </div>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">
                        KES {Number(sale.total).toLocaleString()}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">

                        {sale.refunded_amount > 0 ? (

                          <span className="font-semibold text-orange-600">
                            - KES{" "}
                            {Number(
                              sale.refunded_amount
                            ).toLocaleString()}
                          </span>

                        ) : (

                          <span className="text-slate-400">
                            —
                          </span>

                        )}

                      </td>

                      <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-800">
                        KES{" "}
                        {Number(
                          sale.net_total
                        ).toLocaleString()}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            sale.refund_status === "Fully Refunded"
                              ? "bg-red-50 text-red-700"
                              : sale.refund_status === "Partially Refunded"
                              ? "bg-orange-50 text-orange-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {sale.refund_status}
                        </span>

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

                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {sale.sold_by_name || "Unknown"}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        <div>
                          {sale.sale_date
                            ? new Date(
                                `${sale.sale_date}T00:00:00`
                              ).toLocaleDateString()
                            : new Date(
                                sale.created_at
                              ).toLocaleString()}
                        </div>

                        {Boolean(sale.is_backdated) && (
                          <div className="mt-1 text-xs text-slate-400">
                            Recorded{" "}
                            {new Date(
                              sale.created_at
                            ).toLocaleString()}
                          </div>
                        )}
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
                      colSpan={9}
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
      {canManageReturns && activeTab === "returns" && (
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