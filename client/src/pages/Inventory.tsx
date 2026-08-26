import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
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

function Inventory() {
const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);    
const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
const [adjustmentType, setAdjustmentType] = useState<"in" | "out">("in");
const [quantity, setQuantity] = useState("");
const [reason, setReason] = useState("");  
const [products, setProducts] = useState<Product[]>([]);
const [searchTerm, setSearchTerm] = useState("");


const fetchStockMovements = async () => {
  try {
    const response = await apiFetch(
      "/api/products/stock/history"
    );

    if (!response.ok) {
      throw new Error("Failed to fetch stock history");
    }

    const data = await response.json();

    setStockMovements(data);
  } catch (error) {
    console.error("Error loading stock history:", error);
  }
};



  const fetchProducts = async () => {
    try {
      const response = await apiFetch(
        "/api/products"
      );

      if (!response.ok) {
        throw new Error("Failed to fetch inventory");
      }

      const data = await response.json();

      setProducts(data);
    } catch (error) {
      console.error("Error loading inventory:", error);
    }
  };

  useEffect(() => {
    fetchProducts();
     fetchStockMovements();
  }, []);

  const getStockStatus = (stock: number) => {
    if (stock === 0) {
      return "Out of Stock";
    }

    if (stock <= 5) {
      return "Low Stock";
    }

    return "In Stock";
  };

  const filteredProducts = products.filter((product) =>
    product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
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

  const handleStockAdjustment = async (
  e: React.FormEvent<HTMLFormElement>
) => {
  e.preventDefault();

  if (!selectedProduct) {
    return;
  }

  try {
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

    await fetchProducts();
    await fetchStockMovements();

    setSelectedProduct(null);
    setQuantity("");
    setReason("");
    setAdjustmentType("in");
  } catch (error) {
    console.error("Error adjusting stock:", error);
  }
};



  return (
    <div className="space-y-6">

        {/*modal */}
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
          onClick={() => {
            setSelectedProduct(null);
            setQuantity("");
            setReason("");
          }}
          className="text-2xl text-slate-400 hover:text-slate-700"
        >
          ×
        </button>

      </div>

      <form
        onSubmit={handleStockAdjustment}
        className="space-y-4 p-5"
      >

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-sm text-slate-500">
            Current Stock
          </p>

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
              setAdjustmentType(
                e.target.value as "in" | "out"
              )
            }
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="in">
              Stock In
            </option>

            <option value="out">
              Stock Out
            </option>
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
            placeholder="e.g. New stock received"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">

          <button
            type="button"
            onClick={() => {
              setSelectedProduct(null);
              setQuantity("");
              setReason("");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
          >
            Update Stock
          </button>

        </div>

      </form>

    </div>

  </div>
)}

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Inventory
        </h1>

        <p className="mt-1 text-slate-500">
          Monitor stock levels and product availability.
        </p>
      </div>

      {/* Inventory summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Products
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {products.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Total Units
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {totalStock}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Low Stock
          </p>

          <h2 className="mt-2 text-2xl font-bold text-orange-600">
            {lowStockCount}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Out of Stock
          </p>

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
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50"
                  >

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

                      <button
  type="button"
  onClick={() => setSelectedProduct(product)}
  className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
>
  Adjust Stock
</button>

                    </td>

                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
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

      {/*stock movement */}
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
            <tr
              key={movement.id}
              className="hover:bg-slate-50"
            >

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
                  {movement.type === "in"
                    ? "Stock In"
                    : "Stock Out"}
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
                {new Date(
                  movement.created_at
                ).toLocaleString()}
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