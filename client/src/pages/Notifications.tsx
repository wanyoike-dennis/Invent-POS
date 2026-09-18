import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Filter,
  Info,
  LifeBuoy,
  PackageX,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from "lucide-react";

type NotificationType =
  | "inventory"
  | "support"
  | "subscription"
  | "staff"
  | "security"
  | "system";

type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

type NotificationItem = {
  id: number;
  userId: number | null;
  branch: {
    id: number;
    name: string;
    code: string | null;
  } | null;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  notifications: NotificationItem[];
};

const typeOptions: Array<{
  value: "" | NotificationType;
  label: string;
}> = [
  { value: "", label: "All types" },
  { value: "inventory", label: "Inventory" },
  { value: "support", label: "Support" },
  { value: "subscription", label: "Subscription" },
  { value: "staff", label: "Staff" },
  { value: "security", label: "Security" },
  { value: "system", label: "System" },
];

const severityOptions: Array<{
  value: "" | NotificationSeverity;
  label: string;
}> = [
  { value: "", label: "All severities" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const normalizeDate = (value: string) => {
  if (!value) return null;

  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value: string) => {
  const date = normalizeDate(value);

  if (!date) return "Unknown time";

  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatRelativeTime = (value: string) => {
  const date = normalizeDate(value);

  if (!date) return "";

  const difference = Date.now() - date.getTime();
  const minutes = Math.floor(difference / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatDateTime(value);
};

const getNotificationIcon = (type: NotificationType) => {
  if (type === "inventory") return PackageX;
  if (type === "support") return LifeBuoy;
  if (type === "subscription") return CreditCard;
  if (type === "staff") return UserRound;
  if (type === "security") return ShieldAlert;
  return Info;
};

const severityClasses: Record<NotificationSeverity, string> = {
  info: "bg-blue-50 text-blue-700 ring-blue-600/10",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/10",
  critical: "bg-red-50 text-red-700 ring-red-600/10",
};

function Notifications() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [type, setType] = useState<"" | NotificationType>("");
  const [severity, setSeverity] = useState<"" | NotificationSeverity>("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] =
    useState<NotificationResponse["pagination"]>({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    params.set("page", String(page));
    params.set("limit", "20");
    params.set("status", status);

    if (type) params.set("type", type);
    if (severity) params.set("severity", severity);

    return params.toString();
  }, [page, status, type, severity]);

  const loadNotifications = async (silent = false) => {
    if (!token) {
      navigate("/");
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError("");

      const [listResponse, countResponse] = await Promise.all([
        fetch(`/api/notifications?${queryString}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch("/api/notifications/unread-count", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      if (!listResponse.ok || !countResponse.ok) {
        throw new Error("Failed to load notifications");
      }

      const listData =
        (await listResponse.json()) as NotificationResponse;

      const countData =
        (await countResponse.json()) as {
          unreadCount: number;
        };

      setNotifications(listData.notifications || []);
      setPagination(listData.pagination);
      setUnreadCount(Number(countData.unreadCount || 0));
    } catch (loadError) {
      console.error("Load notifications error:", loadError);
      setError(
        "We couldn't load your notifications. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [queryString]);

  const markAsRead = async (
    notification: NotificationItem,
    navigateAfter = false
  ) => {
    if (!token) return;

    if (!notification.isRead) {
      try {
        const response = await fetch(
          `/api/notifications/${notification.id}/read`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to mark notification as read");
        }

        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, isRead: true }
              : item
          )
        );

        setUnreadCount((current) => Math.max(0, current - 1));

        if (status === "unread") {
          await loadNotifications(true);
        }
      } catch (markError) {
        console.error("Mark notification read error:", markError);
        return;
      }
    }

    if (navigateAfter && notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const markAllAsRead = async () => {
    if (!token || unreadCount === 0) return;

    try {
      const response = await fetch(
        "/api/notifications/read-all",
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to mark all notifications as read");
      }

      setUnreadCount(0);

      if (status === "unread") {
        await loadNotifications(true);
      } else {
        setNotifications((current) =>
          current.map((item) => ({
            ...item,
            isRead: true,
          }))
        );
      }
    } catch (markError) {
      console.error("Mark all notifications read error:", markError);
    }
  };

  const changeStatus = (nextStatus: "all" | "unread" | "read") => {
    setPage(1);
    setStatus(nextStatus);
  };

  const emptyTitle =
    status === "unread"
      ? "No unread notifications"
      : status === "read"
        ? "No read notifications"
        : "No notifications yet";

  const emptyMessage =
    status === "unread"
      ? "You're all caught up. New alerts will appear here."
      : status === "read"
        ? "Notifications you have read will appear here."
        : "Important business alerts will appear here as activity happens.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#246BFD]/10 text-[#246BFD]">
              <Bell size={22} />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#071827]">
                Notifications
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Stay updated on important activity across your business.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadNotifications(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#246BFD] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E5CE0] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CheckCheck size={17} />
            Mark all as read
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total
          </p>
          <p className="mt-2 text-2xl font-bold text-[#071827]">
            {status === "all" && !type && !severity
              ? pagination.total
              : pagination.total}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Matching current filters
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Unread
          </p>
          <p className="mt-2 text-2xl font-bold text-[#246BFD]">
            {unreadCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Need your attention
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Current page
          </p>
          <p className="mt-2 text-2xl font-bold text-[#071827]">
            {pagination.page}
            <span className="text-base font-medium text-slate-400">
              {" "}
              / {pagination.totalPages}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {pagination.total} result{pagination.total === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto">
              {(["all", "unread", "read"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => changeStatus(item)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition sm:flex-none ${
                    status === item
                      ? "bg-white text-[#071827] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Filter
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  value={type}
                  onChange={(event) => {
                    setPage(1);
                    setType(event.target.value as "" | NotificationType);
                  }}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/10 sm:w-44"
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={severity}
                onChange={(event) => {
                  setPage(1);
                  setSeverity(
                    event.target.value as "" | NotificationSeverity
                  );
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/10 sm:w-44"
              >
                {severityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="text-center">
              <RefreshCw
                size={24}
                className="mx-auto animate-spin text-[#246BFD]"
              />
              <p className="mt-3 text-sm text-slate-500">
                Loading notifications...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex min-h-[320px] items-center justify-center px-6">
            <div className="text-center">
              <p className="text-sm font-medium text-red-600">
                {error}
              </p>
              <button
                type="button"
                onClick={() => loadNotifications()}
                className="mt-3 rounded-xl bg-[#246BFD] px-4 py-2 text-sm font-medium text-white"
              >
                Try again
              </button>
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Bell size={22} />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-800">
                {emptyTitle}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                {emptyMessage}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const Icon = getNotificationIcon(notification.type);

              return (
                <div
                  key={notification.id}
                  className={`group flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50/80 sm:flex-row sm:items-start sm:px-5 ${
                    notification.isRead
                      ? "bg-white"
                      : "bg-[#246BFD]/[0.025]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => markAsRead(notification, true)}
                    className="flex min-w-0 flex-1 gap-3 text-left"
                  >
                    <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Icon size={18} />

                      {!notification.isRead && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#246BFD] ring-2 ring-white" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`text-sm ${
                            notification.isRead
                              ? "font-medium text-slate-700"
                              : "font-semibold text-slate-900"
                          }`}
                        >
                          {notification.title}
                        </h3>

                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-500">
                          {notification.type}
                        </span>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset ${severityClasses[notification.severity]}`}
                        >
                          {notification.severity}
                        </span>
                      </div>

                      <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-500">
                        {notification.message}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                        <span title={formatDateTime(notification.createdAt)}>
                          {formatRelativeTime(notification.createdAt)}
                        </span>

                        {notification.branch?.name && (
                          <>
                            <span>•</span>
                            <span>{notification.branch.name}</span>
                          </>
                        )}

                        {notification.actionUrl && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-[#246BFD]">
                              Open details
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  {!notification.isRead && (
                    <button
                      type="button"
                      onClick={() => markAsRead(notification)}
                      className="ml-[52px] inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#246BFD] transition hover:bg-[#246BFD]/[0.07] sm:ml-0"
                    >
                      <Check size={14} />
                      Mark read
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && pagination.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-500">
              Page {pagination.page} of {pagination.totalPages} •{" "}
              {pagination.total} notification
              {pagination.total === 1 ? "" : "s"}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.hasPreviousPage}
                onClick={() =>
                  setPage((current) => Math.max(1, current - 1))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={15} />
                Previous
              </button>

              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;
