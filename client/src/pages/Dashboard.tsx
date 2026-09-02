import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiFetch } from "../services/api";

type DashboardData = {
  today: {
    gross_sales: number;
    refunds: number;
    net_sales: number;
    original_cogs: number;
    returned_cogs: number;
    net_cogs: number;
    gross_profit: number;
    expenses: number;
    net_profit: number;
    transactions: number;
    return_transactions: number;
    expense_transactions: number;
  };
  products: {
    total: number;
    low_stock: number;
  };
  sales_chart: {
    date: string;
    gross_sales: number;
    refunds: number;
    net_sales: number;
    original_cogs: number;
    returned_cogs: number;
    net_cogs: number;
    gross_profit: number;
    expenses: number;
    net_profit: number;
  }[];
  recent_sales: {
    id: number;
    receipt_number: string;
    total: number;
    refunded_amount: number;
    net_total: number;
    payment_method: string;
    sold_by_name: string | null;
    created_at: string;
  }[];
};

function Dashboard() {
  const storedUser = localStorage.getItem("user");
  let userRole = "";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;
    userRole = String(user?.role || "").toLowerCase();
  } catch {
    userRole = "";
  }

  const isCashier = userRole === "cashier";

  const [dashboardData, setDashboardData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiFetch("/api/dashboard");

      if (!response.ok) {
        throw new Error("Failed to load dashboard");
      }

      const data = await response.json();

      setDashboardData(data);
    } catch (error) {
      console.error(
        "Error loading dashboard:",
        error
      );

      setError(
        "Could not load dashboard information."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const formatCurrency = (amount: number) => {
    return `KES ${Number(amount || 0).toLocaleString()}`;
  };

  const chartData =
    dashboardData?.sales_chart.map((item) => ({
      ...item,

      day: new Date(
        `${item.date}T00:00:00`
      ).toLocaleDateString("en-US", {
        weekday: "short",
      }),
    })) || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Dashboard
          </h1>

          <p className="mt-1 text-slate-500">
            Loading business summary...
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Dashboard
          </h1>

          <p className="mt-1 text-slate-500">
            {isCashier
            ? "Here's your sales activity for today."
            : "Here's what's happening with your business today."}
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-700">
            {error ||
              "Could not load dashboard information."}
          </p>

          <button
            type="button"
            onClick={fetchDashboard}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Dashboard
        </h1>

        <p className="mt-1 text-slate-500">
          Here's what's happening with your business today.
        </p>
      </div>

      {/* Statistics */}
      {isCashier ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">My Sales Today</p>
            <h2 className="mt-2 text-2xl font-bold text-green-700">
              {formatCurrency(dashboardData.today.gross_sales)}
            </h2>
            <p className="mt-2 text-sm text-slate-500">Sales processed by you today</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">My Transactions Today</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">
              {dashboardData.today.transactions}
            </h2>
            <p className="mt-2 text-sm text-slate-500">Transactions processed by you</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Products</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">
              {dashboardData.products.total}
            </h2>
            <p className="mt-2 text-sm text-slate-500">Active products</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Low Stock</p>
            <h2 className="mt-2 text-2xl font-bold text-red-600">
              {dashboardData.products.low_stock}
            </h2>
            <p className="mt-2 text-sm text-red-500">Products need attention</p>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Net Sales Today
          </p>

          <h2 className="mt-2 text-2xl font-bold text-green-700">
            {formatCurrency(
              dashboardData.today.net_sales
            )}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            After today's refunds
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Expenses Today
          </p>

          <h2 className="mt-2 text-2xl font-bold text-amber-700">
            {formatCurrency(
              dashboardData.today.expenses
            )}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {dashboardData.today.expense_transactions} expense transaction
            {dashboardData.today.expense_transactions === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Net Profit Today
          </p>

          <h2
            className={`mt-2 text-2xl font-bold ${
              dashboardData.today.net_profit >= 0
                ? "text-emerald-700"
                : "text-red-600"
            }`}
          >
            {formatCurrency(
              dashboardData.today.net_profit
            )}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Gross profit less expenses
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Gross Sales Today
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {formatCurrency(
              dashboardData.today.gross_sales
            )}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Before refunds
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Refunds Today
          </p>

          <h2 className="mt-2 text-2xl font-bold text-red-600">
            {formatCurrency(
              dashboardData.today.refunds
            )}
          </h2>

          <p className="mt-2 text-sm text-red-500">
            {dashboardData.today.return_transactions} return transaction
            {dashboardData.today.return_transactions === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Transactions Today
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {dashboardData.today.transactions}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Completed sales
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Products
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {dashboardData.products.total}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Active products
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Low Stock
          </p>

          <h2 className="mt-2 text-2xl font-bold text-red-600">
            {dashboardData.products.low_stock}
          </h2>

          <p className="mt-2 text-sm text-red-500">
            Products need attention
          </p>
        </div>
      </div>
      )}
      {/* Today's profit calculation */}
      {!isCashier && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Today's Profit Calculation
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Net Sales - Net COGS = Gross Profit; Gross Profit - Expenses = Net Profit
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg bg-green-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700">
                Net Sales
              </p>
              <p className="mt-1 font-bold text-green-700">
                {formatCurrency(dashboardData.today.net_sales)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                Net COGS
              </p>
              <p className="mt-1 font-bold text-slate-800">
                {formatCurrency(dashboardData.today.net_cogs)}
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                Gross Profit
              </p>
              <p className="mt-1 font-bold text-blue-700">
                {formatCurrency(dashboardData.today.gross_profit)}
              </p>
            </div>

            <div className="rounded-lg bg-amber-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Expenses
              </p>
              <p className="mt-1 font-bold text-amber-700">
                {formatCurrency(dashboardData.today.expenses)}
              </p>
            </div>

            <div
              className={`rounded-lg px-4 py-3 ${
                dashboardData.today.net_profit >= 0
                  ? "bg-emerald-50"
                  : "bg-red-50"
              }`}
            >
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  dashboardData.today.net_profit >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                Net Profit
              </p>
              <p
                className={`mt-1 font-bold ${
                  dashboardData.today.net_profit >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(dashboardData.today.net_profit)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Original COGS
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {formatCurrency(dashboardData.today.original_cogs)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Returned COGS
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {formatCurrency(dashboardData.today.returned_cogs)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sales chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800">
            {isCashier ? "My 7-Day Sales" : "Sales, Expenses & Profit Overview"}
          </h2>

          <p className="text-sm text-slate-500">
            {isCashier
              ? "Your sales performance for the last 7 days"
              : "Sales, refunds, COGS, gross profit, expenses, and net profit for the last 7 days"}
          </p>
        </div>

        <div className="h-80">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" />

              <YAxis />

              <Tooltip
                formatter={(value) =>
                  formatCurrency(
                    Number(value)
                  )
                }
              />

              <Line
                type="monotone"
                dataKey="gross_sales"
                name="Gross Sales"
                stroke="#2563eb"
                strokeWidth={2}
              />

              {!isCashier && (
              <Line
                type="monotone"
                dataKey="refunds"
                name="Refunds"
                stroke="#dc2626"
                strokeWidth={2}
              />
              )}

              {!isCashier && (
              <Line
                type="monotone"
                dataKey="net_sales"
                name="Net Sales"
                stroke="#16a34a"
                strokeWidth={3}
              />
              )}

              {!isCashier && (
              <Line
                type="monotone"
                dataKey="net_cogs"
                name="Net COGS"
                stroke="#64748b"
                strokeWidth={2}
              />
              )}

              {!isCashier && (
              <Line
                type="monotone"
                dataKey="gross_profit"
                name="Gross Profit"
                stroke="#0284c7"
                strokeWidth={2}
              />
              )}

              {!isCashier && (
              <Line
                type="monotone"
                dataKey="expenses"
                name="Expenses"
                stroke="#d97706"
                strokeWidth={2}
              />
              )}

              {!isCashier && (
              <Line
                type="monotone"
                dataKey="net_profit"
                name="Net Profit"
                stroke="#7c3aed"
                strokeWidth={3}
              />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent sales */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">
              {isCashier ? "My Recent Sales" : "Recent Sales"}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {isCashier
                ? "Your latest completed transactions"
                : "Latest sales with refunds reflected in the net amount"}
            </p>
          </div>

          {dashboardData.recent_sales.length ===
          0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No sales recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {dashboardData.recent_sales.map(
                (sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-4 p-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">
                        {sale.receipt_number}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {
                          sale.payment_method
                        }{" "}
                        •{" "}
                        {sale.sold_by_name ||
                          "Unknown cashier"}
                      </p>

                      {Number(
                        sale.refunded_amount
                      ) > 0 && (
                        <p className="mt-1 text-xs text-red-500">
                          Refunded:{" "}
                          {formatCurrency(
                            sale.refunded_amount
                          )}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-semibold text-slate-800">
                        {formatCurrency(
                          sale.net_total
                        )}
                      </p>

                      {Number(
                        sale.refunded_amount
                      ) > 0 && (
                        <p className="mt-1 text-xs text-slate-400 line-through">
                          {formatCurrency(
                            sale.total
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">
              Quick Actions
            </h2>
          </div>

          {isCashier ? (
            <div className="p-6">
              <button className="w-full rounded-lg bg-blue-50 p-5 text-left text-blue-700 transition hover:bg-blue-100">
                <p className="font-semibold">New Sale</p>
                <p className="mt-1 text-sm">Start a transaction</p>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 p-6">
              <button className="rounded-lg bg-blue-50 p-5 text-blue-700 transition hover:bg-blue-100">
                <p className="font-semibold">New Sale</p>
                <p className="mt-1 text-sm">Start a transaction</p>
              </button>
              <button className="rounded-lg bg-green-50 p-5 text-green-700 transition hover:bg-green-100">
                <p className="font-semibold">Add Product</p>
                <p className="mt-1 text-sm">Create new product</p>
              </button>
              <button className="rounded-lg bg-purple-50 p-5 text-purple-700 transition hover:bg-purple-100">
                <p className="font-semibold">Add Expense</p>
                <p className="mt-1 text-sm">Record business expense</p>
              </button>
              <button className="rounded-lg bg-orange-50 p-5 text-orange-700 transition hover:bg-orange-100">
                <p className="font-semibold">View Reports</p>
                <p className="mt-1 text-sm">Analyze your business</p>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
