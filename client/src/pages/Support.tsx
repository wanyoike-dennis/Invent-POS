import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Headphones,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TicketCheck,
  X,
} from "lucide-react";
import { apiFetch } from "../services/api";

type SupportLevel = "Standard" | "Priority" | "Dedicated";

type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

type TicketPriority = "low" | "normal" | "high" | "urgent";

type SupportCounts = {
  total: number;
  open: number;
  inProgress: number;
  waitingCustomer: number;
  resolved: number;
  closed: number;
};

type Branch = {
  id: number;
  name: string;
  code?: string | null;
};

type TicketUser = {
  id: number;
  name: string;
  email?: string | null;
  role?: string | null;
};

type SupportTicket = {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  supportLevel: SupportLevel;
  assignedTo?: number | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: Branch | null;
  createdBy?: TicketUser | null;
};

type SupportMessage = {
  id: number;
  message: string;
  senderType: "tenant" | "support";
  createdAt?: string | null;
  user?: TicketUser | null;
};

type TicketListResponse = {
  supportLevel?: SupportLevel;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  tickets?: SupportTicket[];
};

type TicketDetailsResponse = {
  ticket?: SupportTicket;
  messages?: SupportMessage[];
};

const EMPTY_COUNTS: SupportCounts = {
  total: 0,
  open: 0,
  inProgress: 0,
  waitingCustomer: 0,
  resolved: 0,
  closed: 0,
};

const categories = [
  ["general", "General"],
  ["technical", "Technical"],
  ["billing", "Billing"],
  ["account", "Account"],
  ["sales", "Sales"],
  ["inventory", "Inventory"],
  ["reports", "Reports"],
  ["other", "Other"],
] as const;

const priorities = [
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const;

const statuses = [
  ["", "All statuses"],
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["waiting_customer", "Waiting for customer"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const;

const formatDate = (value?: string | null) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusClasses: Record<TicketStatus, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700",
  in_progress: "border-violet-200 bg-violet-50 text-violet-700",
  waiting_customer: "border-amber-200 bg-amber-50 text-amber-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
};

const priorityClasses: Record<TicketPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-600",
  normal: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

const supportLevelDescription: Record<SupportLevel, string> = {
  Standard: "Core support included with your Starter subscription.",
  Priority: "Priority support included with your Business subscription.",
  Dedicated: "Dedicated support included with your Pro subscription.",
};

async function supportApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(endpoint, options);

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        `Support request failed with status ${response.status}.`
    );
  }

  return data as T;
}

