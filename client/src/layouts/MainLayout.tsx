import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";


import {
  Outlet,
  NavLink,
} from "react-router-dom";

import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Users,
  Truck,
  Wallet,
  BarChart3,
  ShieldCheck,
  Headphones,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
  CheckCheck,
  PackageX,
  LifeBuoy,
  CreditCard,
  UserRound,
  ShieldAlert,
  Info,
  MapPin,
} from "lucide-react";

type EntitlementValue = string | number | boolean | null;


type NotificationItem = {
  id: number;
  userId: number | null;
  branch: {
    id: number;
    name: string;
    code: string | null;
  } | null;
  type: "inventory" | "support" | "subscription" | "staff" | "security" | "system";
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationListResponse = {
  notifications: NotificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

const formatNotificationTime = (value: string) => {
  if (!value) return "";

  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

type EntitlementResponse = {
  plan: {
    id: number;
    name: string;
    code: string;
  };
  features: Record<string, EntitlementValue>;
};

function MainLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState("");

  const [entitlements, setEntitlements] =
    useState<EntitlementResponse | null>(null);
  const [entitlementsLoading, setEntitlementsLoading] = useState(true);


  

  const storedUser = localStorage.getItem("user");

const user = storedUser
  ? JSON.parse(storedUser)
  : null;

  const userRole = String(user?.role || "").toLowerCase();

  useEffect(() => {
    let cancelled = false;

    const loadEntitlements = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (!cancelled) {
          setEntitlements(null);
          setEntitlementsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/entitlements", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load subscription entitlements");
        }

        const data = (await response.json()) as EntitlementResponse;

        if (!cancelled) {
          setEntitlements(data);
        }
      } catch (error) {
        console.error("Load subscription entitlements error:", error);

        if (!cancelled) {
          setEntitlements(null);
        }
      } finally {
        if (!cancelled) {
          setEntitlementsLoading(false);
        }
      }
    };

    loadEntitlements();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadNotifications = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationsLoading(false);
      return;
    }

    try {
      setNotificationError("");

      const [listResponse, countResponse] = await Promise.all([
        fetch("/api/notifications?limit=6", {
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
        (await listResponse.json()) as NotificationListResponse;

      const countData =
        (await countResponse.json()) as {
          unreadCount: number;
        };

      setNotifications(listData.notifications || []);
      setUnreadCount(Number(countData.unreadCount || 0));
    } catch (error) {
      console.error("Load notifications error:", error);
      setNotificationError("Unable to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    const handleNotificationRefresh = () => {
      loadNotifications();
    };

    window.addEventListener(
      "invent-pos:notifications-refresh",
      handleNotificationRefresh
    );

    const interval = window.setInterval(() => {
      loadNotifications();
    }, 60000);

    return () => {
      window.removeEventListener(
        "invent-pos:notifications-refresh",
        handleNotificationRefresh
      );
      window.clearInterval(interval);
    };
  }, []);

  const markNotificationAsRead = async (
    notification: NotificationItem
  ) => {
    const token = localStorage.getItem("token");

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
      } catch (error) {
        console.error("Mark notification read error:", error);
      }
    }

    setNotificationOpen(false);

    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const markAllNotificationsAsRead = async () => {
    const token = localStorage.getItem("token");

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

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          isRead: true,
        }))
      );

      setUnreadCount(0);
    } catch (error) {
      console.error("Mark all notifications read error:", error);
    }
  };

  const notificationIcon = (type: NotificationItem["type"]) => {
    if (type === "inventory") return PackageX;
    if (type === "support") return LifeBuoy;
    if (type === "subscription") return CreditCard;
    if (type === "staff") return UserRound;
    if (type === "security") return ShieldAlert;
    return Info;
  };

  const hasEntitlement = (featureKey: string) => {
    if (!entitlements) {
      return false;
    }

    const value = entitlements.features?.[featureKey];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value > 0;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      return ["included", "true", "yes", "enabled", "1"].includes(
        normalized
      );
    }

    return false;
  };


  const initials = user?.name
  ? user.name
      .split(" ")
      .map((name: string) => name[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  : "US";

const handleLogout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  navigate("/");
};

  const mainNavigation = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "manager", "cashier"],
    },
    {
      name: "Products",
      path: "/products",
      icon: Package,
      roles: ["admin", "manager", "cashier"],
    },
    {
      name: "Inventory",
      path: "/inventory",
      icon: Boxes,
      roles: ["admin", "manager"],
    },
    {
      name: "Sales",
      path: "/sales",
      icon: ShoppingCart,
      roles: ["admin", "manager", "cashier"],
    },
  ];

  const managementNavigation = [
    {
      name: "Customers",
      path: "/customers",
      icon: Users,
      roles: ["admin", "manager", "cashier"],
      entitlement: "customer_expense_tracking",
    },
    {
      name: "Suppliers",
      path: "/suppliers",
      icon: Truck,
      roles: ["admin", "manager", "cashier"],
    },
    {
      name: "Expenses",
      path: "/expenses",
      icon: Wallet,
      roles: ["admin", "manager"],
      entitlement: "customer_expense_tracking",
    },
    {
      name: "Branches",
      path: "/branches",
      icon: MapPin,
      roles: ["admin", "manager"],
    },
  ];

  const analyticsNavigation = [
    {
      name: "Reports",
      path: "/reports",
      icon: BarChart3,
      roles: ["admin", "manager"],
    },
    {
      name: "Audit & Analytics",
      path: "/audit-analytics",
      icon: ShieldCheck,
      roles: ["admin", "manager"],
      entitlement: "audit_analytics",
    },
  ];

  const systemNavigation = [
    {
      name: "Support",
      path: "/support",
      icon: Headphones,
      roles: ["admin", "manager", "cashier"],
    },
    {
      name: "Settings",
      path: "/settings",
      icon: Settings,
      roles: ["admin"],
    },
  ];

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const renderNavigation = (
    title: string,
    items: Array<{
      name: string;
      path: string;
      icon: typeof LayoutDashboard;
      roles: string[];
      entitlement?: string;
    }>
  ) => {
    return (
      <div className="mb-6">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>

        <div className="space-y-1">
          {items
            .filter((item) => {
              if (!item.roles.includes(userRole)) {
                return false;
              }

              if (!item.entitlement) {
                return true;
              }

              if (entitlementsLoading) {
                return false;
              }

              return hasEntitlement(item.entitlement);
            })
            .map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-[#246BFD] text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                  }`
                }
              >
                <Icon size={19} />

                <span>
                  {item.name}
                </span>
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F8FA]">

      {/* Mobile background overlay */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <style>{`
        .invent-sidebar-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.32) transparent;
        }

        .invent-sidebar-scrollbar::-webkit-scrollbar {
          width: 5px;
        }

        .invent-sidebar-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .invent-sidebar-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.28);
          border-radius: 9999px;
        }

        .invent-sidebar-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.5);
        }
      `}</style>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#071827] text-white transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >

        {/* Logo */}
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">

          <div className="flex items-center gap-3">

            <img
              src="/brand/invent-pos-logo-reversed-transparent.svg"
              alt="Invent POS"
              className="h-11 w-auto max-w-[168px]"
            />

          </div>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={closeSidebar}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white/[0.07] hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>

        </div>

        {/* Navigation */}
        <nav className="invent-sidebar-scrollbar flex-1 overflow-y-auto px-4 py-6">

          {renderNavigation(
            "Main",
            mainNavigation
          )}

          {renderNavigation(
            "Management",
            managementNavigation
          )}

          {renderNavigation(
            "Analytics",
            analyticsNavigation
          )}

          {renderNavigation(
            "System",
            systemNavigation
          )}

        </nav>

        {/* User / Logout */}
        <div className="border-t border-white/10 p-4">

          <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.06] p-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#246BFD] text-sm font-semibold">
              {initials}
            </div>

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-medium text-white">
                {user?.name || "User"}
              </p>

              <p className="truncate text-xs text-slate-400">
                {user?.role || "User"}
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={19} />

            <span>
              Logout
            </span>
          </button>

        </div>

      </aside>

      {/* Main application */}
      <div className="min-h-screen lg:pl-64">

        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">

          {/* Left side */}
          <div className="flex items-center gap-3">

            {/* Mobile menu */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl p-2 text-slate-600 transition hover:bg-[#F5F8FA] lg:hidden"
            >
              <Menu size={22} />
            </button>

            <div>
              <h2 className="text-sm font-semibold text-slate-800 sm:text-base">
                Invent POS
              </h2>

              <p className="hidden text-xs text-slate-500 sm:block">
                Manage your business
              </p>
            </div>

          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationOpen(!notificationOpen);
                  setProfileOpen(false);
                  if (!notificationOpen) {
                    loadNotifications();
                  }
                }}
                className="relative rounded-xl p-2 text-slate-500 transition hover:bg-[#F5F8FA] hover:text-[#071827]"
                aria-label="Notifications"
              >
                <Bell size={20} />

                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] max-w-[390px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(7,24,39,0.16)]">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Notifications
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {unreadCount > 0
                          ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                          : "You're all caught up"}
                      </p>
                    </div>

                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsAsRead}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[#246BFD] transition hover:bg-[#246BFD]/[0.07]"
                      >
                        <CheckCheck size={15} />
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[420px] overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-500">
                        Loading notifications...
                      </div>
                    ) : notificationError ? (
                      <div className="px-4 py-10 text-center">
                        <p className="text-sm text-red-600">
                          {notificationError}
                        </p>
                        <button
                          type="button"
                          onClick={loadNotifications}
                          className="mt-2 text-xs font-medium text-[#246BFD]"
                        >
                          Try again
                        </button>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="px-6 py-12 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Bell size={20} />
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-700">
                          No notifications yet
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Important business alerts will appear here.
                        </p>
                      </div>
                    ) : (
                      notifications.map((notification) => {
                        const NotificationIcon =
                          notificationIcon(notification.type);

                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() =>
                              markNotificationAsRead(notification)
                            }
                            className={`relative flex w-full gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-[#F5F8FA] ${
                              notification.isRead
                                ? "bg-white"
                                : "bg-[#246BFD]/[0.035]"
                            }`}
                          >
                            {!notification.isRead && (
                              <span className="absolute right-3 top-4 h-2 w-2 rounded-full bg-[#246BFD]" />
                            )}

                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                              <NotificationIcon size={17} />
                            </div>

                            <div className="min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2">
                                <p
                                  className={`truncate text-sm ${
                                    notification.isRead
                                      ? "font-medium text-slate-700"
                                      : "font-semibold text-slate-900"
                                  }`}
                                >
                                  {notification.title}
                                </p>

                                {notification.severity === "critical" && (
                                  <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600">
                                    Critical
                                  </span>
                                )}
                              </div>

                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                {notification.message}
                              </p>

                              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                                <span>
                                  {formatNotificationTime(
                                    notification.createdAt
                                  )}
                                </span>

                                {notification.branch?.name && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate">
                                      {notification.branch.name}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50/70 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationOpen(false);
                        navigate("/notifications");
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-center text-sm font-medium text-[#246BFD] transition hover:bg-[#246BFD]/[0.07]"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            {/* User */}
            <div className="relative">

  <button
    type="button"
    onClick={() => {
      setProfileOpen(!profileOpen);
      setNotificationOpen(false);
    }}
    className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-[#F5F8FA]"
  >

    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#246BFD] text-sm font-semibold text-white">
      {initials}
    </div>

    <div className="hidden text-left sm:block">

      <p className="text-sm font-medium text-slate-800">
        {user?.name || "User"}
      </p>

      <p className="text-xs capitalize text-slate-500">
        {user?.role || "User"}
      </p>

    </div>

    <ChevronDown
      size={16}
      className={`hidden text-slate-400 transition-transform sm:block ${
        profileOpen ? "rotate-180" : ""
      }`}
    />

  </button>

  {/* Profile dropdown */}
  {profileOpen && (
    <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(7,24,39,0.16)]">

      {/* User information */}
      <div className="border-b border-slate-200 p-4">

        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#246BFD] font-semibold text-white">
            {initials}
          </div>

          <div className="min-w-0">

            <p className="truncate text-sm font-semibold text-slate-800">
              {user?.name || "User"}
            </p>

            <p className="truncate text-xs text-slate-500">
              {user?.email || ""}
            </p>

          </div>

        </div>

        <div className="mt-3">
          <span className="inline-flex rounded-full bg-[#246BFD]/[0.08] px-2.5 py-1 text-xs font-medium capitalize text-[#246BFD] ring-1 ring-inset ring-[#246BFD]/15">
            {user?.role || "User"}
          </span>
        </div>

      </div>

      {/* Menu */}
      <div className="p-2">

        <button
          type="button"
          onClick={() => {
            setProfileOpen(false);
            navigate("/settings");
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-[#F5F8FA]"
        >
          <Settings size={18} />

          Account Settings
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50"
        >
          <LogOut size={18} />

          Sign Out
        </button>

      </div>

    </div>
  )}

</div>

          </div>

        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">

          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>

        </main>

      </div>

    </div>
  );
}

export default MainLayout;