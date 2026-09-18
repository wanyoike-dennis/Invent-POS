import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  Headphones,
  RefreshCw,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { superAdminFetch } from "../services/api";
import { formatDate } from "../utils/dateTime";

type Summary = {
  organizations?: {
    total?: number;
    active?: number;
    trial?: number;
    suspended?: number;
    expired?: number;
  };
  users?: {
    total?: number;
    active?: number;
  };
};

type Organization = {
  id: number;
  name: string;
  slug: string;
  status: "active" | "trial" | "suspended" | "expired";
  user_count?: number;
  active_user_count?: number;
};

type UpcomingRenewal = {
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  status: string;
  plan: string;
  billing_cycle: string;
  expected_amount: number;
  subscription_expires_at: string;
};

type RecentPayment = {
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
};

type BillingOverview = {
  totals?: {
    total_revenue?: number;
    total_payments?: number;
    revenue_this_month?: number;
    payments_this_month?: number;
  };
  recurring_revenue?: {
    mrr?: number;
    arr?: number;
  };
  upcoming_renewals?: UpcomingRenewal[];
  recent_payments?: RecentPayment[];
};

type SupportOverview = {
  counts?: {
    total?: number;
    open?: number;
    inProgress?: number;
    waitingCustomer?: number;
    resolved?: number;
    closed?: number;
    urgent?: number;
  };
};

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary>({});
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [billingOverview, setBillingOverview] = useState<BillingOverview>({});
  const [supportOverview, setSupportOverview] = useState<SupportOverview>({});

  const logout = useCallback(() => {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdminUser");
    navigate("/super-admin/login", { replace: true });
  }, [navigate]);

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        setError("");

        const [
          summaryResponse,
          organizationsResponse,
          billingResponse,
          supportResponse,
        ] = await Promise.all([
          superAdminFetch("/api/super-admin/summary"),
          superAdminFetch("/api/super-admin/organizations"),
          superAdminFetch("/api/super-admin/billing/summary?months=6"),
          superAdminFetch("/api/super-admin/support/overview"),
        ]);

        if (
          summaryResponse.status === 401 ||
          organizationsResponse.status === 401 ||
          billingResponse.status === 401 ||
          supportResponse.status === 401
        ) {
          logout();
          return;
        }

        const summaryData = await summaryResponse.json();
        const organizationsData = await organizationsResponse.json();
        const billingData = await billingResponse.json();
        const supportData = await supportResponse.json();

        if (!summaryResponse.ok) {
          throw new Error(summaryData.message || "Could not load platform summary");
        }

        if (!organizationsResponse.ok) {
          throw new Error(organizationsData.message || "Could not load organizations");
        }

        setSummary(summaryData);
        setOrganizations(Array.isArray(organizationsData) ? organizationsData : []);
        setBillingOverview(billingResponse.ok ? billingData || {} : {});
        setSupportOverview(supportResponse.ok ? supportData || {} : {});
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load the Super Admin dashboard."
        );
      } finally {
        setRefreshing(false);
      }
    },
    [logout]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);


  const renewalTiming = (value?: string | null) => {
    if (!value) {
      return { text: "No expiry date", className: "bg-slate-100 text-slate-600" };
    }

    const expiry = kenyaDateKey(value);
    const today = kenyaDateKey(new Date());

    if (!expiry || !today) {
      return { text: "Invalid date", className: "bg-slate-100 text-slate-600" };
    }

    const days = dayDifference(today, expiry);

    if (days < 0) {
      const overdue = Math.abs(days);
      return {
        text: `${overdue} day${overdue === 1 ? "" : "s"} overdue`,
        className: "bg-rose-50 text-rose-700",
      };
    }

    if (days === 0) {
      return { text: "Due today", className: "bg-amber-50 text-amber-700" };
    }

    if (days <= 7) {
      return {
        text: `Expires in ${days} day${days === 1 ? "" : "s"}`,
        className: "bg-amber-50 text-amber-700",
      };
    }

    return {
      text: `Expires in ${days} days`,
      className: "bg-blue-50 text-blue-700",
    };
  };

  const totalOrganizations =
    summary.organizations?.total ?? organizations.length;
  const activeOrganizations = summary.organizations?.active ?? 0;
  const totalUsers = summary.users?.total ?? 0;
  const activeUsers = summary.users?.active ?? 0;
  const activityRate =
    totalOrganizations > 0
      ? Math.round((activeOrganizations / totalOrganizations) * 100)
      : 0;

  return (
    <>
      <main className="px-5 py-7 lg:px-8 lg:py-8 xl:px-10">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                    Platform Overview
                  </p>
                </div>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0B1F33] lg:text-[34px]">
                  Super Admin Dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Monitor organizations, user access and subscription status
                  across the Invent POS platform.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  disabled={refreshing}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw
                    size={16}
                    className={refreshing ? "animate-spin" : ""}
                  />
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/super-admin/organizations")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Building2 size={16} />
                  Manage Organizations
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
                <span>{error}</span>
                <button type="button" onClick={() => setError("")}>
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Organizations",
                  value: totalOrganizations,
                  helper: "Registered businesses",
                  icon: Building2,
                  iconClass: "bg-blue-50 text-blue-600",
                },
                {
                  label: "Active Organizations",
                  value: activeOrganizations,
                  helper: `${activityRate}% of all organizations`,
                  icon: CheckCircle2,
                  iconClass: "bg-emerald-50 text-emerald-600",
                },
                {
                  label: "Active Users",
                  value: activeUsers,
                  helper: `${totalUsers} total platform users`,
                  icon: Users,
                  iconClass: "bg-violet-50 text-violet-600",
                },
                {
                  label: "Requires Attention",
                  value:
                    (summary.organizations?.suspended ?? 0) +
                    (summary.organizations?.expired ?? 0),
                  helper: "Suspended or expired accounts",
                  icon: ShieldAlert,
                  iconClass: "bg-amber-50 text-amber-600",
                },
              ].map(({ label, value, helper, icon: Icon, iconClass }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">
                        {label}
                      </p>
                      <p className="mt-2 text-[30px] font-bold tracking-tight text-[#0B1F33]">
                        {value}
                      </p>
                    </div>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
                      <Icon size={19} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-medium text-slate-400">
                    {helper}
                  </p>
                </div>
              ))}
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.035)]">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <div>
                  <h2 className="font-bold text-[#0B1F33]">Revenue Snapshot</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Current subscription revenue performance across the platform
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/super-admin/billing")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  View Billing
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "MRR",
                    value: billingOverview.recurring_revenue?.mrr ?? 0,
                    helper: "Monthly recurring revenue",
                    icon: Activity,
                    iconClass: "bg-blue-50 text-blue-600",
                  },
                  {
                    label: "ARR",
                    value: billingOverview.recurring_revenue?.arr ?? 0,
                    helper: "Annual recurring revenue",
                    icon: CalendarDays,
                    iconClass: "bg-violet-50 text-violet-600",
                  },
                  {
                    label: "This Month",
                    value: billingOverview.totals?.revenue_this_month ?? 0,
                    helper: `${billingOverview.totals?.payments_this_month ?? 0} payment${
                      (billingOverview.totals?.payments_this_month ?? 0) === 1 ? "" : "s"
                    } this month`,
                    icon: CreditCard,
                    iconClass: "bg-emerald-50 text-emerald-600",
                  },
                  {
                    label: "Total Revenue",
                    value: billingOverview.totals?.total_revenue ?? 0,
                    helper: `${billingOverview.totals?.total_payments ?? 0} total payment${
                      (billingOverview.totals?.total_payments ?? 0) === 1 ? "" : "s"
                    }`,
                    icon: FileText,
                    iconClass: "bg-amber-50 text-amber-600",
                  },
                ].map(({ label, value, helper, icon: Icon, iconClass }) => (
                  <div key={label} className="bg-white px-5 py-4 lg:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                          {label}
                        </p>
                        <p className="mt-2 text-2xl font-bold tracking-tight text-[#0B1F33]">
                          {formatMoney(value)}
                        </p>
                        <p className="mt-1.5 text-xs font-medium text-slate-400">
                          {helper}
                        </p>
                      </div>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
                        <Icon size={17} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_1fr]">
              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-[#0B1F33]">
                      Subscription Health
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Current organization access status
                    </p>
                  </div>
                  <Activity size={19} className="text-slate-300" />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    {
                      label: "Active",
                      value: summary.organizations?.active ?? 0,
                      icon: CheckCircle2,
                      className: "text-emerald-600 bg-emerald-50",
                    },
                    {
                      label: "Trials",
                      value: summary.organizations?.trial ?? 0,
                      icon: Clock3,
                      className: "text-blue-600 bg-blue-50",
                    },
                    {
                      label: "Suspended",
                      value: summary.organizations?.suspended ?? 0,
                      icon: ShieldAlert,
                      className: "text-amber-600 bg-amber-50",
                    },
                    {
                      label: "Expired",
                      value: summary.organizations?.expired ?? 0,
                      icon: XCircle,
                      className: "text-rose-600 bg-rose-50",
                    },
                  ].map(({ label, value, icon: Icon, className }) => (
                    <div key={label} className="rounded-xl bg-slate-50/80 p-3.5">
                      <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${className}`}>
                        <Icon size={16} />
                      </div>
                      <p className="text-xl font-bold text-[#0B1F33]">{value}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-[#0B1F33]">
                      Needs Attention
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Platform access items to review
                    </p>
                  </div>
                  <ShieldAlert size={19} className="text-amber-500" />
                </div>

                <div className="mt-4 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => navigate("/super-admin/organizations?status=expired")}
                    className="flex w-full items-center justify-between rounded-xl bg-rose-50/70 px-4 py-3 text-left transition hover:bg-rose-50"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <XCircle size={17} className="text-rose-500" />
                      Expired subscriptions
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-rose-600 shadow-sm">
                      {summary.organizations?.expired ?? 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/super-admin/organizations?status=suspended")}
                    className="flex w-full items-center justify-between rounded-xl bg-amber-50/70 px-4 py-3 text-left transition hover:bg-amber-50"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <ShieldAlert size={17} className="text-amber-500" />
                      Suspended organizations
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-600 shadow-sm">
                      {summary.organizations?.suspended ?? 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/super-admin/support?status=open")}
                    className="flex w-full items-center justify-between rounded-xl bg-blue-50/70 px-4 py-3 text-left transition hover:bg-blue-50"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <Headphones size={17} className="text-blue-600" />
                      Open support tickets
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-blue-600 shadow-sm">
                      {supportOverview.counts?.open ?? 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/super-admin/support?priority=urgent")}
                    className="flex w-full items-center justify-between rounded-xl bg-violet-50/70 px-4 py-3 text-left transition hover:bg-violet-50"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <AlertTriangle size={17} className="text-violet-600" />
                      Urgent support tickets
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-violet-600 shadow-sm">
                      {supportOverview.counts?.urgent ?? 0}
                    </span>
                  </button>
                </div>
              </section>
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.035)]">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <div>
                  <h2 className="font-bold text-[#0B1F33]">Upcoming Renewals</h2>
                  <p className="mt-1 text-xs text-slate-400">Subscriptions due within the next 30 days, including overdue accounts</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/super-admin/billing")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  View Billing
                  <ChevronRight size={16} />
                </button>
              </div>

              {(billingOverview.upcoming_renewals || []).length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <CalendarDays size={28} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">No upcoming renewals</p>
                  <p className="mt-1 text-xs text-slate-400">There are no subscriptions due within the current renewal window.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        <th className="px-6 py-3.5">Organization</th>
                        <th className="px-6 py-3.5">Plan</th>
                        <th className="px-6 py-3.5">Renewal</th>
                        <th className="px-6 py-3.5">Timing</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(billingOverview.upcoming_renewals || []).slice(0, 5).map((renewal) => {
                        const timing = renewalTiming(renewal.subscription_expires_at);
                        return (
                          <tr key={renewal.organization_id} className="transition hover:bg-slate-50/70">
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => navigate(`/super-admin/organizations/${renewal.organization_id}`)}
                                className="font-semibold text-[#0B1F33] transition hover:text-blue-600"
                              >
                                {renewal.organization_name}
                              </button>
                              <p className="mt-0.5 text-xs text-slate-400">{renewal.organization_slug}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold capitalize text-slate-700">{renewal.plan || "—"}</p>
                              <p className="mt-0.5 text-xs capitalize text-slate-400">{renewal.billing_cycle || "—"}</p>
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-slate-600">
                              {formatDate(renewal.subscription_expires_at)}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${timing.className}`}>
                                {timing.text.includes("overdue") && <AlertTriangle size={13} />}
                                {timing.text}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => navigate(`/super-admin/organizations/${renewal.organization_id}`)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                              >
                                Manage
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.035)]">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <div>
                  <h2 className="font-bold text-[#0B1F33]">Recent Payments</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Latest subscription payments recorded across the platform
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/super-admin/billing")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  View Billing
                  <ChevronRight size={16} />
                </button>
              </div>

              {(billingOverview.recent_payments || []).length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <CreditCard size={28} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    No subscription payments yet
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Recorded subscription payments will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left">
                    <thead>
                      <tr className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        <th className="px-6 py-3.5">Organization</th>
                        <th className="px-6 py-3.5">Plan</th>
                        <th className="px-6 py-3.5">Amount</th>
                        <th className="px-6 py-3.5">Method</th>
                        <th className="px-6 py-3.5">Paid</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {(billingOverview.recent_payments || [])
                        .slice(0, 5)
                        .map((payment) => (
                          <tr
                            key={payment.id}
                            className="transition hover:bg-slate-50/70"
                          >
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/super-admin/organizations/${payment.organization_id}`
                                  )
                                }
                                className="font-semibold text-[#0B1F33] transition hover:text-blue-600"
                              >
                                {payment.organization_name}
                              </button>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {payment.organization_slug}
                              </p>
                            </td>

                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold capitalize text-slate-700">
                                {payment.plan || "—"}
                              </p>
                              <p className="mt-0.5 text-xs capitalize text-slate-400">
                                {payment.billing_cycle || "—"}
                              </p>
                            </td>

                            <td className="px-6 py-4 text-sm font-bold text-[#0B1F33]">
                              {formatMoney(payment.amount)}
                            </td>

                            <td className="px-6 py-4">
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                                {(payment.payment_method || "—")
                                  .replaceAll("_", " ")}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-slate-600">
                                {paymentTiming(payment.paid_at)}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {formatDate(payment.paid_at)}
                              </p>
                            </td>

                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/super-admin/organizations/${payment.organization_id}`
                                  )
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                              >
                                View
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
      </main>
    </>
  );
}

export default SuperAdminDashboard;

const formatMoney = (value?: number | null) =>
  `KES ${new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))}`;

const KENYA_TIME_ZONE = "Africa/Nairobi";

const kenyaDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KENYA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const dayDifference = (fromKey: string, toKey: string) => {
  const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
  const [toYear, toMonth, toDay] = toKey.split("-").map(Number);

  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86400000
  );
};

const paymentTiming = (value?: string | null) => {
  if (!value) return "—";

  const paid = kenyaDateKey(value);
  const today = kenyaDateKey(new Date());

  if (!paid || !today) return "—";

  const days = dayDifference(paid, today);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return formatDate(value);
};
