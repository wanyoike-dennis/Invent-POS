import { useEffect, useState } from "react";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
};

function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchProducts = async () => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/products"
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

  return (
    <div className="space-y-6">

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

    </div>
  );
}

export default Inventory;