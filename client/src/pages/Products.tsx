import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";

type Product = {
  id: number;
  name: string;
  category: string;
  cost_price: number;
  price: number;
  stock: number;
};

type Category = {
id: number;
  name: string;
};

const getStockStatus = (stock: number) => {
  if (stock === 0) {
    return "Out of Stock";
  }

  if (stock <= 5) {
    return "Low Stock";
  }

  return "Active";
};


function Products() {
  const storedUser = localStorage.getItem("user");

  let userRole = "";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;
    userRole = String(user?.role || "").toLowerCase();
  } catch {
    userRole = "";
  }

  const canManageProducts =
    userRole === "admin" || userRole === "manager";

  const canDeleteProducts =
    userRole === "admin";

  const canManageCategories =
    userRole === "admin" || userRole === "manager";

  const [newCategory, setNewCategory] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);


  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    price: "",
  });

  const fetchCategories = async () => {
  try {
    const response = await apiFetch(
      "/api/categories"
    );

    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }

    const data = await response.json();

    setCategories(data);
  } catch (error) {
    console.error("Error loading categories:", error);
  }
};

  const filteredProducts = products.filter((product) => {
  const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase());

  const matchesCategory =
      selectedCategory === "All" ||
      product.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });



  const closeForm = () => {
  setShowForm(false);
  setEditingProduct(null);

  setNewProduct({
    name: "",
    category: "",
    price: "",
  });
};
const handleAddProduct = async (
  e: React.FormEvent<HTMLFormElement>
) => {
  e.preventDefault();

  if (!canManageProducts) {
    return;
  }

  const productData = {
    name: newProduct.name.trim(),
    category: newProduct.category,
    price: Number(newProduct.price),

    // Stock and cost are controlled from Inventory.
    // New products start at zero; edits preserve existing values.
    cost_price: editingProduct ? Number(editingProduct.cost_price) : 0,
    stock: editingProduct ? Number(editingProduct.stock) : 0,
  };

  try {
    if (editingProduct) {
      const response = await apiFetch(
        `/api/products/${editingProduct.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(productData),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update product");
      }
    } else {
      const response = await apiFetch(
        "/api/products", 
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(productData),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add product");
      }
    }

    await fetchProducts();

    setNewProduct({
      name: "",
      category: "",
      price: "",
    });

    setEditingProduct(null);
    setShowForm(false);

  } catch (error) {
    console.error("Error saving product:", error);
  }
};

const handleEditProduct = (product: Product) => {
  if (!canManageProducts) {
    return;
  }

  setEditingProduct(product);

  setNewProduct({
    name: product.name,
    category: product.category,
    price: product.price.toString(),
  });

  setShowForm(true);
};

const handleDeleteProduct = async (id: number) => {
  if (!canDeleteProducts) {
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to delete this product?"
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/products/${id}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to delete product");
    }

    await fetchProducts();

  } catch (error) {
    console.error("Error deleting product:", error);
  }
};

const fetchProducts = async () => {
  try {
    const response = await apiFetch(
      "/api/products"
    );

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const data = await response.json();

    setProducts(data);
  } catch (error) {
    console.error("Error loading products:", error);
  }
};

useEffect(() => {
  fetchProducts();
  fetchCategories();
}, []);

const handleAddCategory = async (
  e: React.FormEvent<HTMLFormElement>
) => {
  e.preventDefault();

  if (!canManageCategories) {
    return;
  }

  if (!newCategory.trim()) {
    return;
  }

  try {
    const response = await apiFetch(
      "/api/categories",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newCategory.trim(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to add category");
    }

    setNewCategory("");

    await fetchCategories();
  } catch (error) {
    console.error("Error adding category:", error);
  }
};

const handleDeleteCategory = async (id: number) => {
  if (!canManageCategories) {
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to delete this category?"
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/categories/${id}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to delete category");
    }

    await fetchCategories();
  } catch (error) {
    console.error("Error deleting category:", error);
  }
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

        {canManageProducts && (
          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);

              setNewProduct({
                name: "",
                category: "",
                price: "",
              });

              setShowForm(true);
            }}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-white transition hover:bg-blue-700"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Add Product Modal */}
      {showForm && canManageProducts && (
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

  {categories.map((category) => (
    <option
      key={category.id}
      value={category.name}
    >
      {category.name}
    </option>
  ))}
                

                 
                </select>
              </div>

              {/* Selling price */}
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
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Price charged to the customer for one sellable unit.
                </p>
              </div>

              <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-4">
                <p className="text-sm font-medium text-slate-800">
                  Stock and buying cost are managed from Inventory
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {editingProduct
                    ? "This edit will keep the current stock and average cost unchanged. Use Inventory → Purchase / Restock for purchases or Adjust Stock for corrections."
                    : "This product will start with 0 stock and KES 0 average cost. After saving, use Inventory → Purchase / Restock to record the first stock purchase."}
                </p>
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

          {categories.map((category) => (
    <option
      key={category.id}
      value={category.name}
    >
      {category.name}
    </option>
  ))}
          </select>
        </div>
      </div>

      {canManageCategories && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-slate-800">
      Manage Categories
    </h2>

    <p className="text-sm text-slate-500">
      Add or remove product categories.
    </p>
  </div>

  <form
    onSubmit={handleAddCategory}
    className="mb-5 flex flex-col gap-3 sm:flex-row"
  >
    <input
      type="text"
      value={newCategory}
      onChange={(e) => setNewCategory(e.target.value)}
      placeholder="Enter category name"
      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-sm"
    />

    <button
      type="submit"
      className="rounded-lg bg-blue-600 px-5 py-2.5 text-white transition hover:bg-blue-700"
    >
      Add Category
    </button>
  </form>

  <div className="flex flex-wrap gap-3">
    {categories.map((category) => (
      <div
        key={category.id}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
      >
        <span className="text-sm text-slate-700">
          {category.name}
        </span>

        <button
          type="button"
          onClick={() => handleDeleteCategory(category.id)}
          className="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Delete
        </button>
      </div>
    ))}
  </div>
</div>
      )}

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

                {canManageProducts && (
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Cost Price
                  </th>
                )}

                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Selling Price
                </th>

                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Stock
                </th>

                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Status
                </th>

                {(canManageProducts || canDeleteProducts) && (
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                    Actions
                  </th>
                )}
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

                    {canManageProducts && (
                      <td className="px-6 py-4 text-slate-600">
                        KES {product.cost_price.toLocaleString()}
                      </td>
                    )}

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
                         getStockStatus(product.stock) === "Active"
                            ? "bg-green-100 text-green-700"
                            : getStockStatus(product.stock) === "Low Stock"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {getStockStatus(product.stock)}
                      </span>
                    </td>

                    {(canManageProducts || canDeleteProducts) && (
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {canManageProducts && (
                            <button
                              type="button"
                              className="rounded px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                              onClick={() => handleEditProduct(product)}
                            >
                              Edit
                            </button>
                          )}

                          {canDeleteProducts && (
                            <button
                              type="button"
                              className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteProduct(product.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={
                      canManageProducts || canDeleteProducts ? 7 : 5
                    }
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