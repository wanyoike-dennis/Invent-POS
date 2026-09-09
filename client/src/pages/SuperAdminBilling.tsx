import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Clock3,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { superAdminFetch } from "../services/api";

type BillingSummary = {
  totals?: {
    total_revenue?: number;
    total_payments?: number;
    revenue_this_month?: number;
    payments_this_month?: number;
  };
  subscriptions?: {
    active_paid_subscriptions?: number;
    trial_organizations?: number;
    expired_organizations?: number;
    suspended_organizations?: number;
  };
  recurring_revenue?: {
    mrr?: number;
    arr?: number;
  };
  revenue_by_plan?: Array<{
    plan: string;
    payment_count: number;
    revenue: number;
  }>;
  revenue_by_billing_cycle?: Array<{
    billing_cycle: string;
    payment_count: number;
    revenue: number;
  }>;
  revenue_by_payment_method?: Array<{
    payment_method: string;
    payment_count: number;
    revenue: number;
  }>;
  trend_months?: number;
  monthly_revenue?: Array<{
    month: string;
    revenue: number;
    payment_count: number;
  }>;
  upcoming_renewals?: Array<{
    organization_id: number;
    organization_name: string;
    organization_slug: string;
    status: string;
    plan: string;
    billing_cycle: string;
    expected_amount: number;
    subscription_expires_at: string;
  }>;
  recent_payments?: Array<{
    id: number;
    organization_id: number;
    organization_name: string;
    organization_slug: string;
    plan: string;
    billing_cycle: string;
    amount: number;
    payment_method: string;
    payment_reference: string | null;
    period_start: string;
    period_end: string;
    paid_at: string;
    notes: string | null;
  }>;
};

