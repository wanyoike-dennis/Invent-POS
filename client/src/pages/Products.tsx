import { useState } from "react";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: "Active" | "Low Stock" | "Out of Stock";
};

const getStockStatus = (
  stock: number
): Product["status"] => {
  if (stock === 0) {
    return "Out of Stock";
  }

  if (stock <= 5) {
    return "Low Stock";
  }

  return "Active";
};

const initialProducts: Product[] = [
  {
    id: 1,
    name: "Wireless Mouse",
    category: "Computer Accessories",
    price: 1200,
    stock: 25,
    status: "Active",
  },
  {
    id: 2,
    name: "USB Keyboard",
    category: "Computer Accessories",
    price: 1500,
    stock: 12,
    status: "Active",
  },
  {
    id: 3,
    name: "HDMI Cable",
    category: "Cables",
    price: 800,
    stock: 5,
    status: "Low Stock",
  },
  {
    id: 4,
    name: "USB Type-C Cable",
    category: "Cables",
    price: 500,
    stock: 3,
    status: "Low Stock",
  },
  {
    id: 5,
    name: "Laptop Charger",
    category: "Computer Accessories",
    price: 2500,
    stock: 0,
    status: "Out of Stock",
  },
];

function Products() {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);


  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    price: "",
    stock: "",
  });

  const filteredProducts = products.filter((product) => {
  const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase());

  const matchesCategory =
      selectedCategory === "All" ||
      product.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

const handleAddProduct = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  const stockNumber = Number(newProduct.stock);

  const status =getStockStatus(stockNumber);

  if (editingProduct) {
    const updatedProducts = products.map((product) =>
      product.id === editingProduct.id
        ? {
            ...product,
            name: newProduct.name.trim(),
            category: newProduct.category,
            price: Number(newProduct.price),
            stock: stockNumber,
            status,
          }
        : product
    );

    setProducts(updatedProducts);
  } else {
    const product: Product = {
      id:
        products.length > 0
          ? Math.max(...products.map((p) => p.id)) + 1
          : 1,
      name: newProduct.name.trim(),
      category: newProduct.category,
      price: Number(newProduct.price),
      stock: stockNumber,
      status,
    };

    setProducts((currentProducts) => [
      ...currentProducts,
      product,
    ]);
  }

  setNewProduct({
    name: "",
    category: "",
    price: "",
    stock: "",
  });

  setEditingProduct(null);
  setShowForm(false);
};

  const closeForm = () => {
  setShowForm(false);
  setEditingProduct(null);

  setNewProduct({
    name: "",
    category: "",
    price: "",
    stock: "",
  });
};

const handleEditProduct = (product: Product) => {
  setEditingProduct(product);

  setNewProduct({
    name: product.name,
    category: product.category,
    price: product.price.toString(),
    stock: product.stock.toString(),
  });

  setShowForm(true);
};

const handleDeleteProduct = (id: number) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this product?"
  );

  if (!confirmed) {
    return;
  }

  setProducts((currentProducts) =>
    currentProducts.filter((product) => product.id !== id)
  );
};



  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Products
          </h1>

          <p className="mt-1 text-slate-500">
            Manage your products and inventory.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
  setEditingProduct(null);

  setNewProduct({
    name: "",
    category: "",
    price: "",
    stock: "",
  });

  setShowForm(true);
}}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-white transition hover:bg-blue-700"
        >
          + Add Product
        </button>
      </div>

      {/* Add Product Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h2 className="text-xl font-semibold text-slate-800">
                {editingProduct ? "Edit Product" : "Add Product"}
              </h2>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl text-slate-500 hover:text-slate-800"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleAddProduct}
              className="space-y-4 p-5"
            >
              {/* Product name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product Name
                </label>

                <input
                  type="text"
                  required
                  value={newProduct.name}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g. Bluetooth Speaker"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </label>

                <select
                  required
                  value={newProduct.category}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      category: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">
                    Select category
                  </option>

                  <option value="Computer Accessories">
                    Computer Accessories
                  </option>

                  <option value="Cables">
                    Cables
                  </option>
                </select>
              </div>

              {/* Price */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Selling Price
                </label>

                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={newProduct.price}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      price: e.target.value,
                    })
                  }
                  placeholder="e.g. 2500"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Stock */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Opening Stock
                </label>

                <input
                  type="number"
                  required
                  min="0"
                  value={newProduct.stock}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      stock: e.target.value,
                    })
                  }
                  placeholder="e.g. 10"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
                >
                  {editingProduct ? "Update Product" : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 sm:w-80"
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 sm:w-60"
          >
            <option value="All">
              All Categories
            </option>

            <option value="Computer Accessories">
              Computer Accessories
            </option>

            <option value="Cables">
              Cables
            </option>
          </select>
        </div>
      </div>

      {/* Products table */}
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
                  Price
                </th>

                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Stock
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
                    className="transition hover:bg-slate-50"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">
                        {product.name}
                      </div>

                      <div className="text-xs text-slate-400">
                        ID: #{product.id}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      {product.category}
                    </td>

                    <td className="px-6 py-4 font-medium text-slate-800">
                      KES {product.price.toLocaleString()}
                    </td>

                    <td className="px-6 py-4">
  <span
    className={
      product.stock === 0
        ? "font-semibold text-red-600"
        : product.stock <= 5
        ? "font-semibold text-orange-600"
        : "text-slate-600"
    }
  >
    {product.stock}
  </span>
</td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          product.status === "Active"
                            ? "bg-green-100 text-green-700"
                            : product.status === "Low Stock"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                          onClick={() => handleEditProduct(product)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          Delete
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
                    No products found.
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

export default Products;