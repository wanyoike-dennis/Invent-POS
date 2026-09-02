import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api";

interface Expense {
  id: number;
  title: string;
  category: string;
  amount: number;
  payment_method: "Cash" | "M-Pesa";
  description: string | null;
  recorded_by: number | null;
  recorded_by_name: string | null;
  expense_date: string;
  created_at: string;
}

interface ExpenseSummary {
  total_expenses: number;
  total_amount: number;
  cash_expenses: number;
  mpesa_expenses: number;
}

interface ExpenseResponse {
  filters: {
    search: string;
    category: string;
    payment_method: string;
    start_date: string | null;
    end_date: string | null;
  };
  summary: ExpenseSummary;
  expenses: Expense[];
}

interface ExpenseForm {
  title: string;
  category: string;
  amount: string;
  paymentMethod: "Cash" | "M-Pesa";
  description: string;
  expenseDate: string;
}

interface ExpenseFilters {
  search: string;
  category: string;
  paymentMethod: string;
  startDate: string;
  endDate: string;
}

const expenseCategories = [
  "Rent",
  "Utilities",
  "Transport",
  "Internet",
  "Supplies",
  "Repairs & Maintenance",
  "Salaries",
  "Marketing",
  "Other",
];

const getToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(
    now.getTime() - offset * 60_000
  )
    .toISOString()
    .slice(0, 10);
};

const createEmptyForm = (): ExpenseForm => ({
  title: "",
  category: "",
  amount: "",
  paymentMethod: "Cash",
  description: "",
  expenseDate: getToday(),
});

const createEmptyFilters = (): ExpenseFilters => ({
  search: "",
  category: "",
  paymentMethod: "",
  startDate: "",
  endDate: "",
});