const money = (value?: number | null) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", {
    maximumFractionDigits: 2,
  })}`;

const label = (value?: string | null) => {
  const clean = String(value || "").trim();
  if (!clean) return "—";
  if (clean.toLowerCase() === "mpesa") return "M-Pesa";
  return clean
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
};

const date = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};


const renewalTiming = (
  value?: string | null
) => {
  if (!value) {
    return {
      text: "No expiry date",
      className:
        "bg-slate-100 text-slate-600",
    };
  }

  const expiry = new Date(value);

  if (Number.isNaN(expiry.getTime())) {
    return {
      text: "Invalid date",
      className:
        "bg-slate-100 text-slate-600",
    };
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const expiryStart = new Date(
    expiry.getFullYear(),
    expiry.getMonth(),
    expiry.getDate()
  );

  const days = Math.round(
    (expiryStart.getTime() -
      todayStart.getTime()) /
      86400000
  );

  if (days < 0) {
    return {
      text: `${Math.abs(days)} day${
        Math.abs(days) === 1 ? "" : "s"
      } overdue`,
      className:
        "bg-rose-50 text-rose-700",
    };
  }

  if (days === 0) {
    return {
      text: "Due today",
      className:
        "bg-amber-50 text-amber-700",
    };
  }

  if (days <= 7) {
    return {
      text: `Expires in ${days} day${
        days === 1 ? "" : "s"
      }`,
      className:
        "bg-amber-50 text-amber-700",
    };
  }

  return {
    text: `Expires in ${days} days`,
    className:
      "bg-blue-50 text-blue-700",
  };
};

function SuperAdminBilling() {
  const navigate = useNavigate();
  const [data, setData] =
    useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] = useState("");
  const [trendMonths, setTrendMonths] =
    useState<3 | 6 | 12>(6);

  const logout = useCallback(() => {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdminUser");
    navigate("/super-admin/login", {
      replace: true,
    });
  }, [navigate]);

  const loadData = useCallback(
    async (silent = false) => {
      try {
        silent
          ? setRefreshing(true)
          : setLoading(true);
        setError("");

        const response = await superAdminFetch(
          `/api/super-admin/billing/summary?months=${trendMonths}`
        );

        if (response.status === 401) {
          logout();
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Could not load billing summary"
          );
        }

        setData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load billing summary."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [logout, trendMonths]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxMonthlyRevenue = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.monthly_revenue || []).map(
          (item) => Number(item.revenue || 0)
        )
      ),
    [data]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            Loading subscription revenue...
          </div>
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const subscriptions = data?.subscriptions || {};

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                navigate("/super-admin/dashboard")
              }
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Dashboard
            </button>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                Invent POS
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-[#0B1F33]">
                Billing & Revenue
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                refreshing ? "animate-spin" : ""
              }
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <WalletCards
              size={20}
              className="mb-3 text-emerald-600"
            />
            <p className="text-sm text-slate-500">
              Total Revenue
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {money(totals.total_revenue)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              All subscription payments
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <TrendingUp
              size={20}
              className="mb-3 text-blue-600"
            />
            <p className="text-sm text-slate-500">
              Revenue This Month
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {money(totals.revenue_this_month)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {Number(
                totals.payments_this_month || 0
              )}{" "}
              payment(s) this month
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <BarChart3
              size={20}
              className="mb-3 text-violet-600"
            />
            <p className="text-sm text-slate-500">
              MRR
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {money(
                data?.recurring_revenue?.mrr
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Normalized monthly recurring revenue
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <Building2
              size={20}
              className="mb-3 text-amber-600"
            />
            <p className="text-sm text-slate-500">
              ARR
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {money(
                data?.recurring_revenue?.arr
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Annualized recurring revenue
            </p>
          </article>
        </section>

        <section className="mt-3 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <CreditCard size={18} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Total Payments
                </p>
                <p className="mt-0.5 text-lg font-bold text-[#0B1F33]">
                  {Number(
                    totals.total_payments || 0
                  ).toLocaleString("en-KE")}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Building2 size={18} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Active Paid Organizations
                </p>
                <p className="mt-0.5 text-lg font-bold text-[#0B1F33]">
                  {Number(
                    subscriptions.active_paid_subscriptions ||
                      0
                  ).toLocaleString("en-KE")}
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-[#0B1F33]">
                  {trendMonths}-Month Revenue Trend
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Subscription revenue by month
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {([3, 6, 12] as const).map(
                    (months) => (
                      <button
                        key={months}
                        type="button"
                        onClick={() =>
                          setTrendMonths(months)
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          trendMonths === months
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {months}M
                      </button>
                    )
                  )}
                </div>

                <BarChart3
                  size={20}
                  className="text-blue-600"
                />
              </div>
            </div>

            <div
              className={`mt-6 flex h-52 items-end ${
                trendMonths === 12
                  ? "gap-1.5"
                  : "gap-3"
              }`}
            >
              {(data?.monthly_revenue || []).map(
                (item) => {
                  const height = Math.max(
                    4,
                    (Number(item.revenue || 0) /
                      maxMonthlyRevenue) *
                      100
                  );

                  return (
                    <div
                      key={item.month}
                      className="flex min-w-0 flex-1 flex-col items-center"
                    >
                      <p
                        className={`mb-2 font-semibold text-slate-600 ${
                          trendMonths === 12
                            ? "text-[9px]"
                            : "text-[11px]"
                        }`}
                      >
                        {money(item.revenue)}
                      </p>
                      <div className="flex h-36 w-full items-end rounded-xl bg-slate-50 px-2 pt-2">
                        <div
                          className="w-full rounded-lg bg-blue-600 transition-all"
                          style={{
                            height: `${height}%`,
                          }}
                        />
                      </div>
                      <p
                        className={`mt-2 font-medium text-slate-500 ${
                          trendMonths === 12
                            ? "text-[10px]"
                            : "text-xs"
                        }`}
                      >
                        {new Date(
                          `${item.month}-01T00:00:00`
                        ).toLocaleDateString(
                          "en-KE",
                          {
                            month: "short",
                          }
                        )}
                      </p>
                    </div>
                  );
                }
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-[#0B1F33]">
              Subscription Status
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Current organization access
            </p>

            <div className="mt-4 space-y-2.5">
              {[
                [
                  "Active Paid",
                  subscriptions.active_paid_subscriptions,
                ],
                [
                  "Trial",
                  subscriptions.trial_organizations,
                ],
                [
                  "Expired",
                  subscriptions.expired_organizations,
                ],
                [
                  "Suspended",
                  subscriptions.suspended_organizations,
                ],
              ].map(([name, value]) => (
                <div
                  key={String(name)}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate-600">
                    {String(name)}
                  </span>
                  <span className="text-sm font-bold text-[#0B1F33]">
                    {Number(value || 0)}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Revenue by Plan",
              items: data?.revenue_by_plan || [],
              key: "plan",
            },
            {
              title: "Billing Cycles",
              items:
                data?.revenue_by_billing_cycle || [],
              key: "billing_cycle",
            },
            {
              title: "Payment Methods",
              items:
                data?.revenue_by_payment_method || [],
              key: "payment_method",
            },
          ].map((group) => (
            <article
              key={group.title}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <h2 className="font-bold text-[#0B1F33]">
                {group.title}
              </h2>

              <div className="mt-4 space-y-2.5">
                {group.items.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    No payment data yet.
                  </p>
                ) : (
                  group.items.map(
                    (item: Record<
                      string,
                      string | number
                    >) => (
                      <div
                        key={String(
                          item[group.key]
                        )}
                        className="rounded-xl bg-slate-50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-700">
                            {label(
                              String(
                                item[group.key]
                              )
                            )}
                          </span>
                          <span className="text-sm font-bold text-[#0B1F33]">
                            {money(
                              Number(item.revenue)
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {Number(
                            item.payment_count || 0
                          )}{" "}
                          payment(s)
                        </p>
                      </div>
                    )
                  )
                )}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Clock3
                size={19}
                className="text-amber-600"
              />
              <div>
                <h2 className="font-bold text-[#0B1F33]">
                  Upcoming Renewals
                </h2>
                <p className="text-xs text-slate-500">
                  Paid organizations expiring within
                  the next 30 days, plus overdue accounts
                </p>
              </div>
            </div>

            <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              {(data?.upcoming_renewals || []).length} due
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            {(data?.upcoming_renewals || []).length ===
            0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No renewals are due within the next
                30 days.
              </div>
            ) : (
              <table className="w-full min-w-[850px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">
                      Organization
                    </th>
                    <th className="px-3 py-3">
                      Plan
                    </th>
                    <th className="px-3 py-3">
                      Cycle
                    </th>
                    <th className="px-3 py-3">
                      Expected
                    </th>
                    <th className="px-3 py-3">
                      Expiry
                    </th>
                    <th className="px-3 py-3">
                      Renewal Status
                    </th>
                    <th className="px-3 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {(data?.upcoming_renewals || []).map(
                    (renewal) => {
                      const timing =
                        renewalTiming(
                          renewal.subscription_expires_at
                        );

                      return (
                        <tr
                          key={
                            renewal.organization_id
                          }
                          className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/super-admin/organizations/${renewal.organization_id}`
                                )
                              }
                              className="font-semibold text-[#0B1F33] hover:text-blue-600"
                            >
                              {
                                renewal.organization_name
                              }
                            </button>
                          </td>

                          <td className="px-3 py-3 capitalize text-slate-600">
                            {renewal.plan}
                          </td>

                          <td className="px-3 py-3 capitalize text-slate-600">
                            {
                              renewal.billing_cycle
                            }
                          </td>

                          <td className="px-3 py-3 font-bold text-slate-800">
                            {money(
                              renewal.expected_amount
                            )}
                          </td>

                          <td className="px-3 py-3 text-slate-600">
                            {date(
                              renewal.subscription_expires_at
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${timing.className}`}
                            >
                              {timing.text.includes(
                                "overdue"
                              ) && (
                                <AlertTriangle
                                  size={13}
                                />
                              )}
                              {timing.text}
                            </span>
                          </td>

                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/super-admin/organizations/${renewal.organization_id}`
                                )
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <CalendarDays
              size={19}
              className="text-blue-600"
            />
            <div>
              <h2 className="font-bold text-[#0B1F33]">
                Recent Subscription Payments
              </h2>
              <p className="text-xs text-slate-500">
                Latest 10 platform subscription
                payments
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {(data?.recent_payments || []).length ===
            0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No subscription payments have been
                recorded yet.
              </div>
            ) : (
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">
                      Organization
                    </th>
                    <th className="px-3 py-3">
                      Plan
                    </th>
                    <th className="px-3 py-3">
                      Cycle
                    </th>
                    <th className="px-3 py-3">
                      Amount
                    </th>
                    <th className="px-3 py-3">
                      Method
                    </th>
                    <th className="px-3 py-3">
                      Reference
                    </th>
                    <th className="px-3 py-3">
                      Paid
                    </th>
                    <th className="px-3 py-3">
                      Period
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_payments || []).map(
                    (payment) => (
                      <tr
                        key={payment.id}
                        className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/super-admin/organizations/${payment.organization_id}`
                              )
                            }
                            className="font-semibold text-[#0B1F33] hover:text-blue-600"
                          >
                            {
                              payment.organization_name
                            }
                          </button>
                        </td>
                        <td className="px-3 py-3 capitalize text-slate-600">
                          {payment.plan}
                        </td>
                        <td className="px-3 py-3 capitalize text-slate-600">
                          {payment.billing_cycle}
                        </td>
                        <td className="px-3 py-3 font-bold text-slate-800">
                          {money(payment.amount)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {label(
                            payment.payment_method
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-500">
                          {payment.payment_reference ||
                            "—"}
                        </td>
                        <td className="px-3 py-3 text-slate-500">
                          {date(payment.paid_at)}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {date(
                            payment.period_start
                          )}{" "}
                          –{" "}
                          {date(payment.period_end)}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default SuperAdminBilling;
