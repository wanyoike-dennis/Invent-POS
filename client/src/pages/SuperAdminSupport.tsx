import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Headphones,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TicketCheck,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { superAdminFetch } from "../services/api";
import { formatDateTime } from "../utils/dateTime";

type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

type TicketPriority = "low" | "normal" | "high" | "urgent";
type SupportLevel = "Standard" | "Priority" | "Dedicated";

type OrganizationOption = {
  id: number;
  name: string;
  slug: string;
};

type SupportTicket = {
  id: number;
  organizationId: number;
  ticketNumber: string;
  subject: string;
  description?: string | null;
  category?: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  supportLevel: SupportLevel;
  assignedTo?: number | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  organization: {
    id: number;
    name: string;
    slug?: string | null;
    status?: string | null;
    subscriptionPlan?: string | null;
  };
  branch?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
  createdBy?: {
    id: number;
    name: string;
    email?: string | null;
    role?: string | null;
  } | null;
};

type SupportMessage = {
  id: number;
  message: string;
  senderType: "customer" | "support" | string;
  createdAt?: string | null;
  user?: {
    id: number;
    name: string;
    email?: string | null;
    role?: string | null;
  } | null;
};

type OverviewResponse = {
  counts?: {
    total?: number;
    open?: number;
    inProgress?: number;
    waitingCustomer?: number;
    resolved?: number;
    closed?: number;
    urgent?: number;
  };
  bySupportLevel?: {
    Standard?: number;
    Priority?: number;
    Dedicated?: number;
  };
};

type OptionsResponse = {
  organizations?: OrganizationOption[];
  statuses?: TicketStatus[];
  priorities?: TicketPriority[];
  supportLevels?: SupportLevel[];
  categories?: string[];
};

type TicketListResponse = {
  tickets?: SupportTicket[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type TicketDetailResponse = {
  ticket?: SupportTicket;
  messages?: SupportMessage[];
};

const statusLabels: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_customer: "Waiting Customer",
  resolved: "Resolved",
  closed: "Closed",
};

const statusStyles: Record<TicketStatus, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700",
  in_progress: "border-violet-200 bg-violet-50 text-violet-700",
  waiting_customer: "border-amber-200 bg-amber-50 text-amber-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
};

const priorityStyles: Record<TicketPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-600",
  normal: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-rose-200 bg-rose-50 text-rose-700",
};

const supportLevelStyles: Record<SupportLevel, string> = {
  Standard: "border-slate-200 bg-slate-50 text-slate-700",
  Priority: "border-blue-200 bg-blue-50 text-blue-700",
  Dedicated: "border-violet-200 bg-violet-50 text-violet-700",
};

