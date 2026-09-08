import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
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

function SuperAdminDashboard() {
  const navigate = useNavigate();

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

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      organizations,
      searchTerm,
      statusFilter,
    ]);

  const totalOrganizations =
    summary.organizations?.total ?? 0;
  const totalUsers =
    summary.users?.total ?? 0;
  const activeUsers =
    summary.users?.active ?? 0;

  const activeOrganizations =
    summary.organizations?.active ?? 0;

  const activityRate =
    totalOrganizations > 0
      ? Math.round(
          (activeOrganizations /
            totalOrganizations) *
            100
        )
      : 0;

  const cards = [
    {
      label: "Organizations",
      value: totalOrganizations,
      helper:
        "Registered businesses",
      icon: Building2,
      iconClass:
        "bg-blue-50 text-blue-600",
    },
    {
      label: "Active",
      value:
        summary.organizations?.active ??
        0,
      helper: `${activityRate}% of all organizations`,
      icon: CheckCircle2,
      iconClass:
        "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Trials",
      value:
        summary.organizations?.trial ??
        0,
      helper:
        "Organizations evaluating Invent POS",
      icon: Clock3,
      iconClass:
        "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Suspended",
      value:
        summary.organizations
          ?.suspended ?? 0,
      helper:
        "Access currently blocked",
      icon: ShieldAlert,
      iconClass:
        "bg-amber-50 text-amber-600",
    },
    {
      label: "Expired",
      value:
        summary.organizations?.expired ??
        0,
      helper:
        "Subscription renewal required",
      icon: XCircle,
      iconClass:
        "bg-rose-50 text-rose-600",
    },
    {
      label: "Active Users",
      value: activeUsers,
      helper: `${totalUsers} total platform users`,
      icon: Users,
      iconClass:
        "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      {/* TOP BAR */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B1F33] text-white shadow-sm">
              <ShieldCheck size={23} />
            </div>

            <div>
              <p className="text-base font-bold text-[#0B1F33]">
                Invent POS
              </p>
              <p className="text-xs font-medium text-slate-500">
                Platform Administration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                loadData(true)
              }
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>

            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            <button
              onClick={logout}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0B1F33] px-4 text-sm font-semibold text-white transition hover:bg-[#102A45]"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-7 lg:px-8 lg:py-9">
        {/* PAGE INTRO */}
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
              Platform Overview
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-[#0B1F33] lg:text-[34px]">
              Super Admin Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Monitor organizations,
              user access and subscription
              status across the Invent POS
              platform.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Activity
                size={17}
                className="text-emerald-500"
              />
              Platform operational
            </div>

            <button
              type="button"
              onClick={() => {
                setError("");
                resetOnboardForm();
                setShowOnboard(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus size={17} />
              Onboard Organization
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map(
            ({
              label,
              value,
              helper,
              icon: Icon,
              iconClass,
            }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]"
              >
                <div
                  className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
                >
                  <Icon size={20} />
                </div>

                <p className="text-sm font-medium text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-[#0B1F33]">
                  {value}
                </p>
                <p className="mt-2 min-h-[34px] text-xs leading-5 text-slate-400">
                  {helper}
                </p>
              </div>
            )
          )}
        </div>

        {/* ORGANIZATIONS */}
        <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-200 px-5 py-5 lg:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#0B1F33]">
                  Organizations
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage organization
                  access without exposing
                  tenant business records.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-[280px]">
                  <Search
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={searchTerm}
                    onChange={(e) =>
                      setSearchTerm(
                        e.target.value
                      )
                    }
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
                        e.target.value as
                          | "all"
                          | OrganizationStatus
                      )
                    }
                    className="min-w-[170px] appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">
                      All statuses
                    </option>
                    <option value="active">
                      Active
                    </option>
                    <option value="trial">
                      Trial
                    </option>
                    <option value="suspended">
                      Suspended
                    </option>
                    <option value="expired">
                      Expired
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
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
                <table className="w-full min-w-[1100px] text-left">
                  <thead>
                    <tr className="bg-[#F8FAFC] text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                      <th className="px-6 py-4">
                        Organization
                      </th>
                      <th className="px-6 py-4">
                        Status
                      </th>
                      <th className="px-6 py-4">
                        Users
                      </th>
                      <th className="px-6 py-4">
                        Trial
                      </th>
                      <th className="px-6 py-4">
                        Subscription
                      </th>
                      <th className="px-6 py-4 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredOrganizations.map(
                      (organization) => (
                        <tr
                          key={organization.id}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                                {organization.name
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((word) =>
                                    word
                                      .charAt(0)
                                      .toUpperCase()
                                  )
                                  .join("") ||
                                  "OR"}
                              </div>

                              <div>
                                <p className="font-semibold text-[#0B1F33]">
                                  {
                                    organization.name
                                  }
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {organization.email ||
                                    organization.slug}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${
                                statusStyles[
                                  organization
                                    .status
                                ]
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  statusDotStyles[
                                    organization
                                      .status
                                  ]
                                }`}
                              />
                              {
                                organization.status
                              }
                            </span>
                          </td>

                          <td className="px-6 py-5">
                            <p className="text-sm font-semibold text-slate-700">
                              {organization.active_user_count ??
                                0}{" "}
                              active
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {organization.user_count ??
                                0}{" "}
                              total users
                            </p>
                          </td>

                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <CalendarDays
                                size={15}
                                className="text-slate-400"
                              />
                              {formatDate(
                                organization.trial_ends_at
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <CalendarDays
                                size={15}
                                className="text-slate-400"
                              />
                              {formatDate(
                                organization.subscription_expires_at
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-5 text-right">
                            <button
                              onClick={() =>
                                openAccess(
                                  organization
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                            >
                              Manage
                              <ChevronRight
                                size={16}
                              />
                            </button>
                          </td>
                        </tr>
                      )
                    )}

                    {filteredOrganizations.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-16 text-center"
                        >
                          <Building2
                            size={32}
                            className="mx-auto text-slate-300"
                          />
                          <p className="mt-3 font-semibold text-slate-700">
                            No organizations
                            found
                          </p>
                          <p className="mt-1 text-sm text-slate-400">
                            Try another search
                            or status filter.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 bg-[#FBFCFE] px-6 py-4">
                <p className="text-sm text-slate-500">
                  Showing{" "}
                  <span className="font-semibold text-slate-700">
                    {
                      filteredOrganizations.length
                    }
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-slate-700">
                    {organizations.length}
                  </span>{" "}
                  organizations
                </p>

                <p className="text-xs text-slate-400">
                  Tenant data remains isolated
                </p>
              </div>
            </>
          )}
        </section>
      </main>

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
