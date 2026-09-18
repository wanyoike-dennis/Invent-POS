import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import { formatDateTime } from "../utils/dateTime";

type Product = {
  id: number;
  name: string;
  category: string;
  cost_price: number;
  price: number;
  stock: number;
  organization_stock_legacy?: number;
};

type Branch = {
  id: number;
  name: string;
  code: string | null;
};

type TransferItem = {
  productId: string;
  quantity: string;
};

type StockTransferHistory = {
  id: number;
  transfer_number: string;
  from_branch_id: number;
  from_branch_name: string;
  from_branch_code: string | null;
  to_branch_id: number;
  to_branch_name: string;
  to_branch_code: string | null;
  status: string;
  notes: string | null;
  transferred_by: number | null;
  transferred_by_name: string | null;
  transferred_at: string;
  item_count: number;
  total_units: number;
};

type StockTransferDetailItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  from_stock_before: number;
  from_stock_after: number;
  to_stock_before: number;
  to_stock_after: number;
};

type StockTransferDetail = StockTransferHistory & {
  items: StockTransferDetailItem[];
};

type Supplier = {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

type StockMovement = {
  id: number;
  product_id: number;
  product_name: string;
  type: "in" | "out";
  quantity: number;
  reason: string | null;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  branch_code: string | null;
};

type PurchaseHistory = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  total_cost: number;
  unit_cost: number;
  previous_stock: number;
  previous_cost_price: number;
  new_stock: number;
  new_cost_price: number;
  supplier_id: number | null;
  supplier_name: string | null;
  reference: string | null;
  notes: string | null;
  purchased_by: number | null;
  purchased_by_name: string | null;
  purchase_date: string;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  branch_code: string | null;
};

const todayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 10);
};

