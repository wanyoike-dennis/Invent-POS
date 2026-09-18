import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { apiFetch } from "../services/api";
import { formatDateTime } from "../utils/dateTime";

type Branch = {
  id: number;
  name: string;
  code: string | null;
  is_active?: number;
};

type StaffUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active?: number;
  branch_id?: number | null;
};

type AuditEvent = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: number;
    name: string | null;
    email: string | null;
    role: string | null;
  } | null;
  branch: {
    id: number;
    name: string | null;
    code: string | null;
  } | null;
};

type AuditOptions = {
  branches: Branch[];
  users: StaffUser[];
  actions: string[];
  entityTypes: string[];
};

type AuditSummary = {
  summary: {
    totalEvents: number;
    activeUsers: number;
    affectedBranches: number;
    actionTypes: number;
  };
  byAction: Array<{ action: string; total: number }>;
  byEntityType: Array<{ entity_type: string; total: number }>;
  dailyActivity: Array<{ date: string; total: number }>;
};

type AuditFeed = {
  scope: {
    type: "branch" | "all_branches";
    branch: Branch | null;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  events: AuditEvent[];
};

const emptyOptions: AuditOptions = {
  branches: [],
  users: [],
  actions: [],
  entityTypes: [],
};

const emptySummary: AuditSummary = {
  summary: {
    totalEvents: 0,
    activeUsers: 0,
    affectedBranches: 0,
    actionTypes: 0,
  },
  byAction: [],
  byEntityType: [],
  dailyActivity: [],
};

const formatAction = (action: string) =>
  action
    .split(".")
    .map((part) =>
      part
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    )
    .join(" · ");

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong";
};

