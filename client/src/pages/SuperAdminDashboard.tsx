import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { superAdminFetch } from "../services/api";

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

type OrganizationStatus =
  | "active"
  | "trial"
  | "suspended"
  | "expired";

type Organization = {
  id: number;
  name: string;
  slug: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  currency?: string | null;
  status: OrganizationStatus;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
  subscription_plan?: string | null;
  billing_cycle?: string | null;
  user_count?: number;
  active_user_count?: number;
  created_at?: string;
  updated_at?: string;
};

const statusStyles: Record<
  OrganizationStatus,
  string
> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700",
  trial:
    "border-blue-200 bg-blue-50 text-blue-700",
  suspended:
    "border-amber-200 bg-amber-50 text-amber-700",
  expired:
    "border-rose-200 bg-rose-50 text-rose-700",
};

const statusDotStyles: Record<
  OrganizationStatus,
  string
> = {
  active: "bg-emerald-500",
  trial: "bg-blue-500",
  suspended: "bg-amber-500",
  expired: "bg-rose-500",
};

type SubscriptionPayment = {
  id: number;
  organization_id: number;
  plan?: string | null;
  billing_cycle?: string | null;
  amount: number;
  payment_method?: string | null;
  payment_reference?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [summary, setSummary] = useState<Summary>({});
  const [organizations, setOrganizations] =
    useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | OrganizationStatus>("all");

  const [editing, setEditing] =
    useState<Organization | null>(null);
  const [status, setStatus] =
    useState<OrganizationStatus>("active");
  const [trialEndsAt, setTrialEndsAt] =
    useState("");
  const [
    subscriptionExpiresAt,
    setSubscriptionExpiresAt,
  ] = useState("");
  const [saving, setSaving] = useState(false);

  const [showOnboard, setShowOnboard] =
    useState(false);
  const [onboarding, setOnboarding] =
    useState(false);
  const [onboardForm, setOnboardForm] =
    useState({
      organizationName: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
      status: "trial" as OrganizationStatus,
      trialEndsAt: "",
      subscriptionExpiresAt: "",
      phone: "",
      email: "",
      address: "",
    });

  const [billingOrganization, setBillingOrganization] =
    useState<Organization | null>(null);
  const [paymentHistory, setPaymentHistory] =
    useState<SubscriptionPayment[]>([]);
  const [billingLoading, setBillingLoading] =
    useState(false);
  const [recordingPayment, setRecordingPayment] =
    useState(false);
  const [paymentForm, setPaymentForm] = useState({
    subscriptionPlan: "starter",
    billingCycle: "monthly",
    amount: "",
    paymentMethod: "mpesa",
    paymentReference: "",
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: "",
  });

  const logout = () => {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdminUser");
    navigate("/super-admin/login", {
      replace: true,
    });
  };

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [
          summaryResponse,
          organizationsResponse,
        ] = await Promise.all([
          superAdminFetch(
            "/api/super-admin/summary"
          ),
          superAdminFetch(
            "/api/super-admin/organizations"
          ),
        ]);

        if (
          summaryResponse.status === 401 ||
          organizationsResponse.status === 401
        ) {
          logout();
          return;
        }

        const summaryData =
          await summaryResponse.json();

        const organizationsData =
          await organizationsResponse.json();

        if (!summaryResponse.ok) {
          throw new Error(
            summaryData.message ||
              "Could not load platform summary"
          );
        }

        if (!organizationsResponse.ok) {
          throw new Error(
            organizationsData.message ||
              "Could not load organizations"
          );
        }

        setSummary(summaryData);
        setOrganizations(
          Array.isArray(organizationsData)
            ? organizationsData
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load the Super Admin dashboard."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toDateInput = (
    value?: string | null
  ) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date
      .toISOString()
      .slice(0, 10);
  };

  const formatDate = (
    value?: string | null
  ) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString(
      "en-KE",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );
  };

  const formatPaymentMethod = (
    value?: string | null
  ) => {
    const method = String(value || "")
      .trim()
      .toLowerCase();

    if (method === "mpesa") return "M-Pesa";
    if (method === "bank") return "Bank";
    if (method === "card") return "Card";
    if (method === "cash") return "Cash";
    if (method === "other") return "Other";

    return value || "—";
  };

  const openAccess = (
    organization: Organization
  ) => {
    setEditing(organization);
    setStatus(
      organization.status || "active"
    );
    setTrialEndsAt(
      toDateInput(
        organization.trial_ends_at
      )
    );
    setSubscriptionExpiresAt(
      toDateInput(
        organization.subscription_expires_at
      )
    );
  };

  const saveAccess = async () => {
    if (!editing) return;

    try {
      setSaving(true);
      setError("");

      const response = await superAdminFetch(
        `/api/super-admin/organizations/${editing.id}/access`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            trialEndsAt:
              trialEndsAt || null,
            subscriptionExpiresAt:
              subscriptionExpiresAt ||
              null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not update organization access"
        );
      }

      setEditing(null);
      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update organization access."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetOnboardForm = () => {
    setOnboardForm({
      organizationName: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
      status: "trial",
      trialEndsAt: "",
      subscriptionExpiresAt: "",
      phone: "",
      email: "",
      address: "",
    });
  };

  const onboardOrganization = async () => {
    if (
      !onboardForm.organizationName.trim() ||
      !onboardForm.adminName.trim() ||
      !onboardForm.adminEmail.trim() ||
      !onboardForm.adminPassword
    ) {
      setError(
        "Organization name, Admin name, Admin email and Admin password are required."
      );
      return;
    }

    if (
      onboardForm.status === "trial" &&
      !onboardForm.trialEndsAt
    ) {
      setError(
        "Trial end date is required for a trial organization."
      );
      return;
    }

    try {
      setOnboarding(true);
      setError("");

      const response =
        await superAdminFetch(
          "/api/super-admin/organizations/onboard",
          {
            method: "POST",
            body: JSON.stringify({
              ...onboardForm,
              trialEndsAt:
                onboardForm.trialEndsAt ||
                null,
              subscriptionExpiresAt:
                onboardForm.subscriptionExpiresAt ||
                null,
            }),
          }
        );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not onboard organization"
        );
      }

      setShowOnboard(false);
      resetOnboardForm();
      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not onboard organization."
      );
    } finally {
      setOnboarding(false);
    }
  };

  const calculatePeriodEnd = (
    periodStart: string,
    billingCycle: string
  ) => {
    if (!periodStart) return "";

    const start = new Date(
      `${periodStart}T00:00:00`
    );

    if (Number.isNaN(start.getTime())) {
      return "";
    }

    const end = new Date(start);

    if (billingCycle === "monthly") {
      end.setMonth(end.getMonth() + 1);
    } else if (
      billingCycle === "quarterly"
    ) {
      end.setMonth(end.getMonth() + 3);
    } else if (
      billingCycle === "annual"
    ) {
      end.setFullYear(
        end.getFullYear() + 1
      );
    } else {
      return "";
    }

    end.setDate(end.getDate() - 1);

    const year = end.getFullYear();
    const month = String(
      end.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      end.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const openBilling = async (
    organization: Organization
  ) => {
    setBillingOrganization(organization);
    setError("");
    setBillingLoading(true);
    setPaymentHistory([]);
    const defaultPeriodStart =
      new Date()
        .toISOString()
        .slice(0, 10);

    const defaultBillingCycle =
      organization.billing_cycle ||
      "monthly";

    setPaymentForm({
      subscriptionPlan:
        organization.subscription_plan ||
        "starter",
      billingCycle:
        defaultBillingCycle,
      amount: "",
      paymentMethod: "mpesa",
      paymentReference: "",
      periodStart:
        defaultPeriodStart,
      periodEnd:
        calculatePeriodEnd(
          defaultPeriodStart,
          defaultBillingCycle
        ),
    });

    try {
      const response = await superAdminFetch(
        `/api/super-admin/organizations/${organization.id}/subscription-payments`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not load payment history"
        );
      }

      setPaymentHistory(
        Array.isArray(data) ? data : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load payment history."
      );
    } finally {
      setBillingLoading(false);
    }
  };

  const recordPayment = async () => {
    if (!billingOrganization) return;

    const amount = Number(paymentForm.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    if (
      !paymentForm.periodStart ||
      !paymentForm.periodEnd
    ) {
      setError(
        "Payment period start and end dates are required."
      );
      return;
    }

    try {
      setRecordingPayment(true);
      setError("");

      const response = await superAdminFetch(
        `/api/super-admin/organizations/${billingOrganization.id}/subscription-payments`,
        {
          method: "POST",
          body: JSON.stringify({
            plan:
              paymentForm.subscriptionPlan,
            billingCycle:
              paymentForm.billingCycle,
            amount,
            paymentMethod:
              paymentForm.paymentMethod,
            paymentReference:
              paymentForm.paymentReference ||
              null,
            periodStart:
              paymentForm.periodStart,
            periodEnd:
              paymentForm.periodEnd,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not record subscription payment"
        );
      }

      await loadData(true);
      await openBilling({
        ...billingOrganization,
        status: "active",
        subscription_plan:
          paymentForm.subscriptionPlan,
        billing_cycle:
          paymentForm.billingCycle,
        subscription_expires_at:
          paymentForm.periodEnd,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not record subscription payment."
      );
    } finally {
      setRecordingPayment(false);
    }
  };

  const filteredOrganizations =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      return organizations.filter(
        (organization) => {
          const matchesSearch =
            !normalizedSearch ||
            organization.name
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            organization.slug
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            (organization.email || "")
              .toLowerCase()
              .includes(
                normalizedSearch
              );

          const matchesStatus =
            statusFilter === "all" ||
            organization.status ===
              statusFilter;

          return matchesSearch && matchesStatus;
        }
      );
    }, [organizations, searchTerm, statusFilter]);

  const totalOrganizations = summary.organizations?.total ?? organizations.length;
  const activeOrganizations = summary.organizations?.active ?? 0;
  const totalUsers = summary.users?.total ?? 0;
  const activeUsers = summary.users?.active ?? 0;
  const activityRate = totalOrganizations > 0
    ? Math.round((activeOrganizations / totalOrganizations) * 100)
    : 0;

  const navItems = [
    {
      label: "Overview",
      icon: LayoutDashboard,
      path: "/super-admin/dashboard",
      active: true,
    },
    {
      label: "Organizations",
      icon: Building2,
      path: "/super-admin/dashboard#organizations",
    },
    {
      label: "Billing & Revenue",
      icon: BarChart3,
      path: "/super-admin/billing",
    },
    {
      label: "Plans",
      icon: PackageCheck,
      path: "/super-admin/plans",
    },
    {
      label: "Support Center",
      icon: Headphones,
      path: "/super-admin/support",
    },
  ];

  const navigateFromSidebar = (path: string) => {
    setMobileNavOpen(false);

    if (path === "/super-admin/dashboard#organizations") {
      const section = document.getElementById("organizations");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    navigate(path);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-[#081B2C] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[84px] items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/30">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-[17px] font-bold tracking-tight">Invent POS</p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                Platform Admin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Platform
          </p>

          <nav className="space-y-1.5">
            {navItems.map(({ label, icon: Icon, path, active }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigateFromSidebar(path)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20"
                    : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mx-4 mt-auto mb-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <p className="text-sm font-semibold text-slate-200">
              Platform operational
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Core administration services are available.
          </p>
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[272px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="flex h-[72px] items-center justify-between px-5 lg:px-8 xl:px-10">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden"
              >
                <Menu size={19} />
              </button>
              <div>
                <p className="text-sm font-bold text-[#0B1F33]">
                  Overview
                </p>
                <p className="hidden text-xs text-slate-400 sm:block">
                  Invent POS platform administration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setError("");
                  resetOnboardForm();
                  setShowOnboard(true);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Onboard Organization</span>
                <span className="sm:hidden">Onboard</span>
              </button>
            </div>
          </div>
        </header>

        <main className="px-5 py-7 lg:px-8 lg:py-8 xl:px-10">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-7">
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
                    onClick={() => setStatusFilter("expired")}
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
                    onClick={() => setStatusFilter("suspended")}
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
                    onClick={() => navigate("/super-admin/support")}
                    className="flex w-full items-center justify-between rounded-xl bg-blue-50/70 px-4 py-3 text-left transition hover:bg-blue-50"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <Headphones size={17} className="text-blue-600" />
                      Review customer support
                    </span>
                    <ChevronRight size={16} className="text-blue-500" />
                  </button>
                </div>
              </section>
            </div>

            <section
              id="organizations"
              className="mt-5 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.035)]"
            >
              <div className="border-b border-slate-200 px-5 py-5 lg:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#0B1F33]">
                      Organizations
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Manage organization access without exposing tenant
                      business records.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-[260px]">
                      <Search
                        size={17}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search organization..."
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="relative">
                      <SlidersHorizontal
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <select
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(
                            e.target.value as "all" | OrganizationStatus
                          )
                        }
                        className="min-w-[165px] appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="trial">Trial</option>
                        <option value="suspended">Suspended</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
                    <p className="mt-4 text-sm text-slate-500">
                      Loading organizations...
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] text-left">
                      <thead>
                        <tr className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          <th className="px-6 py-3.5">Organization</th>
                          <th className="px-6 py-3.5">Status</th>
                          <th className="px-6 py-3.5">Plan</th>
                          <th className="px-6 py-3.5">Users</th>
                          <th className="px-6 py-3.5">Subscription</th>
                          <th className="px-6 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {filteredOrganizations.map((organization) => (
                          <tr
                            key={organization.id}
                            className="transition hover:bg-slate-50/70"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">
                                  {organization.name
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((word) => word.charAt(0).toUpperCase())
                                    .join("") || "OR"}
                                </div>
                                <div>
                                  <p className="font-semibold text-[#0B1F33]">
                                    {organization.name}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-400">
                                    {organization.email || organization.slug}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${
                                  statusStyles[organization.status]
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    statusDotStyles[organization.status]
                                  }`}
                                />
                                {organization.status}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold capitalize text-slate-700">
                                {organization.subscription_plan || "—"}
                              </p>
                              <p className="mt-0.5 text-xs capitalize text-slate-400">
                                {organization.billing_cycle || "No billing cycle"}
                              </p>
                            </td>

                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold text-slate-700">
                                {organization.active_user_count ?? 0} active
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {organization.user_count ?? 0} total
                              </p>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <CalendarDays size={14} className="text-slate-400" />
                                {formatDate(organization.subscription_expires_at)}
                              </div>
                            </td>

                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openBilling(organization)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  <CreditCard size={14} />
                                  Billing
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/super-admin/organizations/${organization.id}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F33] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#102A45]"
                                >
                                  View
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {filteredOrganizations.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-14 text-center">
                              <Building2
                                size={30}
                                className="mx-auto text-slate-300"
                              />
                              <p className="mt-3 font-semibold text-slate-700">
                                No organizations found
                              </p>
                              <p className="mt-1 text-sm text-slate-400">
                                Try another search or status filter.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-200 bg-[#FBFCFE] px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                      Showing{" "}
                      <span className="font-semibold text-slate-700">
                        {filteredOrganizations.length}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-slate-700">
                        {organizations.length}
                      </span>{" "}
                      organizations
                    </p>
                    <p className="text-xs text-slate-400">
                      Tenant business data remains isolated
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        </main>
      </div>

      {/* ONBOARD ORGANIZATION MODAL */}
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071421]/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                  Customer Onboarding
                </p>
                <h3 className="mt-1 text-xl font-bold text-[#0B1F33]">
                  New Invent POS Organization
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Create the business workspace and its first Admin account.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowOnboard(false)
                }
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div>
                <p className="mb-3 text-sm font-bold text-[#0B1F33]">
                  Business Information
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Organization Name *
                    </label>
                    <input
                      value={
                        onboardForm.organizationName
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            organizationName:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="e.g. Acme Retail Ltd"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Business Phone
                    </label>
                    <input
                      value={
                        onboardForm.phone
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            phone:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="0712 345 678"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Business Email
                    </label>
                    <input
                      type="email"
                      value={
                        onboardForm.email
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            email:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="info@business.com"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Address / Location
                    </label>
                    <input
                      value={
                        onboardForm.address
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            address:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="Business location"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <p className="mb-3 text-sm font-bold text-[#0B1F33]">
                  First Admin Account
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Admin Name *
                    </label>
                    <input
                      value={
                        onboardForm.adminName
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            adminName:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="Full name"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Admin Email *
                    </label>
                    <input
                      type="email"
                      value={
                        onboardForm.adminEmail
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            adminEmail:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="admin@business.com"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Temporary Password *
                    </label>
                    <input
                      type="password"
                      value={
                        onboardForm.adminPassword
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            adminPassword:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <p className="mb-3 text-sm font-bold text-[#0B1F33]">
                  Access & Subscription
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Starting Status *
                    </label>
                    <select
                      value={
                        onboardForm.status
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            status:
                              e.target
                                .value as OrganizationStatus,
                          })
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="trial">
                        Trial
                      </option>
                      <option value="active">
                        Active
                      </option>
                      <option value="suspended">
                        Suspended
                      </option>
                      <option value="expired">
                        Expired
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Trial End Date
                    </label>
                    <input
                      type="date"
                      value={
                        onboardForm.trialEndsAt
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            trialEndsAt:
                              e.target.value,
                          })
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Subscription Expiry
                    </label>
                    <input
                      type="date"
                      value={
                        onboardForm.subscriptionExpiresAt
                      }
                      onChange={(e) =>
                        setOnboardForm(
                          (current) => ({
                            ...current,
                            subscriptionExpiresAt:
                              e.target.value,
                          })
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {onboardForm.status ===
                  "trial" && (
                  <p className="mt-2 text-xs font-medium text-blue-600">
                    Trial organizations require
                    a trial end date.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-blue-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      Tenant isolation starts immediately
                    </p>
                    <p className="mt-1 text-xs leading-5 text-blue-700">
                      The new organization receives
                      its own organization ID and its
                      first Admin is assigned only to
                      that tenant.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setShowOnboard(false)
                }
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={onboarding}
                onClick={
                  onboardOrganization
                }
                className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {onboarding
                  ? "Creating..."
                  : "Create Organization"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BILLING MODAL */}
      {billingOrganization && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071421]/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">
                  Subscription Billing
                </p>
                <h3 className="mt-1 text-xl font-bold text-[#0B1F33]">
                  {billingOrganization.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Record a subscription payment and review billing history.
                </p>
              </div>
              <button
                onClick={() =>
                  setBillingOrganization(null)
                }
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_1.15fr]">
              <div>
                <h4 className="mb-4 font-bold text-[#0B1F33]">
                  Record Payment
                </h4>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Plan
                      </label>
                      <select
                        value={paymentForm.subscriptionPlan}
                        onChange={(e) =>
                          setPaymentForm((current) => ({
                            ...current,
                            subscriptionPlan: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                      >
                        <option value="starter">Starter</option>
                        <option value="business">Business</option>
                        <option value="pro">Pro</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Billing Cycle
                      </label>
                      <select
                        value={paymentForm.billingCycle}
                        onChange={(e) =>
                          setPaymentForm((current) => {
                            const nextCycle =
                              e.target.value;

                            return {
                              ...current,
                              billingCycle:
                                nextCycle,
                              periodEnd:
                                calculatePeriodEnd(
                                  current.periodStart,
                                  nextCycle
                                ),
                            };
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Amount (KES)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(e) =>
                        setPaymentForm((current) => ({
                          ...current,
                          amount: e.target.value,
                        }))
                      }
                      placeholder="e.g. 2500"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Payment Method
                      </label>
                      <select
                        value={paymentForm.paymentMethod}
                        onChange={(e) =>
                          setPaymentForm((current) => ({
                            ...current,
                            paymentMethod: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                      >
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">Cash</option>
                        <option value="bank">Bank</option>
                        <option value="card">Card</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Reference
                      </label>
                      <input
                        value={paymentForm.paymentReference}
                        onChange={(e) =>
                          setPaymentForm((current) => ({
                            ...current,
                            paymentReference: e.target.value,
                          }))
                        }
                        placeholder="M-Pesa code / receipt"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Period Start
                      </label>
                      <input
                        type="date"
                        value={paymentForm.periodStart}
                        onChange={(e) =>
                          setPaymentForm((current) => {
                            const nextStart =
                              e.target.value;

                            return {
                              ...current,
                              periodStart:
                                nextStart,
                              periodEnd:
                                calculatePeriodEnd(
                                  nextStart,
                                  current.billingCycle
                                ),
                            };
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Period End
                      </label>
                      <input
                        type="date"
                        value={paymentForm.periodEnd}
                        onChange={(e) =>
                          setPaymentForm((current) => ({
                            ...current,
                            periodEnd: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={recordingPayment}
                    onClick={recordPayment}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {recordingPayment
                      ? "Recording..."
                      : "Record Payment & Activate"}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <Clock3 size={21} />
                    </div>

                    <div>
                      <h4 className="font-bold text-[#0B1F33]">
                        Payment History
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500">
                        All subscription payments for this organization
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    {paymentHistory.length}{" "}
                    {paymentHistory.length === 1
                      ? "record"
                      : "records"}
                  </span>
                </div>

                {billingLoading ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    Loading payments...
                  </p>
                ) : paymentHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
                    <CreditCard
                      size={28}
                      className="mx-auto text-slate-300"
                    />
                    <p className="mt-3 text-sm font-semibold text-slate-600">
                      No subscription payments yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentHistory.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_14px_rgba(15,23,42,0.035)]"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <CheckCircle2 size={22} />
                            </div>

                            <div className="min-w-0">
                              <p className="text-xl font-bold tracking-tight text-[#0B1F33]">
                                KES{" "}
                                {Number(payment.amount || 0).toLocaleString(
                                  "en-KE",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </p>

                              <p className="mt-1 text-sm text-slate-500">
                                <span className="font-medium capitalize text-slate-600">
                                  {payment.plan || "—"} Plan
                                </span>
                                <span className="mx-2 text-slate-300">
                                  •
                                </span>
                                <span className="capitalize">
                                  {payment.billing_cycle || "—"}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-start gap-3 sm:flex-col sm:items-end">
                            <span className="text-sm font-medium text-slate-500">
                              {formatDate(
                                payment.paid_at ||
                                  payment.created_at
                              )}
                            </span>

                            <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              Completed
                            </span>
                          </div>
                        </div>

                        <div className="my-4 border-t border-slate-100" />

                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-slate-400">
                              <CalendarDays size={18} />
                            </div>

                            <div>
                              <p className="text-xs font-medium text-slate-400">
                                Period
                              </p>
                              <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">
                                {formatDate(payment.period_start)}
                                {" – "}
                                {formatDate(payment.period_end)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-slate-400">
                              <Smartphone size={18} />
                            </div>

                            <div>
                              <p className="text-xs font-medium text-slate-400">
                                Payment Method
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-700">
                                {formatPaymentMethod(
                                  payment.payment_method
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-slate-400">
                              <FileText size={18} />
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-400">
                                Reference
                              </p>
                              <p className="mt-1 break-all text-sm font-semibold text-slate-700">
                                {payment.payment_reference || "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACCESS MODAL */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071421]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                  Organization Access
                </p>
                <h3 className="mt-1 text-xl font-bold text-[#0B1F33]">
                  {editing.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {editing.email ||
                    editing.slug}
                </p>
              </div>

              <button
                onClick={() =>
                  setEditing(null)
                }
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Account Status
                </label>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      "active",
                      "trial",
                      "suspended",
                      "expired",
                    ] as OrganizationStatus[]
                  ).map((option) => (
                    <button
                      type="button"
                      key={option}
                      onClick={() =>
                        setStatus(option)
                      }
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize transition ${
                        status === option
                          ? statusStyles[
                              option
                            ] +
                            " ring-2 ring-offset-1"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Trial End Date
                  </label>
                  <input
                    type="date"
                    value={trialEndsAt}
                    onChange={(e) =>
                      setTrialEndsAt(
                        e.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Subscription Expiry
                  </label>
                  <input
                    type="date"
                    value={
                      subscriptionExpiresAt
                    }
                    onChange={(e) =>
                      setSubscriptionExpiresAt(
                        e.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-blue-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      Access management only
                    </p>
                    <p className="mt-1 text-xs leading-5 text-blue-700">
                      These controls affect
                      organization login
                      access and subscription
                      status. Sales,
                      customers, inventory and
                      other tenant business
                      records remain isolated.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setEditing(null)
                }
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={saveAccess}
                className="flex-1 rounded-xl bg-[#0B1F33] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#102A45] disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : "Save Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminDashboard;