export default function Support() {
  const [supportLevel, setSupportLevel] = useState<SupportLevel>("Standard");
  const [counts, setCounts] = useState<SupportCounts>(EMPTY_COUNTS);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTickets, setTotalTickets] = useState(0);

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState<TicketPriority>("normal");

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const loadOverview = useCallback(async () => {
    const data = (await supportApi("/api/support/overview")) as {
      supportLevel?: SupportLevel;
      counts?: Partial<SupportCounts>;
    };

    setSupportLevel(data?.supportLevel || "Standard");
    setCounts({
      total: Number(data?.counts?.total || 0),
      open: Number(data?.counts?.open || 0),
      inProgress: Number(data?.counts?.inProgress || 0),
      waitingCustomer: Number(data?.counts?.waitingCustomer || 0),
      resolved: Number(data?.counts?.resolved || 0),
      closed: Number(data?.counts?.closed || 0),
    });
  }, []);

  const loadTickets = useCallback(
    async (
      options: {
        page?: number;
        status?: string;
        search?: string;
      } = {}
    ) => {
      const requestedPage = options.page ?? page;
      const requestedStatus = options.status ?? status;
      const requestedSearch = options.search ?? search;

      const params = new URLSearchParams({
        page: String(requestedPage),
        limit: "10",
      });

      if (requestedStatus) params.set("status", requestedStatus);
      if (requestedSearch) params.set("search", requestedSearch);

      const data = await supportApi<TicketListResponse>(
        `/api/support?${params.toString()}`
      );

      setSupportLevel(data?.supportLevel || "Standard");
      setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
      setTotalPages(Math.max(1, Number(data?.pagination?.totalPages || 1)));
      setTotalTickets(Number(data?.pagination?.total || 0));
    },
    [page, search, status]
  );

  const loadPage = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        await Promise.all([loadOverview(), loadTickets()]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load support information."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadOverview, loadTickets]
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const loadTicketDetails = useCallback(async (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setDetailsLoading(true);
    setError("");

    try {
      const data = (await supportApi(
        `/api/support/${ticketId}`
      )) as TicketDetailsResponse;

      setSelectedTicket(data?.ticket || null);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load the support ticket."
      );
      setSelectedTicket(null);
      setMessages([]);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const closeDetails = () => {
    setSelectedTicketId(null);
    setSelectedTicket(null);
    setMessages([]);
    setReply("");
  };

  const resetNewTicket = () => {
    setSubject("");
    setDescription("");
    setCategory("general");
    setPriority("normal");
  };

  const createTicket = async (event: FormEvent) => {
    event.preventDefault();

    if (!subject.trim() || !description.trim()) {
      setError("Enter a subject and describe the issue.");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const data = (await supportApi("/api/support", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim(),
          category,
          priority,
        }),
      })) as { ticket?: SupportTicket };

      setSuccess(
        data?.ticket?.ticketNumber
          ? `Support ticket ${data.ticket.ticketNumber} created successfully.`
          : "Support ticket created successfully."
      );

      setShowNewTicket(false);
      resetNewTicket();

      // Clear active list filters so the newly created ticket cannot be hidden,
      // and explicitly fetch page 1 instead of relying on asynchronous state.
      setSearchInput("");
      setSearch("");
      setStatus("");
      setPage(1);

      await Promise.all([
        loadOverview(),
        loadTickets({
          page: 1,
          status: "",
          search: "",
        }),
      ]);

      if (data?.ticket?.id) {
        await loadTicketDetails(data.ticket.id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create the support ticket."
      );
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTicketId || !reply.trim()) return;

    setSendingReply(true);
    setError("");
    setSuccess("");

    try {
      await supportApi(`/api/support/${selectedTicketId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          message: reply.trim(),
        }),
      });

      setReply("");
      setSuccess("Reply sent successfully.");
      await Promise.all([
        loadTicketDetails(selectedTicketId),
        loadOverview(),
        loadTickets(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send your reply."
      );
    } finally {
      setSendingReply(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Total tickets",
        value: counts.total,
        icon: TicketCheck,
      },
      {
        label: "Open",
        value: counts.open,
        icon: AlertCircle,
      },
      {
        label: "In progress",
        value: counts.inProgress,
        icon: Clock3,
      },
      {
        label: "Resolved",
        value: counts.resolved,
        icon: CheckCircle2,
      },
    ],
    [counts]
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-[#246BFD]" />
          Loading support...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#246BFD]">
              <Headphones className="h-5 w-5" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#071827]">
                  Support
                </h1>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#246BFD]">
                  {supportLevel}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                {supportLevelDescription[supportLevel]}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setShowNewTicket(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1859d9]"
            >
              <Plus className="h-4 w-4" />
              New Support Ticket
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-[#071827]">
                  {value}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-[#246BFD]">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#071827]">
                Support tickets
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Track issues and continue conversations with Invent POS support.
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
              className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
            >
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search tickets..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
              >
                {statuses.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="rounded-xl bg-[#071827] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#246BFD]">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-bold text-[#071827]">
              No support tickets found
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              When you need help, create a support ticket and track the
              conversation here.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => void loadTicketDetails(ticket.id)}
                  className="block w-full px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-[#246BFD]">
                          {ticket.ticketNumber}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses[ticket.status]}`}
                        >
                          {titleCase(ticket.status)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClasses[ticket.priority]}`}
                        >
                          {titleCase(ticket.priority)}
                        </span>
                      </div>

                      <h3 className="mt-2 truncate text-sm font-bold text-[#071827]">
                        {ticket.subject}
                      </h3>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{titleCase(ticket.category)}</span>
                        <span>{ticket.supportLevel} Support</span>
                        {ticket.branch?.name && <span>{ticket.branch.name}</span>}
                        <span>Updated {formatDate(ticket.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-xs font-medium text-slate-400">
                      Open ticket →
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {totalTickets} ticket{totalTickets === 1 ? "" : "s"}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="px-2 text-sm font-medium text-slate-600">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-[#071827]">
                  New Support Ticket
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Your ticket will be submitted with {supportLevel} Support.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewTicket(false)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createTicket} className="space-y-5 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={160}
                  placeholder="Briefly describe the issue"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
                  >
                    {categories.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as TicketPriority)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
                  >
                    {priorities.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={5000}
                  rows={7}
                  placeholder="Explain what happened, what you expected, and any steps that may help us reproduce the issue."
                  className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-1 text-right text-xs text-slate-400">
                  {description.length}/5000
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewTicket(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1859d9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTicketId !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/50">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeDetails}
                className="mt-0.5 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1">
                {selectedTicket ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-[#246BFD]">
                        {selectedTicket.ticketNumber}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses[selectedTicket.status]}`}
                      >
                        {titleCase(selectedTicket.status)}
                      </span>
                    </div>
                    <h2 className="mt-1 truncate text-lg font-bold text-[#071827]">
                      {selectedTicket.subject}
                    </h2>
                  </>
                ) : (
                  <h2 className="text-lg font-bold text-[#071827]">
                    Support Ticket
                  </h2>
                )}
              </div>

              <button
                type="button"
                onClick={closeDetails}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailsLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#246BFD]" />
              </div>
            ) : selectedTicket ? (
              <>
                <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClasses[selectedTicket.priority]}`}
                    >
                      {titleCase(selectedTicket.priority)} priority
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {titleCase(selectedTicket.category)}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#246BFD]">
                      {selectedTicket.supportLevel} Support
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <span>Opened {formatDate(selectedTicket.createdAt)}</span>
                    {selectedTicket.branch?.name && (
                      <span>Branch: {selectedTicket.branch.name}</span>
                    )}
                    {selectedTicket.createdBy?.name && (
                      <span>By: {selectedTicket.createdBy.name}</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  {messages.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      {selectedTicket.description}
                    </div>
                  ) : (
                    messages.map((message) => {
                      const tenant = message.senderType === "tenant";

                      return (
                        <div
                          key={message.id}
                          className={`flex ${
                            tenant ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                              tenant
                                ? "bg-[#246BFD] text-white"
                                : "border border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-2 text-xs font-semibold opacity-80">
                              {tenant ? (
                                <>
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  {message.user?.name || "Your team"}
                                </>
                              ) : (
                                <>
                                  <Headphones className="h-3.5 w-3.5" />
                                  Invent POS Support
                                </>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-6">
                              {message.message}
                            </p>
                            {message.createdAt && (
                              <p className="mt-2 text-[11px] opacity-70">
                                {formatDate(message.createdAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-slate-200 bg-white p-5">
                  {selectedTicket.status === "closed" ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      This ticket is closed and cannot receive new replies.
                    </div>
                  ) : (
                    <form onSubmit={sendReply} className="space-y-3">
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={5000}
                        rows={3}
                        placeholder="Write a reply..."
                        className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-blue-100"
                      />

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-400">
                          {reply.length}/5000
                        </span>
                        <button
                          type="submit"
                          disabled={sendingReply || !reply.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1859d9] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {sendingReply ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Send Reply
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
                Ticket details are unavailable.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
