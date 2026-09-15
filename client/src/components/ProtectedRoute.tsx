import {
  useEffect,
  useState,
} from "react";
import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

const routeRoles: Record<string, string[]> = {
  "/dashboard": ["admin", "manager", "cashier"],
  "/products": ["admin", "manager", "cashier"],
  "/inventory": ["admin", "manager"],
  "/sales": ["admin", "manager", "cashier"],
  "/customers": ["admin", "manager", "cashier"],
  "/suppliers": ["admin", "manager", "cashier"],
  "/expenses": ["admin", "manager"],
  "/branches": ["admin", "manager"],
  "/reports": ["admin", "manager"],
  "/settings": ["admin"],
};

const routeEntitlements: Record<string, string> = {
  "/customers": "customer_expense_tracking",
  "/expenses": "customer_expense_tracking",
};

type EntitlementValue =
  | string
  | number
  | boolean
  | null;

type EntitlementResponse = {
  plan: {
    id: number;
    name: string;
    code: string;
  };
  features: Record<string, EntitlementValue>;
};

function ProtectedRoute() {
  const location = useLocation();

  const token = localStorage.getItem("token");
  const storedUser = localStorage.getItem("user");

  const [entitlements, setEntitlements] =
    useState<EntitlementResponse | null>(null);
  const [entitlementsLoading, setEntitlementsLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadEntitlements = async () => {
      if (!token) {
        if (!cancelled) {
          setEntitlements(null);
          setEntitlementsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(
          "/api/auth/entitlements",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load subscription entitlements"
          );
        }

        const data =
          (await response.json()) as EntitlementResponse;

        if (!cancelled) {
          setEntitlements(data);
        }
      } catch (error) {
        console.error(
          "Load protected-route entitlements error:",
          error
        );

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
  }, [token]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  let user: {
    role?: string;
  } | null = null;

  try {
    user = storedUser
      ? JSON.parse(storedUser)
      : null;
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    return <Navigate to="/" replace />;
  }

  if (!user?.role) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    return <Navigate to="/" replace />;
  }

  const userRole = String(user.role).toLowerCase();

  const matchedRoute = Object.keys(routeRoles)
    .sort((a, b) => b.length - a.length)
    .find(
      (path) =>
        location.pathname === path ||
        location.pathname.startsWith(`${path}/`)
    );

  if (matchedRoute) {
    const allowedRoles = routeRoles[matchedRoute];

    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  const matchedEntitlementRoute = Object.keys(
    routeEntitlements
  )
    .sort((a, b) => b.length - a.length)
    .find(
      (path) =>
        location.pathname === path ||
        location.pathname.startsWith(`${path}/`)
    );

  if (matchedEntitlementRoute) {
    if (entitlementsLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-sm">
            Checking subscription access...
          </div>
        </div>
      );
    }

    const featureKey =
      routeEntitlements[matchedEntitlementRoute];

    const value =
      entitlements?.features?.[featureKey];

    let included = false;

    if (typeof value === "boolean") {
      included = value;
    } else if (typeof value === "number") {
      included = value > 0;
    } else if (typeof value === "string") {
      included = [
        "included",
        "true",
        "yes",
        "enabled",
        "1",
      ].includes(value.trim().toLowerCase());
    }

    if (!included) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Outlet />;
}

export default ProtectedRoute;