export default function AuditAnalytics() {
  const [options, setOptions] = useState<AuditOptions>(emptyOptions);
  const [summary, setSummary] = useState<AuditSummary>(emptySummary);
  const [feed, setFeed] = useState<AuditFeed | null>(null);

  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const buildParams = (includeSearch = true) => {
    const params = new URLSearchParams();

    if (includeSearch && search.trim()) {
      params.set("search", search.trim());
    }
    if (branchId) params.set("branchId", branchId);
    if (userId) params.set("userId", userId);
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    return params;
  };

  const loadOptions = async () => {
    const response = await apiFetch("/api/audit/options");
    const data = (await response.json()) as Partial<AuditOptions>;

    if (!response.ok) {
      throw new Error(
        (data as { message?: string })?.message ||
          "Failed to load audit filter options"
      );
    }

    setOptions({
      branches: Array.isArray(data?.branches) ? data.branches : [],
      users: Array.isArray(data?.users) ? data.users : [],
      actions: Array.isArray(data?.actions) ? data.actions : [],
      entityTypes: Array.isArray(data?.entityTypes) ? data.entityTypes : [],
    });
  };

  const loadAuditData = async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const feedParams = buildParams(true);
      feedParams.set("page", String(page));
      feedParams.set("limit", "25");

      const summaryParams = buildParams(false);

      const [feedResponse, summaryResponse] = await Promise.all([
        apiFetch(`/api/audit?${feedParams.toString()}`),
        apiFetch(`/api/audit/summary?${summaryParams.toString()}`),
      ]);

      const [feedData, summaryData] = await Promise.all([
        feedResponse.json(),
        summaryResponse.json(),
      ]);

      if (!feedResponse.ok) {
        throw new Error(
          (feedData as { message?: string })?.message ||
            "Failed to load audit activity"
        );
      }

      if (!summaryResponse.ok) {
        throw new Error(
          (summaryData as { message?: string })?.message ||
            "Failed to load audit summary"
        );
      }

      const safeFeed = feedData as Partial<AuditFeed>;
      const safeSummary = summaryData as Partial<AuditSummary>;

      setFeed({
        scope: safeFeed?.scope ?? {
          type: "all_branches",
          branch: null,
        },
        pagination: safeFeed?.pagination ?? {
          page,
          limit: 25,
          total: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
        events: Array.isArray(safeFeed?.events) ? safeFeed.events : [],
      });

      setSummary({
        summary: {
          totalEvents: Number(safeSummary?.summary?.totalEvents ?? 0),
          activeUsers: Number(safeSummary?.summary?.activeUsers ?? 0),
          affectedBranches: Number(
            safeSummary?.summary?.affectedBranches ?? 0
          ),
          actionTypes: Number(safeSummary?.summary?.actionTypes ?? 0),
        },
        byAction: Array.isArray(safeSummary?.byAction)
          ? safeSummary.byAction
          : [],
        byEntityType: Array.isArray(safeSummary?.byEntityType)
          ? safeSummary.byEntityType
          : [],
        dailyActivity: Array.isArray(safeSummary?.dailyActivity)
          ? safeSummary.dailyActivity
          : [],
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadOptions();
      } catch (err) {
        setError(getErrorMessage(err));
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    loadAuditData();
  }, [page, branchId, userId, action, entityType, startDate, endDate]);

  const applySearch = () => {
    if (page !== 1) {
      setPage(1);
      return;
    }

    loadAuditData();
  };

  const clearFilters = () => {
    setSearch("");
    setBranchId("");
    setUserId("");
    setAction("");
    setEntityType("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const currentScope = useMemo(() => {
    if (!feed) return "All branches";

    return feed.scope.type === "branch"
      ? feed.scope.branch?.name || "Selected branch"
      : "All branches";
  }, [feed]);

  const cards = [
    {
      label: "Audit Events",
      value: summary.summary.totalEvents,
      icon: Activity,
    },
    {
      label: "Active Staff",
      value: summary.summary.activeUsers,
      icon: Users,
    },
    {
      label: "Affected Branches",
      value: summary.summary.affectedBranches,
      icon: Building2,
    },
    {
      label: "Action Types",
      value: summary.summary.actionTypes,
      icon: BarChart3,
    },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#246BFD]/10 text-[#246BFD]">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[#071827] sm:text-3xl">
                    Audit & Analytics
                  </h1>

                  <span className="inline-flex rounded-full bg-[#246BFD]/10 px-2.5 py-1 text-xs font-semibold text-[#246BFD] ring-1 ring-inset ring-[#246BFD]/15">
                    Pro
                  </span>
                </div>

                <p className="max-w-3xl text-sm leading-6 text-slate-500">
                  Review staff actions, sales activity, returns, stock operations,
                  branch changes and expenses across your organization.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadAuditData(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5FE0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh Activity
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                    {value.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3 text-cyan-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-cyan-600" />
                <h2 className="text-lg font-bold text-slate-950">
                  Activity Filters
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Current scope: {currentScope}
              </p>
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-slate-600 hover:text-slate-950"
            >
              Clear filters
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Search activity
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applySearch();
                    }}
                    placeholder="Action, description, staff, branch..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={applySearch}
                  className="rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Search
                </button>
              </div>
            </div>

            <FilterSelect
              label="Branch"
              value={branchId}
              onChange={(value) => {
                setBranchId(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "All branches" },
                ...(options.branches ?? []).map((branch) => ({
                  value: String(branch.id),
                  label: branch.code
                    ? `${branch.name} (${branch.code})`
                    : branch.name,
                })),
              ]}
            />

            <FilterSelect
              label="Staff"
              value={userId}
              onChange={(value) => {
                setUserId(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "All staff" },
                ...(options.users ?? []).map((user) => ({
                  value: String(user.id),
                  label: `${user.name} · ${user.role}`,
                })),
              ]}
            />

            <FilterSelect
              label="Action"
              value={action}
              onChange={(value) => {
                setAction(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "All actions" },
                ...(options.actions ?? []).map((item) => ({
                  value: item,
                  label: formatAction(item),
                })),
              ]}
            />

            <FilterSelect
              label="Entity"
              value={entityType}
              onChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "All entities" },
                ...(options.entityTypes ?? []).map((item) => ({
                  value: item,
                  label: item.replace(/_/g, " "),
                })),
              ]}
            />

            <DateFilter
              label="From date"
              value={startDate}
              onChange={(value) => {
                setStartDate(value);
                setPage(1);
              }}
            />

            <DateFilter
              label="To date"
              value={endDate}
              onChange={(value) => {
                setEndDate(value);
                setPage(1);
              }}
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Activity Feed
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {feed?.pagination.total.toLocaleString() || 0} recorded events
                  </p>
                </div>

                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700">
                  <Building2 className="h-3.5 w-3.5" />
                  {currentScope}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-72 items-center justify-center">
                <RefreshCw className="h-7 w-7 animate-spin text-cyan-600" />
              </div>
            ) : feed?.events.length ? (
              <div className="divide-y divide-slate-100">
                {feed.events.map((event) => (
                  <AuditEventRow key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                <ShieldCheck className="h-10 w-10 text-slate-300" />
                <h3 className="mt-4 font-bold text-slate-800">
                  No audit activity found
                </h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Try changing the filters or perform a new POS action to create
                  an audit event.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 sm:px-6">
              <p className="text-sm text-slate-500">
                Page {feed?.pagination.page || 1} of{" "}
                {feed?.pagination.totalPages || 1}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!feed?.pagination.hasPreviousPage}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  disabled={!feed?.pagination.hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <AnalyticsPanel
              title="Top Actions"
              icon={<Activity className="h-5 w-5" />}
              items={(summary.byAction ?? []).map((item) => ({
                label: formatAction(item.action),
                value: Number(item.total),
              }))}
            />

            <AnalyticsPanel
              title="Activity by Entity"
              icon={<BarChart3 className="h-5 w-5" />}
              items={(summary.byEntityType ?? []).map((item) => ({
                label: item.entity_type.replace(/_/g, " "),
                value: Number(item.total),
              }))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="relative">
        <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        />
      </div>
    </div>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="flex gap-4">
        <div className="mt-0.5 rounded-xl bg-slate-100 p-2.5 text-slate-700">
          <UserRound className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">
                {event.description || formatAction(event.action)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{event.user?.name || "System"}</span>
                {event.user?.role && <span>{event.user.role}</span>}
                {event.branch?.name && <span>{event.branch.name}</span>}
              </div>
            </div>

            <span className="shrink-0 text-xs font-medium text-slate-400">
              {formatDateTime(event.createdAt)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white">
              {formatAction(event.action)}
            </span>
            <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold capitalize text-cyan-700">
              {event.entityType.replace(/_/g, " ")}
            </span>

            {event.metadata && (
              <button
                type="button"
                onClick={() => setShowDetails((current) => !current)}
                className="text-xs font-semibold text-cyan-700 hover:text-cyan-900"
              >
                {showDetails ? "Hide details" : "View details"}
              </button>
            )}
          </div>

          {showDetails && event.metadata && (
            <div className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4">
              <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ label: string; value: number }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-2 text-slate-950">
        <span className="text-cyan-600">{icon}</span>
        <h2 className="font-bold">{title}</h2>
      </div>

      {items.length ? (
        <div className="space-y-4">
          {items.map((item) => {
            const width = Math.max(4, (item.value / maxValue) * 100);

            return (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate capitalize text-slate-600">
                    {item.label}
                  </span>
                  <span className="font-bold text-slate-950">
                    {item.value.toLocaleString()}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No activity recorded yet.</p>
      )}
    </div>
  );
}
