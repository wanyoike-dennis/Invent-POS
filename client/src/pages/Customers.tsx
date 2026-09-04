import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { apiFetch } from "../services/api";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerSummary = {
  total_customers: number;
  added_today: number;
  added_last_7_days: number;
};

type CustomerResponse = {
  summary: CustomerSummary;
  customers: Customer[];
};

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

function Customers() {
  const storedUser = localStorage.getItem("user");

  let userRole = "";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;
    userRole = String(user?.role || "").toLowerCase();
  } catch {
    userRole = "";
  }

  const canDeleteCustomer =
    userRole === "admin" || userRole === "manager";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary>({
    total_customers: 0,
    added_today: 0,
    added_last_7_days: 0,
  });

  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCustomerModal, setShowCustomerModal] =
    useState(false);

  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);

  const [formData, setFormData] =
    useState<CustomerForm>(emptyForm);

  const [formError, setFormError] = useState("");
  const [savingCustomer, setSavingCustomer] =
    useState(false);

  const [customerToDelete, setCustomerToDelete] =
    useState<Customer | null>(null);

  const [deletingCustomer, setDeletingCustomer] =
    useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiFetch("/api/customers");

      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      const data = (await response.json()) as CustomerResponse;

      setCustomers(
        Array.isArray(data.customers)
          ? data.customers
          : []
      );

      setSummary(
        data.summary || {
          total_customers: 0,
          added_today: 0,
          added_last_7_days: 0,
        }
      );
    } catch (error) {
      console.error("Error loading customers:", error);

      setError(
        "Could not load customers. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return customers;
    }

    return customers.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(search) ||
        (customer.phone || "")
          .toLowerCase()
          .includes(search) ||
        (customer.email || "")
          .toLowerCase()
          .includes(search) ||
        (customer.address || "")
          .toLowerCase()
          .includes(search)
      );
    });
  }, [customers, searchTerm]);

  const openAddCustomerModal = () => {
    setEditingCustomer(null);
    setFormData(emptyForm);
    setFormError("");
    setShowCustomerModal(true);
  };

  const openEditCustomerModal = (customer: Customer) => {
    setEditingCustomer(customer);

    setFormData({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });

    setFormError("");
    setShowCustomerModal(true);
  };

  const closeCustomerModal = () => {
    if (savingCustomer) {
      return;
    }

    setShowCustomerModal(false);
    setEditingCustomer(null);
    setFormData(emptyForm);
    setFormError("");
  };

  const handleFormChange = (
    field: keyof CustomerForm,
    value: string
  ) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveCustomer = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setFormError("");

    const name = formData.name.trim();

    if (!name) {
      setFormError("Customer name is required.");
      return;
    }

    try {
      setSavingCustomer(true);

      const response = await apiFetch(
        editingCustomer
          ? `/api/customers/${editingCustomer.id}`
          : "/api/customers",
        {
          method: editingCustomer ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            phone: formData.phone.trim(),
            email: formData.email.trim(),
            address: formData.address.trim(),
            notes: formData.notes.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setFormError(
          data.message ||
            "Failed to save customer."
        );
        return;
      }

      setShowCustomerModal(false);
      setEditingCustomer(null);
      setFormData(emptyForm);
      setFormError("");

      await fetchCustomers();
    } catch (error) {
      console.error("Error saving customer:", error);

      setFormError(
        "Could not save customer. Please try again."
      );
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete || !canDeleteCustomer) {
      return;
    }

    try {
      setDeletingCustomer(true);

      const response = await apiFetch(
        `/api/customers/${customerToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to delete customer"
        );
      }

      setCustomerToDelete(null);

      await fetchCustomers();
    } catch (error) {
      console.error("Delete customer error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete customer."
      );
    } finally {
      setDeletingCustomer(false);
    }
  };

  const formatDate = (value: string) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADING */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#18C8E8]">
            Customer Management
          </p>

          <h1 className="text-2xl font-bold text-[#071827]">
            Customers
          </h1>

          <p className="mt-1 text-slate-500">
            Manage customer contacts and prepare for linked
            sales history.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddCustomerModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D5EEA]"
        >
          <Plus size={18} />
          Add Customer
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">
                Total Customers
              </p>

              <p className="mt-2 text-3xl font-bold text-[#071827]">
                {summary.total_customers}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#246BFD]/10 text-[#246BFD]">
              <Users size={21} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">
                Added Today
              </p>

              <p className="mt-2 text-3xl font-bold text-[#071827]">
                {summary.added_today}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserRound size={21} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">
                Added Last 7 Days
              </p>

              <p className="mt-2 text-3xl font-bold text-[#071827]">
                {summary.added_last_7_days}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
              <Plus size={21} />
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH / TABLE */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-[#071827]">
                Customer Directory
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Search by customer name, phone, email or location.
              </p>
            </div>

            <div className="relative w-full sm:max-w-sm">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={searchTerm}
                onChange={(e) =>
                  setSearchTerm(e.target.value)
                }
                placeholder="Search customers..."
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={fetchCustomers}
                className="text-sm font-semibold text-red-700 hover:underline"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Users size={22} />
            </div>

            <p className="mt-4 font-medium text-slate-700">
              {searchTerm
                ? "No customers match your search."
                : "No customers added yet."}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {searchTerm
                ? "Try another name, phone number or email."
                : "Add your first customer to begin building the customer directory."}
            </p>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Customer
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contact
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Location
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Added
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#246BFD]/10 font-semibold text-[#246BFD]">
                            {customer.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-[#071827]">
                              {customer.name}
                            </p>

                            {customer.notes && (
                              <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                                {customer.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone
                              size={14}
                              className="text-slate-400"
                            />
                            <span>
                              {customer.phone || "—"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail
                              size={14}
                              className="text-slate-400"
                            />
                            <span className="max-w-[220px] truncate">
                              {customer.email || "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        <div className="flex items-start gap-2">
                          <MapPin
                            size={14}
                            className="mt-0.5 shrink-0 text-slate-400"
                          />

                          <span>
                            {customer.address || "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {formatDate(customer.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditCustomerModal(
                                customer
                              )
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:border-[#246BFD]/40 hover:bg-[#246BFD]/[0.05] hover:text-[#246BFD]"
                            title="Edit customer"
                          >
                            <Pencil size={16} />
                          </button>

                          {canDeleteCustomer && (
                            <button
                              type="button"
                              onClick={() =>
                                setCustomerToDelete(
                                  customer
                                )
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                              title="Delete customer"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="divide-y divide-slate-200 md:hidden">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="space-y-4 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#246BFD]/10 font-semibold text-[#246BFD]">
                        {customer.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-[#071827]">
                          {customer.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Added {formatDate(customer.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openEditCustomerModal(customer)
                        }
                        className="rounded-lg border border-slate-300 p-2 text-slate-600"
                      >
                        <Pencil size={16} />
                      </button>

                      {canDeleteCustomer && (
                        <button
                          type="button"
                          onClick={() =>
                            setCustomerToDelete(customer)
                          }
                          className="rounded-lg border border-red-200 p-2 text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone
                        size={14}
                        className="text-slate-400"
                      />
                      {customer.phone || "No phone"}
                    </div>

                    <div className="flex items-center gap-2">
                      <Mail
                        size={14}
                        className="text-slate-400"
                      />
                      <span className="truncate">
                        {customer.email || "No email"}
                      </span>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin
                        size={14}
                        className="mt-0.5 text-slate-400"
                      />
                      {customer.address || "No location"}
                    </div>
                  </div>

                  {customer.notes && (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      {customer.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ADD / EDIT CUSTOMER MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#18C8E8]">
                  {editingCustomer
                    ? "Customer Profile"
                    : "New Customer"}
                </p>

                <h2 className="text-xl font-semibold text-[#071827]">
                  {editingCustomer
                    ? "Edit Customer"
                    : "Add Customer"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {editingCustomer
                    ? "Update the customer's contact information."
                    : "Add a customer to the Invent POS customer directory."}
                </p>
              </div>

              <button
                type="button"
                disabled={savingCustomer}
                onClick={closeCustomerModal}
                className="text-2xl text-slate-400 transition hover:text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSaveCustomer}
              className="space-y-5 p-5"
            >
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Customer Name *
                  </label>

                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      handleFormChange(
                        "name",
                        e.target.value
                      )
                    }
                    placeholder="e.g. Jane Wanjiku"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Phone Number
                  </label>

                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      handleFormChange(
                        "phone",
                        e.target.value
                      )
                    }
                    placeholder="e.g. 0712345678"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                  />

                  <p className="mt-1.5 text-xs text-slate-500">
                    Phone numbers are checked for duplicates.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      handleFormChange(
                        "email",
                        e.target.value
                      )
                    }
                    placeholder="e.g. jane@example.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Address / Location
                  </label>

                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) =>
                      handleFormChange(
                        "address",
                        e.target.value
                      )
                    }
                    placeholder="e.g. Kikuyu, Kiambu"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Notes
                  </label>

                  <textarea
                    rows={4}
                    value={formData.notes}
                    onChange={(e) =>
                      handleFormChange(
                        "notes",
                        e.target.value
                      )
                    }
                    placeholder="Optional customer notes..."
                    className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={savingCustomer}
                  onClick={closeCustomerModal}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="rounded-xl bg-[#246BFD] px-5 py-3 font-semibold text-white transition hover:bg-[#1D5EEA] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingCustomer
                    ? "Saving..."
                    : editingCustomer
                      ? "Save Changes"
                      : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {canDeleteCustomer && customerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={20} />
            </div>

            <h2 className="mt-4 text-xl font-semibold text-[#071827]">
              Delete Customer?
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              You are about to delete{" "}
              <span className="font-semibold text-slate-700">
                {customerToDelete.name}
              </span>
              . This action cannot be undone.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={deletingCustomer}
                onClick={() =>
                  setCustomerToDelete(null)
                }
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deletingCustomer}
                onClick={handleDeleteCustomer}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingCustomer
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;