const formatMoney = (value: number) =>
  `KES ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Branch inventory context
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // Inter-branch stock transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferToBranchId, setTransferToBranchId] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([
    { productId: "", quantity: "" },
  ]);
  const [transferring, setTransferring] = useState(false);
  const [transferHistory, setTransferHistory] = useState<StockTransferHistory[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [transferDetail, setTransferDetail] = useState<StockTransferDetail | null>(null);
  const [loadingTransferDetail, setLoadingTransferDetail] = useState(false);

  // Manual stock adjustment
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Wholesale purchase / restock
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayLocal());
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  const fetchProducts = async (branchId?: string) => {
    try {
      setLoadingInventory(true);

      const query = branchId
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";

      const response = await apiFetch(
        `/api/products/branch-inventory${query}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to fetch branch inventory"
        );
      }

      const data = await response.json();
      setProducts(Array.isArray(data.products) ? data.products : []);
      setSelectedBranch(data.branch || null);

      if (data.branch?.id) {
        setSelectedBranchId(String(data.branch.id));
      }
    } catch (error) {
      console.error("Error loading inventory:", error);
      setProducts([]);
    } finally {
      setLoadingInventory(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await apiFetch("/api/branches");

      if (!response.ok) {
        throw new Error("Failed to fetch branches");
      }

      const data = await response.json();
      const activeBranches = Array.isArray(data.branches)
        ? data.branches.filter((branch: any) => Number(branch.is_active) === 1)
        : [];

      setBranches(activeBranches);
    } catch (error) {
      console.error("Error loading branches:", error);
      setBranches([]);
    }
  };

  const fetchStockMovements = async (branchId?: string) => {
    try {
      const query = branchId
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";

      const response = await apiFetch(
        `/api/products/stock/history${query}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch stock history");
      }

      const data = await response.json();
      setStockMovements(
        Array.isArray(data.movements) ? data.movements : []
      );
    } catch (error) {
      console.error("Error loading stock history:", error);
      setStockMovements([]);
    }
  };

  const fetchPurchaseHistory = async (branchId?: string) => {
    try {
      const query = branchId
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";

      const response = await apiFetch(
        `/api/products/purchases/history${query}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch purchase history");
      }

      const data = await response.json();
      setPurchaseHistory(
        Array.isArray(data.purchases) ? data.purchases : []
      );
    } catch (error) {
      console.error("Error loading purchase history:", error);
      setPurchaseHistory([]);
    }
  };

  const fetchTransferHistory = async (branchId?: string) => {
    try {
      setLoadingTransfers(true);

      const query = branchId
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";

      const response = await apiFetch(
        `/api/stock-transfers/history${query}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch transfer history");
      }

      const data = await response.json();

      setTransferHistory(
        Array.isArray(data.transfers) ? data.transfers : []
      );
    } catch (error) {
      console.error("Error loading transfer history:", error);
      setTransferHistory([]);
    } finally {
      setLoadingTransfers(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await apiFetch("/api/suppliers");

      if (!response.ok) {
        throw new Error("Failed to fetch suppliers");
      }

      const data = await response.json();
      setSuppliers(data);
    } catch (error) {
      console.error("Error loading suppliers:", error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchBranches();
    fetchStockMovements();
    fetchPurchaseHistory();
    fetchTransferHistory();
    fetchSuppliers();
  }, []);

  const handleBranchChange = async (branchId: string) => {
    setSelectedBranchId(branchId);
    closeAdjustmentModal();
    closePurchaseModal();
    closeTransferModal();

    await Promise.all([
      fetchProducts(branchId),
      fetchStockMovements(branchId),
      fetchPurchaseHistory(branchId),
      fetchTransferHistory(branchId),
    ]);
  };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return "Out of Stock";
    if (stock <= 5) return "Low Stock";
    return "In Stock";
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStock = products.reduce(
    (total, product) => total + product.stock,
    0
  );

  const lowStockCount = products.filter(
    (product) => product.stock > 0 && product.stock <= 5
  ).length;

  const outOfStockCount = products.filter(
    (product) => product.stock === 0
  ).length;

  const purchaseUnitCost = useMemo(() => {
    const qty = Number(purchaseQuantity);
    const cost = Number(totalCost);

    if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) {
      return 0;
    }

    return Math.round(((cost / qty) + Number.EPSILON) * 100) / 100;
  }, [purchaseQuantity, totalCost]);

  const projectedAverageCost = useMemo(() => {
    if (!purchaseProduct || purchaseUnitCost <= 0) return 0;

    const qty = Number(purchaseQuantity);
    const cost = Number(totalCost);

    if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) {
      return 0;
    }

    const organizationStock = Number(
      purchaseProduct.organization_stock_legacy ??
        purchaseProduct.stock ??
        0
    );

    const oldValue =
      organizationStock *
      Number(purchaseProduct.cost_price || 0);

    const newStock = organizationStock + qty;

    if (newStock <= 0) return purchaseUnitCost;

    return (
      Math.round(
        (((oldValue + cost) / newStock) + Number.EPSILON) * 100
      ) / 100
    );
  }, [purchaseProduct, purchaseQuantity, totalCost, purchaseUnitCost]);

  const closeAdjustmentModal = () => {
    setSelectedProduct(null);
    setQuantity("");
    setReason("");
    setAdjustmentType("in");
  };

  const closePurchaseModal = () => {
    setPurchaseProduct(null);
    setPurchaseQuantity("");
    setTotalCost("");
    setPurchaseDate(todayLocal());
    setSupplierId("");
    setReference("");
    setPurchaseNotes("");
  };

  const openTransferDetail = async (transferId: number) => {
    try {
      setLoadingTransferDetail(true);

      const response = await apiFetch(`/api/stock-transfers/${transferId}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.message || "Failed to load transfer details");
        return;
      }

      const rawTransfer = data.transfer || data;
      const rawItems = Array.isArray(data.items)
        ? data.items
        : Array.isArray(rawTransfer.items)
        ? rawTransfer.items
        : [];

      setTransferDetail({
        ...rawTransfer,
        items: rawItems,
      });
    } catch (error) {
      console.error("Error loading transfer details:", error);
      alert("Failed to load transfer details");
    } finally {
      setLoadingTransferDetail(false);
    }
  };

  const closeTransferModal = () => {
    setTransferOpen(false);
    setTransferToBranchId("");
    setTransferNotes("");
    setTransferItems([{ productId: "", quantity: "" }]);
  };

  const addTransferItem = () => {
    setTransferItems((current) => [
      ...current,
      { productId: "", quantity: "" },
    ]);
  };

  const updateTransferItem = (
    index: number,
    field: keyof TransferItem,
    value: string
  ) => {
    setTransferItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const removeTransferItem = (index: number) => {
    setTransferItems((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [{ productId: "", quantity: "" }];
    });
  };

  const handleTransfer = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (transferring) return;

    const fromBranchId = Number(selectedBranchId);
    const toBranchId = Number(transferToBranchId);

    if (!Number.isInteger(fromBranchId) || fromBranchId <= 0) {
      alert("Select a source branch first");
      return;
    }

    if (!Number.isInteger(toBranchId) || toBranchId <= 0) {
      alert("Select a destination branch");
      return;
    }

    if (fromBranchId === toBranchId) {
      alert("Source and destination branches must be different");
      return;
    }

    const normalizedItems = transferItems.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
    }));

    if (
      normalizedItems.some(
        (item) =>
          !Number.isInteger(item.productId) ||
          item.productId <= 0 ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0
      )
    ) {
      alert("Select a product and enter a positive whole-number quantity for every transfer item");
      return;
    }

    const productIds = normalizedItems.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      alert("The same product cannot appear more than once in one transfer");
      return;
    }

    for (const item of normalizedItems) {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product) {
        alert("One of the selected products is unavailable");
        return;
      }

      if (item.quantity > product.stock) {
        alert(
          `Insufficient ${product.name} stock. Available at ${
            selectedBranch?.name || "this branch"
          }: ${product.stock}`
        );
        return;
      }
    }

    try {
      setTransferring(true);

      const response = await apiFetch("/api/stock-transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromBranchId,
          toBranchId,
          notes: transferNotes,
          items: normalizedItems,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.message || "Failed to transfer stock");
        return;
      }

      await Promise.all([
        fetchProducts(selectedBranchId),
        fetchStockMovements(selectedBranchId),
        fetchTransferHistory(selectedBranchId),
      ]);

      const transferNumber =
        data.transfer?.transfer_number || "Transfer";

      closeTransferModal();
      alert(`${transferNumber} completed successfully`);
    } catch (error) {
      console.error("Error transferring stock:", error);
      alert("Failed to transfer stock");
    } finally {
      setTransferring(false);
    }
  };

  const handleStockAdjustment = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!selectedProduct || adjusting) return;

    try {
      setAdjusting(true);

      const response = await apiFetch(
        `/api/products/${selectedProduct.id}/stock`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: adjustmentType,
            quantity: Number(quantity),
            reason,
            branchId: selectedBranchId
              ? Number(selectedBranchId)
              : undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.message || "Failed to adjust stock");
        return;
      }

      await Promise.all([
        fetchProducts(selectedBranchId),
        fetchStockMovements(selectedBranchId),
      ]);
      closeAdjustmentModal();
    } catch (error) {
      console.error("Error adjusting stock:", error);
      alert("Failed to adjust stock");
    } finally {
      setAdjusting(false);
    }
  };

  const handlePurchase = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!purchaseProduct || purchasing) return;

    const qty = Number(purchaseQuantity);
    const cost = Number(totalCost);

    if (!Number.isInteger(qty) || qty <= 0) {
      alert("Sellable units received must be a positive whole number");
      return;
    }

    if (!Number.isFinite(cost) || cost <= 0) {
      alert("Total wholesale cost must be greater than 0");
      return;
    }

    try {
      setPurchasing(true);

      const response = await apiFetch(
        `/api/products/${purchaseProduct.id}/purchase`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quantity: qty,
            total_cost: cost,
            purchase_date: purchaseDate,
            supplier_id: supplierId ? Number(supplierId) : null,
            reference,
            notes: purchaseNotes,
            branchId: selectedBranchId
              ? Number(selectedBranchId)
              : undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Failed to record stock purchase");
        return;
      }

      await Promise.all([
        fetchProducts(selectedBranchId),
        fetchStockMovements(selectedBranchId),
        fetchPurchaseHistory(selectedBranchId),
      ]);

      closePurchaseModal();
      alert("Wholesale purchase recorded successfully");
    } catch (error) {
      console.error("Error recording stock purchase:", error);
      alert("Failed to record stock purchase");
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Manual stock adjustment modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Adjust Stock
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedProduct.name}
                  {selectedBranch
                    ? ` • ${selectedBranch.name}${selectedBranch.code ? ` (${selectedBranch.code})` : ""}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdjustmentModal}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleStockAdjustment} className="space-y-4 p-5">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-500">Current Stock</p>
                <p className="text-xl font-bold text-slate-800">
                  {selectedProduct.stock}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Adjustment Type
                </label>
                <select
                  value={adjustmentType}
                  onChange={(e) =>
                    setAdjustmentType(e.target.value as "in" | "out")
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="in">Stock In</option>
                  <option value="out">Stock Out</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantity
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Reason
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Damaged stock, correction, free sample"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Use <strong>Purchase / Restock</strong> for stock bought from a
                supplier. Manual adjustment does not recalculate product cost.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdjustmentModal}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={adjusting}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adjusting ? "Updating..." : "Update Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wholesale purchase / restock modal */}
      {purchaseProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Purchase / Restock
                </h2>
                <p className="text-sm text-slate-500">
                  {purchaseProduct.name}
                  {selectedBranch
                    ? ` • ${selectedBranch.name}${selectedBranch.code ? ` (${selectedBranch.code})` : ""}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={closePurchaseModal}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePurchase} className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Current Stock</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {purchaseProduct.stock}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Current Avg. Cost</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatMoney(purchaseProduct.cost_price)}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Selling Price</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatMoney(purchaseProduct.price)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Sellable Units Received
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={purchaseQuantity}
                    onChange={(e) => setPurchaseQuantity(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Enter the number of individual units you will sell, not the number
                    of cartons, boxes, packs or tins purchased.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Total Wholesale Cost (KES)
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    placeholder="e.g. 12000"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Supplier
                  </label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No supplier / Not specified</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      No suppliers are available. Add one from the Suppliers page.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Reference / Invoice
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. INV-001"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  placeholder="Optional purchase notes"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
                    Purchase Unit Cost
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatMoney(purchaseUnitCost)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
                    New Stock
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {purchaseProduct.stock +
                      (Number.isFinite(Number(purchaseQuantity))
                        ? Number(purchaseQuantity || 0)
                        : 0)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
                    New Avg. Cost
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatMoney(projectedAverageCost)}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                The figures above are a preview. The backend recalculates and
                validates the final weighted-average cost when the purchase is
                saved.
              </p>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closePurchaseModal}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={purchasing}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {purchasing ? "Recording..." : "Record Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock transfer detail modal */}
      {(transferDetail || loadingTransferDetail) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-6">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  Transfer Details
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-800">
                  {transferDetail?.transfer_number || "Loading transfer..."}
                </h2>
                {transferDetail && (
                  <p className="mt-1 text-sm text-slate-500">
                    {transferDetail.from_branch_name}
                    {transferDetail.from_branch_code
                      ? ` (${transferDetail.from_branch_code})`
                      : ""}{" "}
                    → {transferDetail.to_branch_name}
                    {transferDetail.to_branch_code
                      ? ` (${transferDetail.to_branch_code})`
                      : ""}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTransferDetail(null)}
                disabled={loadingTransferDetail}
                className="text-2xl text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {loadingTransferDetail ? (
              <div className="p-10 text-center text-slate-500">
                Loading transfer details...
              </div>
            ) : transferDetail ? (
              <div className="space-y-5 p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Status
                    </p>
                    <p className="mt-1 font-semibold capitalize text-emerald-700">
                      {transferDetail.status || "completed"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Products
                    </p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {transferDetail.items.length}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Total Units
                    </p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {transferDetail.items.reduce(
                        (total, item) => total + Number(item.quantity || 0),
                        0
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Transferred By
                    </p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {transferDetail.transferred_by_name || "—"}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <h3 className="font-semibold text-slate-800">
                      Transferred Products
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="border-b border-slate-200 bg-white">
                        <tr>
                          <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                            Product
                          </th>
                          <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                            Source Stock
                          </th>
                          <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                            Destination Stock
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200">
                        {transferDetail.items.length > 0 ? (
                          transferDetail.items.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="px-4 py-4">
                                <p className="font-medium text-slate-800">
                                  {item.product_name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  Product #{item.product_id}
                                </p>
                              </td>

                              <td className="px-4 py-4 font-semibold text-slate-800">
                                {item.quantity}
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-600">
                                {item.from_stock_before} →{" "}
                                <strong>{item.from_stock_after}</strong>
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-600">
                                {item.to_stock_before} →{" "}
                                <strong>{item.to_stock_after}</strong>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-6 py-8 text-center text-slate-500"
                            >
                              No transfer items were returned.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Notes
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {transferDetail.notes || "No notes provided."}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Transfer Date
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {transferDetail.transferred_at
                        ? formatDateTime(
                            transferDetail.transferred_at
                          )
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setTransferDetail(null)}
                    className="rounded-xl bg-[#071827] px-5 py-2.5 font-medium text-white hover:bg-[#0B1F33]"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Inter-branch stock transfer modal */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  Inter-Branch Transfer
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-800">
                  Transfer Stock
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Move existing inventory between branches without changing organization stock.
                </p>
              </div>

              <button
                type="button"
                onClick={closeTransferModal}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    From Branch
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="font-semibold text-slate-800">
                      {selectedBranch?.name || "Selected branch"}
                    </p>
                    {selectedBranch?.code && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {selectedBranch.code}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    To Branch
                  </label>
                  <select
                    required
                    value={transferToBranchId}
                    onChange={(e) => setTransferToBranchId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select destination branch</option>
                    {branches
                      .filter(
                        (branch) => String(branch.id) !== selectedBranchId
                      )
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                          {branch.code ? ` (${branch.code})` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      Products to Transfer
                    </h3>
                    <p className="text-sm text-slate-500">
                      Available quantities are from the selected source branch.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addTransferItem}
                    className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    + Add Product
                  </button>
                </div>

                <div className="space-y-3">
                  {transferItems.map((item, index) => {
                    const itemProduct = products.find(
                      (product) => String(product.id) === item.productId
                    );

                    return (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_160px_auto]"
                      >
                        <div>
                          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                            Product
                          </label>
                          <select
                            required
                            value={item.productId}
                            onChange={(e) =>
                              updateTransferItem(
                                index,
                                "productId",
                                e.target.value
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select product</option>
                            {products.map((product) => (
                              <option
                                key={product.id}
                                value={product.id}
                                disabled={
                                  product.stock <= 0 ||
                                  transferItems.some(
                                    (otherItem, otherIndex) =>
                                      otherIndex !== index &&
                                      otherItem.productId ===
                                        String(product.id)
                                  )
                                }
                              >
                                {product.name} — {product.stock} available
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                            Quantity
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="1"
                            max={itemProduct?.stock || undefined}
                            value={item.quantity}
                            onChange={(e) =>
                              updateTransferItem(
                                index,
                                "quantity",
                                e.target.value
                              )
                            }
                            placeholder="Qty"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {itemProduct && (
                            <p className="mt-1 text-xs text-slate-500">
                              Available: {itemProduct.stock}
                            </p>
                          )}
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeTransferItem(index)}
                            className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional transfer notes"
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-slate-700">
                This operation moves stock from the source branch to the destination branch.
                The organization's total stock remains unchanged.
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeTransferModal}
                  disabled={transferring}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    transferring ||
                    branches.length < 2 ||
                    products.every((product) => product.stock <= 0)
                  }
                  className="rounded-xl bg-[#246BFD] px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {transferring ? "Transferring..." : "Complete Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
        <p className="mt-1 text-slate-500">
          Monitor stock, record wholesale purchases and manage adjustments.
        </p>
      </div>

      {/* Branch selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Branch Inventory
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-800">
              {selectedBranch
                ? `${selectedBranch.name}${selectedBranch.code ? ` (${selectedBranch.code})` : ""}`
                : "Select branch"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Stock quantities, adjustments and purchases below apply to this branch.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
            <div className="w-full sm:w-80">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Viewing Branch
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                disabled={branches.length <= 1 || loadingInventory}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {selectedBranchId === "" && (
                  <option value="">Assigned branch</option>
                )}
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                    {branch.code ? ` (${branch.code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              disabled={
                branches.length < 2 ||
                !selectedBranchId ||
                loadingInventory
              }
              className="rounded-xl bg-[#246BFD] px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Transfer Stock
            </button>
          </div>
        </div>
      </div>

      {/* Inventory summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Products</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {products.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Units</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {totalStock}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Low Stock</p>
          <h2 className="mt-2 text-2xl font-bold text-orange-600">
            {lowStockCount}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Out of Stock</p>
          <h2 className="mt-2 text-2xl font-bold text-red-600">
            {outOfStockCount}
          </h2>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="text"
          placeholder="Search inventory..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 sm:w-80"
        />
      </div>

      {/* Inventory table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Product
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Category
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Avg. Cost
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Current Stock
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Status
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loadingInventory ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    Loading branch inventory...
                  </td>
                </tr>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-800">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        ID #{product.id}
                      </p>
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      {product.category}
                    </td>

                    <td className="px-6 py-4 font-medium text-slate-700">
                      {formatMoney(product.cost_price)}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={
                          product.stock === 0
                            ? "font-semibold text-red-600"
                            : product.stock <= 5
                            ? "font-semibold text-orange-600"
                            : "font-semibold text-slate-800"
                        }
                      >
                        {product.stock}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          product.stock === 0
                            ? "bg-red-100 text-red-700"
                            : product.stock <= 5
                            ? "bg-orange-100 text-orange-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {getStockStatus(product.stock)}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPurchaseProduct(product);
                            setPurchaseDate(todayLocal());
                          }}
                          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          Purchase / Restock
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedProduct(product)}
                          className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
                        >
                          Adjust Stock
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No inventory products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock transfer history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                Branch Audit Trail
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-800">
                Stock Transfer History
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Transfers sent from or received by the selected branch.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {transferHistory.length} transfer{transferHistory.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Transfer
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  From → To
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Products
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Units
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Status
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Transferred By
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Notes
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Date
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loadingTransfers ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    Loading transfer history...
                  </td>
                </tr>
              ) : transferHistory.length > 0 ? (
                transferHistory.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => openTransferDetail(transfer.id)}
                        className="font-semibold text-[#246BFD] hover:text-blue-700 hover:underline"
                      >
                        {transfer.transfer_number}
                      </button>
                      <p className="mt-0.5 text-xs text-slate-400">
                        ID #{transfer.id}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-sm">
                      <div className="flex min-w-52 items-center gap-2">
                        <div>
                          <p className="font-medium text-slate-700">
                            {transfer.from_branch_name}
                          </p>
                          {transfer.from_branch_code && (
                            <p className="text-xs text-slate-400">
                              {transfer.from_branch_code}
                            </p>
                          )}
                        </div>

                        <span className="font-semibold text-blue-500">→</span>

                        <div>
                          <p className="font-medium text-slate-700">
                            {transfer.to_branch_name}
                          </p>
                          {transfer.to_branch_code && (
                            <p className="text-xs text-slate-400">
                              {transfer.to_branch_code}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 font-medium text-slate-700">
                      {Number(transfer.item_count || 0)}
                    </td>

                    <td className="px-4 py-4 font-semibold text-slate-800">
                      {Number(transfer.total_units || 0)}
                    </td>

                    <td className="px-4 py-4">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium capitalize text-emerald-700">
                        {transfer.status || "completed"}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {transfer.transferred_by_name || "—"}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      <p
                        className="max-w-52 truncate"
                        title={transfer.notes || ""}
                      >
                        {transfer.notes || "—"}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-500">
                      {transfer.transferred_at
                        ? formatDateTime(transfer.transferred_at)
                        : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No stock transfers recorded for this branch yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">
            Purchase / Restock History
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Wholesale purchases for the selected branch with weighted-average inventory costs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Product
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Branch
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Qty
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Total Cost
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Unit Cost
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Org Stock
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Avg. Cost
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Supplier
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Reference
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Recorded By
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Date
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {purchaseHistory.length > 0 ? (
                purchaseHistory.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-800">
                        {purchase.product_name}
                      </p>
                      {purchase.notes && (
                        <p
                          className="mt-1 max-w-48 truncate text-xs text-slate-400"
                          title={purchase.notes}
                        >
                          {purchase.notes}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">
                        {purchase.branch_name || "Unassigned"}
                      </p>
                      {purchase.branch_code && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {purchase.branch_code}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 font-medium text-slate-700">
                      +{purchase.quantity}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {formatMoney(purchase.total_cost)}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {formatMoney(purchase.unit_cost)}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {purchase.previous_stock} → {purchase.new_stock}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {formatMoney(purchase.previous_cost_price)}
                      <span className="mx-1">→</span>
                      <strong>{formatMoney(purchase.new_cost_price)}</strong>
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {purchase.supplier_name || "—"}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {purchase.reference || "—"}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {purchase.purchased_by_name || "—"}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-500">
                      {purchase.purchase_date}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={11}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No wholesale purchases recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock movement history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">
            Stock Movement History
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Recent stock additions and removals for the selected branch.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Product
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Branch
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Type
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Quantity
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Reason
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Date
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {stockMovements.length > 0 ? (
                stockMovements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {movement.product_name}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">
                        {movement.branch_name || "Unassigned"}
                      </p>
                      {movement.branch_code && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {movement.branch_code}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          movement.type === "in"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {movement.type === "in" ? "Stock In" : "Stock Out"}
                      </span>
                    </td>

                    <td className="px-6 py-4 font-medium text-slate-700">
                      {movement.type === "in" ? "+" : "-"}
                      {movement.quantity}
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      {movement.reason || "No reason provided"}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDateTime(movement.created_at)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No stock movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Inventory;
