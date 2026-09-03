import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";

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

type SupplierForm = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: SupplierForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const storedUser = localStorage.getItem("user");
  let role = "";

  try {
    role = storedUser ? JSON.parse(storedUser)?.role || "" : "";
  } catch {
    role = "";
  }

  const canCreateOrEdit = role === "admin" || role === "manager";
  const canDelete = role === "admin";

  const fetchSuppliers = async () => {
    try {
      setLoading(true);

      const response = await apiFetch("/api/suppliers");

      if (!response.ok) {
        throw new Error("Failed to fetch suppliers");
      }

      const data = await response.json();
      setSuppliers(data);
    } catch (error) {
      console.error("Error loading suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return suppliers;

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.contact_person,
        supplier.phone,
        supplier.email,
        supplier.address,
        supplier.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [suppliers, searchTerm]);

  const openAddForm = () => {
    if (!canCreateOrEdit) return;

    setEditingSupplier(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    if (!canCreateOrEdit) return;

    setEditingSupplier(supplier);
    setForm({
      name: supplier.name || "",
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setForm(emptyForm);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!canCreateOrEdit || submitting) return;

    if (!form.name.trim()) {
      alert("Supplier name is required");
      return;
    }

    try {
      setSubmitting(true);

      const isEditing = Boolean(editingSupplier);

      const response = await apiFetch(
        isEditing
          ? `/api/suppliers/${editingSupplier?.id}`
          : "/api/suppliers",
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            contact_person: form.contact_person.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            notes: form.notes.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.message ||
            (isEditing
              ? "Failed to update supplier"
              : "Failed to create supplier")
        );
        return;
      }

      await fetchSuppliers();
      closeForm();
    } catch (error) {
      console.error("Error saving supplier:", error);
      alert("Failed to save supplier");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!canDelete || deletingId !== null) return;

    const confirmed = window.confirm(
      `Delete supplier "${supplier.name}"?\n\nThis is only allowed if the supplier has no purchase history.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(supplier.id);

      const response = await apiFetch(`/api/suppliers/${supplier.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Failed to delete supplier");
        return;
      }

      await fetchSuppliers();
    } catch (error) {
      console.error("Error deleting supplier:", error);
      alert("Failed to delete supplier");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {showForm && canCreateOrEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  {editingSupplier ? "Edit Supplier" : "Add Supplier"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingSupplier
                    ? "Update supplier contact and business details."
                    : "Create a supplier for future stock purchases."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Nairobi Tech Distributors"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    name="contact_person"
                    value={form.contact_person}
                    onChange={handleChange}
                    placeholder="e.g. John Mwangi"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="e.g. 0712 345 678"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="supplier@example.com"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Address / Location
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="e.g. Tom Mboya Street, Nairobi"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Optional notes about this supplier"
                  className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting
                    ? "Saving..."
                    : editingSupplier
                    ? "Save Changes"
                    : "Add Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Suppliers</h1>
          <p className="mt-1 text-slate-500">
            Manage supplier contacts used for stock purchasing.
          </p>
        </div>

        {canCreateOrEdit && (
          <button
            type="button"
            onClick={openAddForm}
            className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            Add Supplier
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Suppliers</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {suppliers.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">With Phone</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {suppliers.filter((supplier) => supplier.phone).length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">With Email</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {suppliers.filter((supplier) => supplier.email).length}
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search suppliers by name, contact, phone, email or location..."
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-xl"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                  Supplier
                </th>
                <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                  Contact Person
                </th>
                <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                  Phone
                </th>
                <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                  Email
                </th>
                <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                  Location
                </th>

                {canCreateOrEdit && (
                  <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={canCreateOrEdit ? 6 : 5}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">
                        {supplier.name}
                      </p>

                      {supplier.notes && (
                        <p
                          className="mt-1 max-w-64 truncate text-xs text-slate-400"
                          title={supplier.notes}
                        >
                          {supplier.notes}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {supplier.contact_person || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {supplier.phone || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {supplier.email || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {supplier.address || "—"}
                    </td>

                    {canCreateOrEdit && (
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(supplier)}
                            className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
                          >
                            Edit
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(supplier)}
                              disabled={deletingId === supplier.id}
                              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === supplier.id
                                ? "Deleting..."
                                : "Delete"}
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
                    colSpan={canCreateOrEdit ? 6 : 5}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No suppliers found.
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

export default Suppliers;
