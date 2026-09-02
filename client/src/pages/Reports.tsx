import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../services/api";

type ReportData = {
  filters: {
    start_date: string | null;
    end_date: string | null;
  };

  summary: {
    gross_sales: number;
    refunds: number;
    net_sales: number;
    expenses: number;
    net_profit: number;
    transactions: number;
    return_transactions: number;
    expense_transactions: number;

    gross_cash_sales: number;
    cash_refunds: number;
    net_cash_sales: number;
    cash_expenses: number;

    gross_mpesa_sales: number;
    mpesa_refunds: number;
    net_mpesa_sales: number;
    mpesa_expenses: number;
  };

  daily_sales: {
    date: string;
    gross_sales: number;
    refunds: number;
    net_sales: number;
    expenses: number;
    net_profit: number;
  }[];
};

function Reports() {
  const [reportData, setReportData] =
    useState<ReportData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchReports = async (
    start = startDate,
    end = endDate
  ) => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (start) {
        params.set("startDate", start);
      }

      if (end) {
        params.set("endDate", end);
      }

      const query = params.toString();

      const response = await apiFetch(
        `/api/reports${query ? `?${query}` : ""}`
      );

      if (!response.ok) {
        throw new Error("Failed to load reports");
      }

      const data = await response.json();

      setReportData(data);
    } catch (error) {
      console.error(
        "Error loading reports:",
        error
      );

      setError(
        "Could not load reporting data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports("", "");
  }, []);

  const formatCurrency = (amount: number) => {
    return `KES ${Number(
      amount || 0
    ).toLocaleString()}`;
  };

  const chartData = useMemo(() => {
    return (
      reportData?.daily_sales.map(
        (item) => ({
          ...item,

          label: new Date(
            `${item.date}T00:00:00`
          ).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          }),
        })
      ) || []
    );
  }, [reportData]);

  const applyQuickRange = (
    range: "today" | "7days" | "month"
  ) => {
    const now = new Date();

    const formatDate = (date: Date) => {
      const year = date.getFullYear();

      const month = String(
        date.getMonth() + 1
      ).padStart(2, "0");

      const day = String(
        date.getDate()
      ).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    let start = "";
    const end = formatDate(now);

    if (range === "today") {
      start = end;
    }

    if (range === "7days") {
      const sevenDaysAgo = new Date(now);

      sevenDaysAgo.setDate(
        now.getDate() - 6
      );

      start = formatDate(sevenDaysAgo);
    }

    if (range === "month") {
      start = formatDate(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        )
      );
    }

    setStartDate(start);
    setEndDate(end);

    fetchReports(start, end);
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");

    fetchReports("", "");
  };

  const handleApplyFilters = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      startDate &&
      endDate &&
      startDate > endDate
    ) {
      setError(
        "Start date cannot be after end date."
      );
      return;
    }

    fetchReports();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Reports
        </h1>

        <p className="mt-1 text-slate-500">
          Analyze sales, refunds, expenses, profit, and payment methods.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            Report Period
          </h2>

          <p className="text-sm text-slate-500">
            Choose a quick period or set a custom date range.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyQuickRange("today")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Today
          </button>

          <button type="button" onClick={() => applyQuickRange("7days")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Last 7 Days
          </button>

          <button type="button" onClick={() => applyQuickRange("month")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            This Month
          </button>

          <button type="button" onClick={clearFilters} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            All Time
          </button>
        </div>

        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Start Date
            </label>

            <input
              type="date"
              value={startDate}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              End Date
            </label>

            <input
              type="date"
              value={endDate}
              onChange={(event) =>
                setEndDate(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="w-full rounded-lg bg-blue-600 px-5 py-2 font-medium text-white transition hover:bg-blue-700 md:w-auto">
              Apply
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Loading reports...
        </div>
      ) : reportData ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Gross Sales
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-800">
                {formatCurrency(reportData.summary.gross_sales)}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Sales before refunds
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Refunds
              </p>

              <h2 className="mt-2 text-2xl font-bold text-red-600">
                {formatCurrency(reportData.summary.refunds)}
              </h2>

              <p className="mt-2 text-sm text-red-500">
                {reportData.summary.return_transactions} return transaction
                {reportData.summary.return_transactions === 1 ? "" : "s"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Net Sales
              </p>

              <h2 className="mt-2 text-2xl font-bold text-green-700">
                {formatCurrency(reportData.summary.net_sales)}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Gross sales less refunds
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Expenses
              </p>

              <h2 className="mt-2 text-2xl font-bold text-amber-700">
                {formatCurrency(reportData.summary.expenses)}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {reportData.summary.expense_transactions} expense transaction
                {reportData.summary.expense_transactions === 1 ? "" : "s"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Net Profit
              </p>

              <h2
                className={`mt-2 text-2xl font-bold ${
                  reportData.summary.net_profit >= 0
                    ? "text-emerald-700"
                    : "text-red-600"
                }`}
              >
                {formatCurrency(reportData.summary.net_profit)}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Net sales less expenses
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Sales Transactions
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-800">
                {reportData.summary.transactions}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Completed sales
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Return Transactions
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-800">
                {reportData.summary.return_transactions}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Processed returns
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Expense Transactions
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-800">
                {reportData.summary.expense_transactions}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Recorded expenses
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-lg font-semibold text-slate-800">
                  Cash Breakdown
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cash sales adjusted for cash refunds processed in this period.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    Gross Cash
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-800">
                    {formatCurrency(reportData.summary.gross_cash_sales)}
                  </p>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <p className="text-sm text-red-600">
                    Cash Refunds
                  </p>
                  <p className="mt-2 text-xl font-bold text-red-600">
                    {formatCurrency(reportData.summary.cash_refunds)}
                  </p>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-sm text-green-700">
                    Net Cash
                  </p>
                  <p className="mt-2 text-xl font-bold text-green-700">
                    {formatCurrency(reportData.summary.net_cash_sales)}
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 p-4">
                  <p className="text-sm text-amber-700">
                    Cash Expenses
                  </p>
                  <p className="mt-2 text-xl font-bold text-amber-700">
                    {formatCurrency(reportData.summary.cash_expenses)}
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-lg font-semibold text-slate-800">
                  M-Pesa Breakdown
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  M-Pesa sales adjusted for M-Pesa refunds processed in this period.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    Gross M-Pesa
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-800">
                    {formatCurrency(reportData.summary.gross_mpesa_sales)}
                  </p>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <p className="text-sm text-red-600">
                    M-Pesa Refunds
                  </p>
                  <p className="mt-2 text-xl font-bold text-red-600">
                    {formatCurrency(reportData.summary.mpesa_refunds)}
                  </p>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-sm text-green-700">
                    Net M-Pesa
                  </p>
                  <p className="mt-2 text-xl font-bold text-green-700">
                    {formatCurrency(reportData.summary.net_mpesa_sales)}
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 p-4">
                  <p className="text-sm text-amber-700">
                    M-Pesa Expenses
                  </p>
                  <p className="mt-2 text-xl font-bold text-amber-700">
                    {formatCurrency(reportData.summary.mpesa_expenses)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Payment Reconciliation
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Net Cash + Net M-Pesa should equal total Net Sales.
                </p>
              </div>

              <div className="text-left md:text-right">
                <p className="text-sm text-slate-500">
                  Net Payment Total
                </p>
                <p className="mt-1 text-xl font-bold text-slate-800">
                  {formatCurrency(
                    Number(reportData.summary.net_cash_sales) +
                    Number(reportData.summary.net_mpesa_sales)
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Profit Calculation
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Net Sales - Expenses = Net Profit
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-green-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-green-700">
                    Net Sales
                  </p>
                  <p className="mt-1 font-bold text-green-700">
                    {formatCurrency(reportData.summary.net_sales)}
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                    Expenses
                  </p>
                  <p className="mt-1 font-bold text-amber-700">
                    {formatCurrency(reportData.summary.expenses)}
                  </p>
                </div>

                <div
                  className={`rounded-lg px-4 py-3 ${
                    reportData.summary.net_profit >= 0
                      ? "bg-emerald-50"
                      : "bg-red-50"
                  }`}
                >
                  <p
                    className={`text-xs font-medium uppercase tracking-wide ${
                      reportData.summary.net_profit >= 0
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    Net Profit
                  </p>
                  <p
                    className={`mt-1 font-bold ${
                      reportData.summary.net_profit >= 0
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {formatCurrency(reportData.summary.net_profit)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800">
                Daily Sales Trend
              </h2>
              <p className="text-sm text-slate-500">
                Gross sales, refunds, net sales, expenses, and profit for the selected period.
              </p>
            </div>

            {chartData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-slate-500">
                No sales, refunds, or expenses found for this period.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />

                    <Tooltip
                      formatter={(value) =>
                        formatCurrency(Number(value))
                      }
                    />

                    <Line
                      type="monotone"
                      dataKey="gross_sales"
                      name="Gross Sales"
                      stroke="#2563eb"
                      strokeWidth={2}
                    />

                    <Line
                      type="monotone"
                      dataKey="refunds"
                      name="Refunds"
                      stroke="#dc2626"
                      strokeWidth={2}
                    />

                    <Line
                      type="monotone"
                      dataKey="net_sales"
                      name="Net Sales"
                      stroke="#16a34a"
                      strokeWidth={3}
                    />

                    <Line
                      type="monotone"
                      dataKey="expenses"
                      name="Expenses"
                      stroke="#d97706"
                      strokeWidth={2}
                    />

                    <Line
                      type="monotone"
                      dataKey="net_profit"
                      name="Net Profit"
                      stroke="#7c3aed"
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800">
                Daily Breakdown
              </h2>
            </div>

            {reportData.daily_sales.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No report data available.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Date
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Gross Sales
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Refunds
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Net Sales
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Expenses
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Net Profit
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {reportData.daily_sales.map((row) => (
                      <tr key={row.date} className="hover:bg-slate-50">
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">
                          {new Date(
                            `${row.date}T00:00:00`
                          ).toLocaleDateString()}
                        </td>

                        <td className="px-5 py-4 text-right text-sm text-slate-700">
                          {formatCurrency(row.gross_sales)}
                        </td>

                        <td className="px-5 py-4 text-right text-sm text-red-600">
                          {formatCurrency(row.refunds)}
                        </td>

                        <td className="px-5 py-4 text-right text-sm font-semibold text-slate-800">
                          {formatCurrency(row.net_sales)}
                        </td>

                        <td className="px-5 py-4 text-right text-sm text-amber-700">
                          {formatCurrency(row.expenses)}
                        </td>

                        <td
                          className={`px-5 py-4 text-right text-sm font-semibold ${
                            row.net_profit >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.net_profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default Reports;