function Expenses() {
  const [expenses, setExpenses] =
    useState<Expense[]>([]);

  const [summary, setSummary] =
    useState<ExpenseSummary>({
      total_expenses: 0,
      total_amount: 0,
      cash_expenses: 0,
      mpesa_expenses: 0,
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [showAddModal, setShowAddModal] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [editingExpense, setEditingExpense] =
    useState<Expense | null>(null);

  const [deletingExpense, setDeletingExpense] =
    useState<Expense | null>(null);

  const [deleting, setDeleting] =
    useState(false);

  const [form, setForm] =
    useState<ExpenseForm>(
      createEmptyForm()
    );

  const [filters, setFilters] =
    useState<ExpenseFilters>(
      createEmptyFilters()
    );

  // ==========================================================
  // FETCH EXPENSES
  // ==========================================================

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params =
        new URLSearchParams();

      if (filters.search.trim()) {
        params.set(
          "search",
          filters.search.trim()
        );
      }

      if (filters.category) {
        params.set(
          "category",
          filters.category
        );
      }

      if (filters.paymentMethod) {
        params.set(
          "paymentMethod",
          filters.paymentMethod
        );
      }

      if (filters.startDate) {
        params.set(
          "startDate",
          filters.startDate
        );
      }

      if (filters.endDate) {
        params.set(
          "endDate",
          filters.endDate
        );
      }

      const queryString =
        params.toString();

      const endpoint =
        queryString
          ? `/api/expenses?${queryString}`
          : "/api/expenses";

      const response =
        await apiFetch(endpoint);

      if (!response.ok) {
        const result =
          await response.json();

        throw new Error(
          result.message ||
            "Failed to load expenses"
        );
      }

      const data:
        ExpenseResponse =
          await response.json();

      setExpenses(
        data.expenses
      );

      setSummary(
        data.summary
      );
    } catch (err) {
      console.error(
        "Fetch expenses error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load expenses"
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchExpenses();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchExpenses]);

  // ==========================================================
  // FILTERS
  // ==========================================================

  const resetFilters = () => {
    setFilters(
      createEmptyFilters()
    );

    setSuccess("");
  };

  const hasActiveFilters =
    Boolean(
      filters.search ||
      filters.category ||
      filters.paymentMethod ||
      filters.startDate ||
      filters.endDate
    );

  // ==========================================================
  // ADD EXPENSE MODAL
  // ==========================================================

  const openAddModal = () => {
    setForm(
      createEmptyForm()
    );

    setError("");
    setSuccess("");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    if (saving) {
      return;
    }

    setShowAddModal(false);
  };

  // ==========================================================
  // EDIT EXPENSE
  // ==========================================================

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setForm({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount),
      paymentMethod: expense.payment_method,
      description: expense.description || "",
      expenseDate: expense.expense_date,
    });

    setError("");
    setSuccess("");
  };

  const closeEditModal = () => {
    if (saving) {
      return;
    }

    setEditingExpense(null);
    setForm(createEmptyForm());
  };

  const handleEditExpense = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!editingExpense) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await apiFetch(
        `/api/expenses/${editingExpense.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title,
            category: form.category,
            amount: Number(form.amount),
            paymentMethod: form.paymentMethod,
            description: form.description,
            expenseDate: form.expenseDate,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Failed to update expense"
        );
      }

      setEditingExpense(null);
      setForm(createEmptyForm());
      setSuccess("Expense updated successfully.");

      await fetchExpenses();
    } catch (err) {
      console.error("Update expense error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to update expense"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================================
  // DELETE EXPENSE
  // ==========================================================

  const openDeleteModal = (expense: Expense) => {
    setDeletingExpense(expense);
    setError("");
    setSuccess("");
  };

  const closeDeleteModal = () => {
    if (deleting) {
      return;
    }

    setDeletingExpense(null);
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) {
      return;
    }

    try {
      setDeleting(true);
      setError("");
      setSuccess("");

      const response = await apiFetch(
        `/api/expenses/${deletingExpense.id}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Failed to delete expense"
        );
      }

      setDeletingExpense(null);
      setSuccess("Expense deleted successfully.");

      await fetchExpenses();
    } catch (err) {
      console.error("Delete expense error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete expense"
      );
    } finally {
      setDeleting(false);
    }
  };

  // ==========================================================
  // CREATE EXPENSE
  // ==========================================================

  const handleAddExpense = async (
    event:
      React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response =
        await apiFetch(
          "/api/expenses",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              title: form.title,
              category:
                form.category,
              amount:
                Number(form.amount),
              paymentMethod:
                form.paymentMethod,
              description:
                form.description,
              expenseDate:
                form.expenseDate,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Failed to record expense"
        );
      }

      setShowAddModal(false);

      setForm(
        createEmptyForm()
      );

      setSuccess(
        "Expense recorded successfully."
      );

      await fetchExpenses();
    } catch (err) {
      console.error(
        "Create expense error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to record expense"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================================
  // MONEY FORMATTER
  // ==========================================================

  const formatMoney = (
    amount: number
  ) => {
    return new Intl.NumberFormat(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }
    ).format(amount);
  };

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Expenses
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Record and manage business expenses
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          + Add Expense
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUCCESS */}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* SUMMARY */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Expenses
          </p>

          <p className="mt-2 text-2xl font-bold text-gray-900">
            KES{" "}
            {formatMoney(
              summary.total_amount
            )}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Expense Records
          </p>

          <p className="mt-2 text-2xl font-bold text-gray-900">
            {summary.total_expenses}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Cash Expenses
          </p>

          <p className="mt-2 text-2xl font-bold text-gray-900">
            KES{" "}
            {formatMoney(
              summary.cash_expenses
            )}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            M-Pesa Expenses
          </p>

          <p className="mt-2 text-2xl font-bold text-gray-900">
            KES{" "}
            {formatMoney(
              summary.mpesa_expenses
            )}
          </p>
        </div>
      </div>

      {/* FILTERS */}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Search & Filters
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Filter expense history and summary totals
            </p>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>

            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  search:
                    e.target.value,
                })
              }
              placeholder="Search title, category or description..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Category
            </label>

            <select
              value={filters.category}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  category:
                    e.target.value,
                })
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">
                All Categories
              </option>

              {expenseCategories.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Payment Method
            </label>

            <select
              value={
                filters.paymentMethod
              }
              onChange={(e) =>
                setFilters({
                  ...filters,
                  paymentMethod:
                    e.target.value,
                })
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">
                All Payments
              </option>

              <option value="Cash">
                Cash
              </option>

              <option value="M-Pesa">
                M-Pesa
              </option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Start Date
            </label>

            <input
              type="date"
              value={
                filters.startDate
              }
              onChange={(e) =>
                setFilters({
                  ...filters,
                  startDate:
                    e.target.value,
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              End Date
            </label>

            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  endDate:
                    e.target.value,
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {/* EXPENSE HISTORY */}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Expense History
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Showing{" "}
              {summary.total_expenses}{" "}
              expense
              {summary.total_expenses === 1
                ? ""
                : "s"}
            </p>
          </div>

          {loading && (
            <span className="text-sm text-gray-500">
              Updating...
            </span>
          )}
        </div>

        {loading &&
        expenses.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            Loading expenses...
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-700">
              {hasActiveFilters
                ? "No matching expenses"
                : "No expenses recorded"}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              {hasActiveFilters
                ? "Try adjusting or resetting your filters."
                : "Your business expenses will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Expense
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Category
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Payment
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Recorded By
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Amount
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {expenses.map(
                  (expense) => (
                    <tr
                      key={expense.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                        {
                          expense.expense_date
                        }
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-900">
                          {
                            expense.title
                          }
                        </p>

                        {expense.description && (
                          <p className="mt-1 max-w-xs truncate text-xs text-gray-500">
                            {
                              expense.description
                            }
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                        {
                          expense.category
                        }
                      </td>

                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {
                            expense.payment_method
                          }
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                        {expense.recorded_by_name ||
                          "—"}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-gray-900">
                        KES{" "}
                        {formatMoney(
                          expense.amount
                        )}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(expense)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => openDeleteModal(expense)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DELETE EXPENSE MODAL */}

      {deletingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Delete Expense
              </h2>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-gray-900">
                  {deletingExpense.title}
                </span>
                ?
              </p>

              <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                This action cannot be undone. The expense amount will be
                removed from your expense totals and reports.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteExpense}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete Expense"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EXPENSE MODAL */}

      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Edit Expense
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Update this business expense
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditExpense}>
              <div className="grid gap-5 p-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Expense Title
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Category
                  </label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select category</option>
                    {expenseCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Payment Method
                  </label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        paymentMethod: e.target.value as "Cash" | "M-Pesa",
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Cash">Cash</option>
                    <option value="M-Pesa">M-Pesa</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Expense Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.expenseDate}
                    onChange={(e) =>
                      setForm({ ...form, expenseDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Description
                    <span className="ml-1 font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Updating..." : "Update Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD EXPENSE MODAL */}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Add Expense
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Record a new business expense
                </p>
              </div>

              <button
                type="button"
                onClick={closeAddModal}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={
                handleAddExpense
              }
            >
              <div className="grid gap-5 p-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Expense Title
                  </label>

                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        title:
                          e.target.value,
                      })
                    }
                    placeholder="e.g. Internet Bill"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Category
                  </label>

                  <select
                    required
                    value={
                      form.category
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">
                      Select category
                    </option>

                    {expenseCategories.map(
                      (category) => (
                        <option
                          key={category}
                          value={category}
                        >
                          {category}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Amount (KES)
                  </label>

                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={
                      form.amount
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        amount:
                          e.target.value,
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Payment Method
                  </label>

                  <select
                    value={
                      form.paymentMethod
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        paymentMethod:
                          e.target.value as
                            | "Cash"
                            | "M-Pesa",
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Cash">
                      Cash
                    </option>

                    <option value="M-Pesa">
                      M-Pesa
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Expense Date
                  </label>

                  <input
                    type="date"
                    required
                    value={
                      form.expenseDate
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        expenseDate:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Description
                    <span className="ml-1 font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>

                  <textarea
                    rows={3}
                    value={
                      form.description
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        description:
                          e.target.value,
                      })
                    }
                    placeholder="Additional details about this expense..."
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                <button
                  type="button"
                  onClick={
                    closeAddModal
                  }
                  disabled={saving}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Expenses;
