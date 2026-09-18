import { useState } from "react";
import {
  BarChart3,
  Building2,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

type NavigationItem = {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  match: (pathname: string) => boolean;
};

function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] =
    useState(false);

  const navigation: NavigationItem[] = [
    {
      label: "Overview",
      icon: LayoutDashboard,
      path: "/super-admin/dashboard",
      match: (pathname) =>
        pathname === "/super-admin/dashboard",
    },
    {
      label: "Organizations",
      icon: Building2,
      path: "/super-admin/organizations",
      match: (pathname) =>
        pathname.startsWith(
          "/super-admin/organizations"
        ),
    },
    {
      label: "Billing & Revenue",
      icon: BarChart3,
      path: "/super-admin/billing",
      match: (pathname) =>
        pathname.startsWith("/super-admin/billing"),
    },
    {
      label: "Plans",
      icon: PackageCheck,
      path: "/super-admin/plans",
      match: (pathname) =>
        pathname.startsWith("/super-admin/plans"),
    },
    {
      label: "Support Center",
      icon: Headphones,
      path: "/super-admin/support",
      match: (pathname) =>
        pathname.startsWith("/super-admin/support"),
    },
  ];

  const logout = () => {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdminUser");
    navigate("/super-admin/login", {
      replace: true,
    });
  };

  const handleNavigation = (path: string) => {
    setMobileNavOpen(false);

    navigate(path);
  };

  const pageTitle = (() => {
    const pathname = location.pathname;

    if (pathname === "/super-admin/dashboard") {
      return "Overview";
    }

    if (pathname === "/super-admin/organizations") {
      return "Organizations";
    }

    if (
      pathname.startsWith(
        "/super-admin/organizations/"
      )
    ) {
      return "Organization Details";
    }

    if (
      pathname.startsWith("/super-admin/billing")
    ) {
      return "Billing & Revenue";
    }

    if (
      pathname.startsWith("/super-admin/plans")
    ) {
      return "Plans";
    }

    if (
      pathname.startsWith("/super-admin/support")
    ) {
      return "Support Center";
    }

    return "Platform Administration";
  })();

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
          mobileNavOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div className="flex h-[84px] items-center justify-between border-b border-white/10 px-6">
          <button
            type="button"
            onClick={() =>
              handleNavigation(
                "/super-admin/dashboard"
              )
            }
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/30">
              <ShieldCheck size={22} />
            </div>

            <div>
              <p className="text-[17px] font-bold tracking-tight">
                Invent POS
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                Platform Admin
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setMobileNavOpen(false)
            }
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Platform
          </p>

          <nav className="space-y-1.5">
            {navigation.map(
              ({
                label,
                icon: Icon,
                path,
                match,
              }) => {
                const active = match(
                  location.pathname
                );

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      handleNavigation(path)
                    }
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition ${
                      active
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20"
                        : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                );
              }
            )}
          </nav>
        </div>

        <div className="mx-4 mb-4 mt-auto rounded-2xl border border-white/10 bg-white/[0.045] p-4">
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
            Core administration services are
            available.
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
          <div className="flex h-[72px] items-center px-5 lg:px-8 xl:px-10">
            <button
              type="button"
              onClick={() =>
                setMobileNavOpen(true)
              }
              className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>

            <div>
              <p className="text-sm font-bold text-[#0B1F33]">
                {pageTitle}
              </p>
              <p className="hidden text-xs text-slate-400 sm:block">
                Invent POS platform administration
              </p>
            </div>
          </div>
        </header>

        <div className="min-h-[calc(100vh-72px)]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default SuperAdminLayout;
