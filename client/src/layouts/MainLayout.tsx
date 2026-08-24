import { useState } from "react";
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
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
} from "lucide-react";

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const mainNavigation = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Products",
      path: "/products",
      icon: Package,
    },
    {
      name: "Inventory",
      path: "/inventory",
      icon: Boxes,
    },
    {
      name: "Sales",
      path: "/sales",
      icon: ShoppingCart,
    },
  ];

  const managementNavigation = [
    {
      name: "Customers",
      path: "/customers",
      icon: Users,
    },
    {
      name: "Suppliers",
      path: "/suppliers",
      icon: Truck,
    },
    {
      name: "Expenses",
      path: "/expenses",
      icon: Wallet,
    },
  ];

  const analyticsNavigation = [
    {
      name: "Reports",
      path: "/reports",
      icon: BarChart3,
    },
  ];

  const systemNavigation = [
    {
      name: "Settings",
      path: "/settings",
      icon: Settings,
    },
  ];

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const renderNavigation = (
    title: string,
    items: typeof mainNavigation
  ) => {
    return (
      <div className="mb-6">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>

        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
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
    <div className="min-h-screen bg-slate-100">

      {/* Mobile background overlay */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-white transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >

        {/* Logo */}
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-5">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">
              IP
            </div>

            <div>
              <h1 className="text-lg font-bold">
                Invent POS
              </h1>

              <p className="text-xs text-slate-400">
                Business Management
              </p>
            </div>

          </div>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={closeSidebar}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>

        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-6">

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
        <div className="border-t border-slate-800 p-4">

          <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-800/60 p-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold">
              AD
            </div>

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-medium text-white">
                Admin User
              </p>

              <p className="truncate text-xs text-slate-400">
                Administrator
              </p>

            </div>

          </div>

          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-400"
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">

          {/* Left side */}
          <div className="flex items-center gap-3">

            {/* Mobile menu */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
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

            {/* Notification */}
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <Bell size={20} />

              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            {/* User */}
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-slate-50"
            >

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                AD
              </div>

              <div className="hidden text-left sm:block">

                <p className="text-sm font-medium text-slate-800">
                  Admin User
                </p>

                <p className="text-xs text-slate-500">
                  Administrator
                </p>

              </div>

              <ChevronDown
                size={16}
                className="hidden text-slate-400 sm:block"
              />

            </button>

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