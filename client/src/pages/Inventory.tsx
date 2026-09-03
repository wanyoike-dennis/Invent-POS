import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";

type Product = {
  id: number;
  name: string;
  category: string;
  cost_price: number;
  price: number;
  stock: number;
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

  const fetchProducts = async () => {
    try {
      const response = await apiFetch("/api/products");

      if (!response.ok) {
        throw new Error("Failed to fetch inventory");
      }

      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error("Error loading inventory:", error);
    }
  };

  const fetchStockMovements = async () => {
    try {
      const response = await apiFetch("/api/products/stock/history");

      if (!response.ok) {
        throw new Error("Failed to fetch stock history");
      }

      const data = await response.json();
      setStockMovements(data);
    } catch (error) {
      console.error("Error loading stock history:", error);
    }
  };

  const fetchPurchaseHistory = async () => {
    try {
      const response = await apiFetch("/api/products/purchases/history");

      if (!response.ok) {
        throw new Error("Failed to fetch purchase history");
      }

      const data = await response.json();
      setPurchaseHistory(data);
    } catch (error) {
      console.error("Error loading purchase history:", error);
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
    fetchStockMovements();
    fetchPurchaseHistory();
    fetchSuppliers();
  }, []);

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

    const oldValue =
      Number(purchaseProduct.stock || 0) *
      Number(purchaseProduct.cost_price || 0);

    const newStock = Number(purchaseProduct.stock || 0) + qty;

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
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.message || "Failed to adjust stock");
        return;
      }

      await Promise.all([fetchProducts(), fetchStockMovements()]);
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
      alert("Quantity received must be a positive whole number");
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
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Failed to record stock purchase");
        return;
      }

      await Promise.all([
        fetchProducts(),
        fetchStockMovements(),
        fetchPurchaseHistory(),
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
                    Quantity Received
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

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
        <p className="mt-1 text-slate-500">
          Monitor stock, record wholesale purchases and manage adjustments.
        </p>
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
              {filteredProducts.length > 0 ? (
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

      {/* Purchase history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">
            Purchase / Restock History
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Wholesale purchases and weighted-average inventory costs.
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
                  Qty
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Total Cost
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Unit Cost
                </th>
                <th className="px-4 py-4 text-sm font-semibold text-slate-600">
                  Stock
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
                    colSpan={10}
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
            Recent stock additions and removals.
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
                      {new Date(movement.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
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