function SuperAdminSupport() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const readStatusFromUrl = (params: URLSearchParams) => {
    const value = params.get("status");
    return value &&
      ["open", "in_progress", "waiting_customer", "resolved", "closed"].includes(value)
      ? value
      : "";
  };

  const readPriorityFromUrl = (params: URLSearchParams) => {
    const value = params.get("priority");
    return value && ["low", "normal", "high", "urgent"].includes(value)
      ? value
      : "";
  };

  const initialStatus = readStatusFromUrl(searchParams);
  const initialPriority = readPriorityFromUrl(searchParams);

  const [overview, setOverview] = useState<OverviewResponse>({});
  const [options, setOptions] = useState<OptionsResponse>({});
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [supportLevel, setSupportLevel] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [category, setCategory] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTickets, setTotalTickets] = useState(0);

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdminUser");
    navigate("/super-admin/login", { replace: true });
  }, [navigate]);

  const parseResponse = useCallback(
    async <T,>(response: Response, fallback: string): Promise<T> => {
      let data: any = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.status === 401) {
        logout();
        throw new Error("Your Super Admin session has expired.");
      }

      if (!response.ok) {
        throw new Error(data?.message || fallback);
      }

      return data as T;
    },
    [logout]
  );

  const loadOverview = useCallback(async () => {
    const response = await superAdminFetch("/api/super-admin/support/overview");
    const data = await parseResponse<OverviewResponse>(
      response,
      "Could not load support overview."
    );
    setOverview(data || {});
  }, [parseResponse]);

  const loadOptions = useCallback(async () => {
    const response = await superAdminFetch("/api/super-admin/support/options");
    const data = await parseResponse<OptionsResponse>(
      response,
      "Could not load support filters."
    );

    setOptions({
      organizations: Array.isArray(data?.organizations) ? data.organizations : [],
      statuses: Array.isArray(data?.statuses) ? data.statuses : [],
      priorities: Array.isArray(data?.priorities) ? data.priorities : [],
      supportLevels: Array.isArray(data?.supportLevels) ? data.supportLevels : [],
      categories: Array.isArray(data?.categories) ? data.categories : [],
    });
  }, [parseResponse]);

  const loadTickets = useCallback(
    async (requestedPage = page) => {
      const params = new URLSearchParams({
        page: String(requestedPage),
        limit: "20",
      });

      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (supportLevel) params.set("supportLevel", supportLevel);
      if (organizationId) params.set("organizationId", organizationId);
      if (category) params.set("category", category);

      const response = await superAdminFetch(
        `/api/super-admin/support?${params.toString()}`
      );
      const data = await parseResponse<TicketListResponse>(
        response,
        "Could not load support tickets."
      );

      setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
      setTotalTickets(Number(data?.pagination?.total || 0));
      setTotalPages(Math.max(1, Number(data?.pagination?.totalPages || 1)));
    },
    [
      category,
      organizationId,
      page,
      parseResponse,
      priority,
      search,
      status,
      supportLevel,
    ]
  );

  const loadInitialData = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError("");
        await Promise.all([loadOverview(), loadOptions(), loadTickets(1)]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load the Support Center."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadOptions, loadOverview, loadTickets]
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const urlStatus = readStatusFromUrl(searchParams);
    const urlPriority = readPriorityFromUrl(searchParams);

    if (urlStatus !== status) {
      setStatus(urlStatus);
      setPage(1);
    }

    if (urlPriority !== priority) {
      setPriority(urlPriority);
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (status) nextParams.set("status", status);
    else nextParams.delete("status");

    if (priority) nextParams.set("priority", priority);
    else nextParams.delete("priority");

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [priority, searchParams, setSearchParams, status]);

  useEffect(() => {
    if (loading) return;

    loadTickets(page).catch((err) => {
      setError(
        err instanceof Error ? err.message : "Could not load support tickets."
      );
    });
  }, [page, search, status, priority, supportLevel, organizationId, category]);

  const loadTicketDetails = useCallback(
    async (ticketId: number) => {
      try {
        setDetailsLoading(true);
        setError("");

        const response = await superAdminFetch(
          `/api/super-admin/support/${ticketId}`
        );
        const data = await parseResponse<TicketDetailResponse>(
          response,
          "Could not load support ticket."
        );

        setSelectedTicket(data?.ticket || null);
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load support ticket."
        );
      } finally {
        setDetailsLoading(false);
      }
    },
    [parseResponse]
  );

  const openTicket = async (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setSelectedTicket(null);
    setMessages([]);
    setReply("");
    await loadTicketDetails(ticketId);
  };

  const closeTicketPanel = () => {
    setSelectedTicketId(null);
    setSelectedTicket(null);
    setMessages([]);
    setReply("");
  };

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      setError("");
      setSuccess("");

      await Promise.all([loadOverview(), loadOptions(), loadTickets(page)]);

      if (selectedTicketId) {
        await loadTicketDetails(selectedTicketId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setPriority("");
    setSupportLevel("");
    setOrganizationId("");
    setCategory("");
    setPage(1);
  };

  const sendReply = async () => {
    if (!selectedTicketId || !reply.trim()) return;

    try {
      setSendingReply(true);
      setError("");
      setSuccess("");

      const response = await superAdminFetch(
        `/api/super-admin/support/${selectedTicketId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message: reply.trim() }),
        }
      );

      await parseResponse(
        response,
        "Could not send the support reply."
      );

      setReply("");
      setSuccess("Reply sent successfully.");

      await Promise.all([
        loadTicketDetails(selectedTicketId),
        loadOverview(),
        loadTickets(page),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the support reply."
      );
    } finally {
      setSendingReply(false);
    }
  };

  const updateTicket = async (
    changes: Partial<{ status: TicketStatus; priority: TicketPriority }>
  ) => {
    if (!selectedTicketId) return;

    try {
      setUpdatingTicket(true);
      setError("");
      setSuccess("");

      const response = await superAdminFetch(
        `/api/super-admin/support/${selectedTicketId}`,
        {
          method: "PATCH",
          body: JSON.stringify(changes),
        }
      );

      await parseResponse(
        response,
        "Could not update the support ticket."
      );

      setSuccess("Support ticket updated successfully.");

      await Promise.all([
        loadTicketDetails(selectedTicketId),
        loadOverview(),
        loadTickets(page),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update the support ticket."
      );
    } finally {
      setUpdatingTicket(false);
    }
  };

  const counts = overview?.counts || {};
  const tierCounts = overview?.bySupportLevel || {};

  const cards = [
    {
      label: "Total Tickets",
      value: Number(counts.total || 0),
      helper: "All platform support requests",
      icon: TicketCheck,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "Open",
      value: Number(counts.open || 0),
      helper: "Awaiting support action",
      icon: AlertCircle,
      iconClass: "bg-amber-50 text-amber-600",
    },
    {
      label: "In Progress",
      value: Number(counts.inProgress || 0),
      helper: "Currently being handled",
      icon: Clock3,
      iconClass: "bg-violet-50 text-violet-600",
    },
    {
      label: "Waiting Customer",
      value: Number(counts.waitingCustomer || 0),
      helper: "Support has replied",
      icon: MessageSquare,
      iconClass: "bg-cyan-50 text-cyan-600",
    },
    {
      label: "Resolved",
      value: Number(counts.resolved || 0),
      helper: "Issues marked resolved",
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Urgent",
      value: Number(counts.urgent || 0),
      helper: "Open urgent-priority tickets",
      icon: ShieldCheck,
      iconClass: "bg-rose-50 text-rose-600",
    },
  ];

  const hasFilters = useMemo(
    () =>
      Boolean(
        search ||
          status ||
          priority ||
          supportLevel ||
          organizationId ||
          category
      ),
    [category, organizationId, priority, search, status, supportLevel]
  );

  return (
    <div className="px-5 py-7 lg:px-8 lg:py-8 xl:px-10">

      <main className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Support Operations
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0B1F33]">
              Support Center
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Manage customer support requests across all Invent POS organizations
              while keeping unrelated tenant business data isolated.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              {(["Dedicated", "Priority", "Standard"] as SupportLevel[]).map(
                (level) => (
                  <div
                    key={level}
                    className="min-w-[88px] rounded-lg px-3 py-1.5 text-center"
                  >
                    <p className="text-base font-bold text-[#0B1F33]">
                      {Number(tierCounts[level] || 0)}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      {level}
                    </p>
                  </div>
                )
              )}
            </div>

            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
            <span>{success}</span>
            <button type="button" onClick={() => setSuccess("")}>
              <X size={17} />
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map(({ label, value, helper, icon: Icon, iconClass }) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]"
            >
              <div
                className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
              >
                <Icon size={20} />
              </div>
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-[#0B1F33]">
                {value}
              </p>
              <p className="mt-2 min-h-[34px] text-xs leading-5 text-slate-400">
                {helper}
              </p>
            </div>
          ))}
        </div>

        <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-200 px-5 py-5 lg:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0B1F33]">
                    Support Queue
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Dedicated and Priority customers are surfaced ahead of
                    Standard support within the queue.
                  </p>
                </div>

                <form
                  onSubmit={applySearch}
                  className="flex w-full max-w-xl gap-2 xl:w-auto"
                >
                  <div className="relative flex-1 xl:min-w-[320px]">
                    <Search
                      size={17}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Search ticket, subject or organization..."
                      className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#0B1F33] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#102A45]"
                  >
                    Search
                  </button>
                </form>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className="relative">
                  <Building2
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <select
                    value={organizationId}
                    onChange={(e) => {
                      setOrganizationId(e.target.value);
                      setPage(1);
                    }}
                    className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">All organizations</option>
                    {(options.organizations || []).map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>

                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">All statuses</option>
                  {(options.statuses || []).map((item) => (
                    <option key={item} value={item}>
                      {statusLabels[item]}
                    </option>
                  ))}
                </select>

                <select
                  value={priority}
                  onChange={(e) => {
                    setPriority(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm capitalize text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">All priorities</option>
                  {(options.priorities || []).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <select
                  value={supportLevel}
                  onChange={(e) => {
                    setSupportLevel(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">All support tiers</option>
                  {(options.supportLevels || []).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">All categories</option>
                  {(options.categories || []).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <SlidersHorizontal size={16} />
                  Clear
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="text-center">
                <Loader2
                  size={34}
                  className="mx-auto animate-spin text-blue-600"
                />
                <p className="mt-4 text-sm text-slate-500">
                  Loading support tickets...
                </p>
              </div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex min-h-[360px] items-center justify-center px-5">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Headphones size={25} />
                </div>
                <p className="mt-4 font-bold text-[#0B1F33]">
                  No support tickets found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {hasFilters
                    ? "Try clearing or changing the current filters."
                    : "Customer support requests will appear here."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => openTicket(ticket.id)}
                    className="flex w-full flex-col gap-4 px-5 py-5 text-left transition hover:bg-slate-50/80 lg:flex-row lg:items-center lg:justify-between lg:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-blue-600">
                          {ticket.ticketNumber}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyles[ticket.status]}`}
                        >
                          {statusLabels[ticket.status]}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${priorityStyles[ticket.priority]}`}
                        >
                          {ticket.priority}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${supportLevelStyles[ticket.supportLevel]}`}
                        >
                          {ticket.supportLevel}
                        </span>
                      </div>

                      <p className="mt-2 truncate font-bold text-[#0B1F33]">
                        {ticket.subject}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                          <Building2 size={13} />
                          {ticket.organization?.name || "Unknown organization"}
                        </span>
                        <span>{ticket.category || "General"}</span>
                        <span>{ticket.branch?.name || "No branch"}</span>
                        <span>
                          Updated {formatDateTime(ticket.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="hidden text-right md:block">
                        <p className="text-xs font-semibold text-slate-600">
                          {ticket.createdBy?.name || "Customer"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {ticket.createdBy?.email || ""}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 bg-[#FBFCFE] px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <p className="text-sm text-slate-500">
                  {totalTickets} {totalTickets === 1 ? "ticket" : "tickets"} ·
                  Page {page} of {totalPages}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {selectedTicketId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#071421]/50 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close ticket"
            onClick={closeTicketPanel}
            className="absolute inset-0 cursor-default"
          />

          <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            {detailsLoading || !selectedTicket ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <Loader2
                    size={34}
                    className="mx-auto animate-spin text-blue-600"
                  />
                  <p className="mt-3 text-sm text-slate-500">
                    Loading conversation...
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-blue-600">
                          {selectedTicket.ticketNumber}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${supportLevelStyles[selectedTicket.supportLevel]}`}
                        >
                          {selectedTicket.supportLevel} Support
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-[#0B1F33]">
                        {selectedTicket.subject}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        {selectedTicket.organization?.name}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeTicketPanel}
                      className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X size={19} />
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                        Status
                      </label>
                      <select
                        value={selectedTicket.status}
                        disabled={updatingTicket}
                        onChange={(e) =>
                          updateTicket({
                            status: e.target.value as TicketStatus,
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                      >
                        {(
                          [
                            "open",
                            "in_progress",
                            "waiting_customer",
                            "resolved",
                            "closed",
                          ] as TicketStatus[]
                        ).map((item) => (
                          <option key={item} value={item}>
                            {statusLabels[item]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                        Priority
                      </label>
                      <select
                        value={selectedTicket.priority}
                        disabled={updatingTicket}
                        onChange={(e) =>
                          updateTicket({
                            priority: e.target.value as TicketPriority,
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold capitalize text-slate-700 outline-none focus:border-blue-500"
                      >
                        {(
                          ["low", "normal", "high", "urgent"] as TicketPriority[]
                        ).map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound size={13} />
                      {selectedTicket.createdBy?.name || "Customer"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={13} />
                      {selectedTicket.branch?.name || "No branch"}
                    </span>
                    <span>
                      Opened {formatDateTime(selectedTicket.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[#F8FAFC] px-5 py-6 sm:px-6">
                  <div className="mx-auto max-w-xl space-y-4">
                    {selectedTicket.description && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <p className="mb-1 text-xs font-bold text-slate-500">
                            {selectedTicket.createdBy?.name || "Customer"}
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {selectedTicket.description}
                          </p>
                          <p className="mt-2 text-[11px] text-slate-400">
                            {formatDateTime(selectedTicket.createdAt)}
                          </p>
                        </div>
                      </div>
                    )}

                    {messages.map((message) => {
                      const fromSupport = message.senderType === "support";

                      return (
                        <div
                          key={message.id}
                          className={`flex ${
                            fromSupport ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                              fromSupport
                                ? "rounded-tr-md bg-blue-600 text-white"
                                : "rounded-tl-md border border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <p
                              className={`mb-1 text-xs font-bold ${
                                fromSupport
                                  ? "text-blue-100"
                                  : "text-slate-500"
                              }`}
                            >
                              {fromSupport
                                ? "Invent POS Support"
                                : message.user?.name || "Customer"}
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-6">
                              {message.message}
                            </p>
                            <p
                              className={`mt-2 text-[11px] ${
                                fromSupport
                                  ? "text-blue-100"
                                  : "text-slate-400"
                              }`}
                            >
                              {formatDateTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {!selectedTicket.description && messages.length === 0 && (
                      <div className="py-12 text-center">
                        <MessageSquare
                          size={28}
                          className="mx-auto text-slate-300"
                        />
                        <p className="mt-3 text-sm text-slate-500">
                          No conversation messages yet.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-200 bg-white px-5 py-5 sm:px-6">
                  {selectedTicket.status === "closed" ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                      This ticket is closed. Reopen it before sending another
                      reply.
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        maxLength={5000}
                        rows={4}
                        placeholder="Reply as Invent POS Support..."
                        className="w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <div className="mt-3 flex items-center justify-between gap-4">
                        <span className="text-xs text-slate-400">
                          {reply.length}/5000
                        </span>
                        <button
                          type="button"
                          onClick={sendReply}
                          disabled={sendingReply || !reply.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {sendingReply ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Send size={16} />
                          )}
                          {sendingReply ? "Sending..." : "Send Reply"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default SuperAdminSupport;
